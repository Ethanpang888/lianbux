#!/bin/bash
# tools/shot.sh —— 给本地预览站截图（做视觉检查用）
#
# 用法：
#   ./tools/shot.sh home               # 截首页
#   ./tools/shot.sh diet 1400          # 截饮食页，高 1400
#   ./tools/shot.sh home,diet,today    # 一次截多页
#
# 为什么要有这个脚本（踩过的坑）：
#   1. macOS 上 Chrome headless 的**最小视口宽是 500px**。传 --window-size=390 只会把
#      500px 的内容裁成 390px 的图，看起来像"右侧被切了"——是假警报。所以这里固定 500。
#   2. Chrome headless=new 截完图**不会自己退出**，必须 pkill，但图在那之前已经写好了。
#   3. Chrome 需要跳出沙箱才能跑（在 CI/沙箱环境里调用时记得放开）。
set -u

PORT="${PORT:-5173}"
W="${W:-500}"
H="${2:-1400}"
OUT_DIR="$(cd "$(dirname "$0")/../.." && pwd)/.workbuddy/screenshots"   # 项目根（健身知识库）下
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$OUT_DIR"
[ -x "$CHROME" ] || { echo "❌ 找不到 Chrome：$CHROME"; exit 1; }

# 起预览服务（已在跑就复用）
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "→ 启动预览服务 :$PORT"
  ( cd "$(dirname "$0")/.." && node tools/preview.js "$PORT" >/tmp/lbgym-preview.log 2>&1 & )
  sleep 2
fi

IFS=',' read -ra PAGES <<< "${1:-home}"
for p in "${PAGES[@]}"; do
  p="$(echo "$p" | xargs)"
  [ -z "$p" ] && continue
  PROFILE="/tmp/lbgym-shot-$p"
  rm -rf "$PROFILE"; rm -f "$OUT_DIR/$p.png"
  ( "$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run \
      --user-data-dir="$PROFILE" --screenshot="$OUT_DIR/$p.png" \
      --window-size="$W,$H" --hide-scrollbars --virtual-time-budget=4000 \
      "http://localhost:$PORT/#/$p" >/dev/null 2>&1 & )
  sleep 8
  pkill -f "$PROFILE" 2>/dev/null || true
  if [ -f "$OUT_DIR/$p.png" ]; then
    echo "✅ $p.png  ($(du -h "$OUT_DIR/$p.png" | cut -f1))  →  $OUT_DIR/$p.png"
  else
    echo "❌ $p 截图失败"
  fi
done
