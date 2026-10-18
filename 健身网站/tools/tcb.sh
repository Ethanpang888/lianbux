#!/bin/bash
# tools/tcb.sh —— 调用 CloudBase CLI（腾讯云开发命令行）的包装脚本
#
# 因为项目里的 Node 与 CLI 都装在 isolated workspace 里，直接跑 `tcb` 找不到，
# 所以统一走这个脚本：./tools/tcb.sh fn list -e cloud1-xxxx
#
# 首次使用需要登录一次：./tools/tcb.sh login --flow device
# （会给出一个链接和用户码，在浏览器里授权即可；凭证由 CLI 自己保存）
#
# node 版本目录会随升级变（22.22.2 → 22.22.2-6 …），动态取最新一个，别写死。
set -e
export NODE_PATH=/Users/a1-6/.workbuddy/binaries/node/workspace/node_modules
NBIN=$(ls -d /Users/a1-6/.workbuddy/binaries/node/versions/*/bin/node 2>/dev/null | sort -V | tail -1)
if [ -z "$NBIN" ]; then
  echo "⛔ 找不到 managed node（/Users/a1-6/.workbuddy/binaries/node/versions/*/bin/node）" >&2
  exit 1
fi
exec "$NBIN" /Users/a1-6/.workbuddy/binaries/node/workspace/node_modules/.bin/tcb "$@"
