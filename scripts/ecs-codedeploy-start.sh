#!/usr/bin/env bash
# OOS CodeDeploy 启动脚本：在 ECS 上执行 ecs-promote（与 docs/cloud-environment.md 一致）。
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:$PATH

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
