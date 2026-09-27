#!/usr/bin/env bash
# 类 EdgeOne：新版本解压到 releases/<id>，探活通过后才原子切换 current。
# 失败时删除本轮 release，current / 线上进程不动。
#
# 用法（在 ECS 上）：
#   RELEASE_TGZ=/path/to/cothread-release.tgz bash scripts/ecs-promote.sh
# 或已解压：
#   RELEASE_DIR=/opt/cothread/releases/20260101T120000Z bash scripts/ecs-promote.sh
set -euo pipefail
export PATH=/usr/local/bin:$PATH

ROOT="${COTHREAD_ROOT:-/opt/cothread}"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
SHARED_ENV="${COTHREAD_ENV_FILE:-$ROOT/.env}"
SHARED_LOCAL="$ROOT/.local"
LOG_DIR="$ROOT/logs"
PROD_PORT="${COTHREAD_PORT:-3100}"
HEALTH_PORT="${COTHREAD_HEALTH_PORT:-3110}"
KEEP_RELEASES="${COTHREAD_KEEP_RELEASES:-3}"
HEALTH_TIMEOUT_SEC="${COTHREAD_HEALTH_TIMEOUT_SEC:-90}"

mkdir -p "$RELEASES" "$LOG_DIR" "$SHARED_LOCAL/sandboxes"
chmod 755 "$ROOT" "$RELEASES" "$LOG_DIR" "$SHARED_LOCAL" "$SHARED_LOCAL/sandboxes" 2>/dev/null || true

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "缺少共享环境文件：$SHARED_ENV" >&2
  exit 1
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="${RELEASE_DIR:-}"

cleanup_failed_release() {
  local dir="$1"
  if [[ -n "$dir" && -d "$dir" && "$dir" != "$(readlink -f "$CURRENT" 2>/dev/null || true)" ]]; then
    echo "部署失败，删除未上线 release：$dir"
    rm -rf "$dir"
  fi
}

if [[ -z "$RELEASE_DIR" ]]; then
  TGZ="${RELEASE_TGZ:-}"
  if [[ -z "$TGZ" || ! -f "$TGZ" ]]; then
    echo "请设置 RELEASE_TGZ=产物.tar.gz，或 RELEASE_DIR=已解压目录" >&2
    exit 1
  fi
  RELEASE_DIR="$RELEASES/$release_id"
  mkdir -p "$RELEASE_DIR"
  echo "解压 $TGZ -> $RELEASE_DIR"
  tar -xzf "$TGZ" -C "$RELEASE_DIR"
  # 若包内自带顶层目录，拍平一层
  if [[ ! -f "$RELEASE_DIR/package.json" ]]; then
    inner="$(find "$RELEASE_DIR" -mindepth 1 -maxdepth 1 -type d | head -1 || true)"
    if [[ -n "$inner" && -f "$inner/package.json" ]]; then
      shopt -s dotglob
      mv "$inner"/* "$RELEASE_DIR"/
      rmdir "$inner" 2>/dev/null || rm -rf "$inner"
      shopt -u dotglob
    fi
  fi
fi

if [[ ! -f "$RELEASE_DIR/package.json" || ! -f "$RELEASE_DIR/server/index.js" ]]; then
  echo "release 不完整：$RELEASE_DIR" >&2
  cleanup_failed_release "$RELEASE_DIR"
  exit 1
fi

ln -sfn "$SHARED_ENV" "$RELEASE_DIR/.env"
if [[ ! -e "$RELEASE_DIR/.local" ]]; then
  ln -sfn "$SHARED_LOCAL" "$RELEASE_DIR/.local"
fi

echo "安装生产依赖…"
(
  cd "$RELEASE_DIR"
  npm ci --omit=dev
  if [[ ! -d dist ]]; then
    echo "产物缺少 dist，拒绝上线（请在本地 npm run build 后再打包）" >&2
    exit 1
  fi
  # Chromium 首次较慢；失败不阻断 API 探活，但记日志
  npx playwright install chromium >/tmp/cothread-playwright.log 2>&1 \
    || echo "警告：playwright chromium 安装失败，详见 /tmp/cothread-playwright.log"
)

probe_pid=""
stop_probe() {
  if [[ -n "${probe_pid:-}" ]] && kill -0 "$probe_pid" 2>/dev/null; then
    kill "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  probe_pid=""
}
trap 'stop_probe' EXIT

echo "在端口 $HEALTH_PORT 探活新版本（不影响 $PROD_PORT）…"
(
  cd "$RELEASE_DIR"
  PORT="$HEALTH_PORT" nohup node --env-file-if-exists=.env server/index.js --production \
    >"$LOG_DIR/release-${release_id}.log" 2>&1 &
  echo $! >"$LOG_DIR/release-${release_id}.pid"
)
probe_pid="$(cat "$LOG_DIR/release-${release_id}.pid")"

ok=0
for _ in $(seq 1 "$HEALTH_TIMEOUT_SEC"); do
  if curl -fsS "http://127.0.0.1:${HEALTH_PORT}/api/health" >/tmp/cothread-health.json 2>/dev/null; then
    if grep -q '"status":"ok"' /tmp/cothread-health.json 2>/dev/null \
      || grep -q '"status": "ok"' /tmp/cothread-health.json 2>/dev/null; then
      ok=1
      break
    fi
  fi
  if ! kill -0 "$probe_pid" 2>/dev/null; then
    echo "探活进程已退出，日志：$LOG_DIR/release-${release_id}.log" >&2
    tail -n 80 "$LOG_DIR/release-${release_id}.log" >&2 || true
    cleanup_failed_release "$RELEASE_DIR"
    exit 1
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "探活超时（${HEALTH_TIMEOUT_SEC}s），正式版本未切换。" >&2
  tail -n 80 "$LOG_DIR/release-${release_id}.log" >&2 || true
  stop_probe
  cleanup_failed_release "$RELEASE_DIR"
  exit 1
fi

echo "探活通过：$(cat /tmp/cothread-health.json)"
stop_probe

UNIT=/etc/systemd/system/cothread.service
if [[ ! -f "$UNIT" ]]; then
  cat >"$UNIT" <<EOF
[Unit]
Description=CoThread
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/cothread/current
Environment=PATH=/usr/local/bin:/usr/bin
Environment=PORT=${PROD_PORT}
ExecStart=/usr/local/bin/node --env-file-if-exists=.env server/index.js --production
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable cothread.service
fi

echo "原子切换 current -> $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT"
systemctl restart cothread.service

# 切换后确认正式端口
ok=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PROD_PORT}/api/health" >/tmp/cothread-health-prod.json 2>/dev/null; then
    if grep -q '"status":"ok"' /tmp/cothread-health-prod.json 2>/dev/null \
      || grep -q '"status": "ok"' /tmp/cothread-health-prod.json 2>/dev/null; then
      ok=1
      break
    fi
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "切换后正式端口探活失败。current 已指向新版本，请查 journalctl -u cothread。" >&2
  systemctl status cothread --no-pager >&2 || true
  exit 1
fi

# 清理旧 release（保留最近 KEEP_RELEASES 个，且永不删 current）
current_real="$(readlink -f "$CURRENT")"
mapfile -t olds < <(ls -1dt "$RELEASES"/* 2>/dev/null || true)
kept=0
for dir in "${olds[@]:-}"; do
  [[ -d "$dir" ]] || continue
  if [[ "$(readlink -f "$dir")" == "$current_real" ]]; then
    kept=$((kept + 1))
    continue
  fi
  if [[ "$kept" -lt "$KEEP_RELEASES" ]]; then
    kept=$((kept + 1))
    continue
  fi
  echo "清理旧 release：$dir"
  rm -rf "$dir"
done

echo "上线完成：current -> $RELEASE_DIR"
echo "health: $(cat /tmp/cothread-health-prod.json)"
