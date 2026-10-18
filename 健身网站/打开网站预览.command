#!/bin/bash
# 双击这个文件 → 自动检查预览服务有没有在跑，没跑就拉起来，然后打开浏览器
cd "$(dirname "$0")"
export PATH="/Users/a1-6/.workbuddy/binaries/node/versions/22.22.2/bin:/Users/a1-6/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
URL="http://localhost:5173"

if ! curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "预览服务没在跑，正在启动…"
  nohup node tools/preview.js 5173 > /tmp/lbgym-preview.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if curl -s -o /dev/null --max-time 2 "$URL"; then break; fi
  done
fi

if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "✅ 已就绪，正在打开浏览器…"
  open "$URL"
else
  echo "❌ 启动失败。把下面这段发给我："
  tail -12 /tmp/lbgym-preview.log
fi
echo ""
echo "（这个窗口可以关掉，网站会继续跑）"
