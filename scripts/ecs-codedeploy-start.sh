#!/usr/bin/env bash
# OOS CodeDeploy 启动脚本：在 ECS 上执行 ecs-promote（与 docs/engineering/05-cloud-environment.md 一致）。
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:$PATH

# 编译器要求至少 Node 22.22.3；先在独立目录安装，成功后才切换命令。
if ! node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 3))) ? 0 : 1)'; then
  NODE_RUNTIME=/opt/cothread/node-runtime-22.22.3
  npm install --prefix "$NODE_RUNTIME" --no-save --package-lock=false --no-audit --no-fund node@22.22.3
  [ -x "$NODE_RUNTIME/node_modules/node/bin/node" ]
  "$NODE_RUNTIME/node_modules/node/bin/node" --version
  if [ ! -e /usr/local/bin/node.previous ]; then
    cp -a /usr/local/bin/node /usr/local/bin/node.previous
  fi
  ln -sfn "$NODE_RUNTIME/node_modules/node/bin/node" /usr/local/bin/node
  hash -r
fi

PKG="$(find /root /home /tmp /opt "$(pwd)" -maxdepth 2 -type f -name 'cothread-release-*.tgz' 2>/dev/null | sort | tail -1 || true)"
if [ -z "$PKG" ] || [ ! -f "$PKG" ]; then
  echo "找不到 cothread-release-*.tgz" >&2
  exit 1
fi

echo "PKG=$PKG"
TMP="$(mktemp -d)"
tar -xzf "$PKG" -C "$TMP" scripts/ecs-promote.sh
chmod +x "$TMP/scripts/ecs-promote.sh"
COTHREAD_HEALTH_TIMEOUT_SEC="${COTHREAD_HEALTH_TIMEOUT_SEC:-180}" RELEASE_TGZ="$PKG" bash "$TMP/scripts/ecs-promote.sh"
rm -rf "$TMP"
