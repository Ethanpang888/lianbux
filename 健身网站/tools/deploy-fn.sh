#!/bin/bash
# tools/deploy-fn.sh —— 把云函数部署到线上（CloudBase CLI）
#
# 用法：  ./tools/deploy-fn.sh webAuth webApi
#
# 为什么需要这个脚本（踩过的坑）：
#   1. 直接 `tcb fn deploy --dir <函数目录>` 会**报成功但代码没更新**
#      （实测 Code size 完全不变、行为不变、下载下来 grep 还是旧代码）。
#   2. `--dir` 的路径会被拼到 cwd 上；如果 cwd 是个大目录，CLI 还会被系统杀掉（OOM）。
#   3. 正确的姿势是：**在一个干净的空目录里放 cloudbaserc.json**，
#      用 `functionRoot: "./cloudfunctions"`（相对路径）指向函数目录（用符号链接即可），
#      并显式带上 `-e <envId>`。
#   4. `--install-dependency true` = 依赖在云端装，上传的包只有代码本身（很小、很快）。
#      实测**不会**清空云上已有的环境变量（部署后用 fn detail 核对过）。
#
# 部署后自检（务必做，否则你不知道有没有真的更新）：
#   ./tools/tcb.sh fn detail <函数名> -e <envId>     # 看 Code size 有没有变、环境变量还在不在
#   然后打一次 HTTP 探针（见 docs/我要做什么-手把手版.md 的排错表）
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KB="$(cd "$ROOT/.." && pwd)/健身小程序"
CF="$KB/cloudfunctions"
ENV_ID="cloud1-d7gtp1mv1bfcc25df"
WORK="/tmp/tcb-deploy-work"

if [ $# -eq 0 ]; then
  echo "用法：$0 <云函数名> [更多云函数名...]"
  echo "可选：$(ls "$CF" | tr '\n' ' ')"
  exit 1
fi

# webApi 的密钥：优先环境变量，否则读本地密钥文件（.auth-secret / .ai-key，各一行、别外传）
# ⚠️ 这两个值必须能拿到 —— envVariables 是整体替换，拿不到就会把线上密钥清空。
read_line() { [ -n "$2" ] && echo "$2" || { [ -f "$ROOT/$1" ] && head -1 "$ROOT/$1" | tr -d '\n' || echo ''; } }
WAPI_AUTH_SECRET=$(read_line .auth-secret "$WAPI_AUTH_SECRET")
WAPI_AI_KEY=$(read_line .ai-key "$WAPI_AI_KEY")
VP_OFFER_ID=$(sed -n 1p "$ROOT/.vp-key" 2>/dev/null | tr -d \n)
VP_APP_KEY=$(sed -n 2p "$ROOT/.vp-key" 2>/dev/null | tr -d \n)
WX_APP_SECRET=$(sed -n 3p "$ROOT/.vp-key" 2>/dev/null | tr -d \n)
VP_TOKEN=$(sed -n 5p "$ROOT/.vp-key" 2>/dev/null | tr -d \n)
if [ "$#" -gt 0 ] && printf '%s\n' "$@" | grep -qx webApi; then
  [ -n "$WAPI_AUTH_SECRET" ] || { echo "⛔ 拿不到 AUTH_SECRET（env 或 .auth-secret），拒绝部署 webApi——envVariables 会整体替换"; exit 1; }
  [ -n "$WAPI_AI_KEY" ] || { echo "⛔ 拿不到 AI_API_KEY（env 或 .ai-key），拒绝部署 webApi"; exit 1; }
fi

# 干净的工作目录：避免 CLI 扫描大目录（会被系统杀掉），也避免 --dir 路径拼接出错
mkdir -p "$WORK"
ln -sfn "$CF" "$WORK/cloudfunctions"

# 生成配置：明确 runtime / handler / 内存，避免 CLI 用"智能推断"改掉线上配置
# ⚠️ webApi 的 envParams 必须带全量环境变量（包括 AUTH_SECRET）——
#    envParams 是整体替换，只写新增项会把 AUTH_SECRET 抹掉、全站登录挂掉（2026-10-14 踩前预防）。
{
  echo '{'
  echo "  \"envId\": \"$ENV_ID\","
  echo '  "functionRoot": "./cloudfunctions",'
  echo '  "functions": ['
  first=1
  for fn in "$@"; do
    [ $first -eq 0 ] && echo '    ,'
    first=0
    # webApi 挂了 AI 顾问（大模型要 20-60 秒），超时给 90；其余保持 20
    timeout=20
    [ "$fn" = "webApi" ] && timeout=90
    printf '    { "name": "%s", "timeout": %s, "runtime": "Nodejs16.13", "handler": "index.main", "installDependency": true, "memorySize": 256' "$fn" "$timeout"
    if [ "$fn" = "webApi" ]; then
      printf ', "envVariables": { "AUTH_SECRET": "%s", "AI_API_KEY": "%s", "AI_MODELS": "%s", "VP_OFFER_ID": "%s", "VP_APP_KEY": "%s", "WX_APP_SECRET": "%s", "VP_TOKEN": "%s" }' \
        "$WAPI_AUTH_SECRET" "$WAPI_AI_KEY" "${WAPI_AI_MODELS:-glm-4.7-flash,glm-4.5-flash,glm-4-flash-250414}" "$VP_OFFER_ID" "$VP_APP_KEY" "$WX_APP_SECRET" "$VP_TOKEN"
    fi
    printf ' }'
    echo ''
  done
  echo '  ]'
  echo '}'
} > "$WORK/cloudbaserc.json"

for fn in "$@"; do
  echo ""
  echo "════ 部署 $fn ════"
  ( cd "$WORK" && "$ROOT/tools/tcb.sh" fn deploy "$fn" -e "$ENV_ID" --force --install-dependency true )
done

echo ""
echo "════ 部署后核对（Code size 应该有变化）════"
for fn in "$@"; do
  "$ROOT/tools/tcb.sh" fn detail "$fn" -e "$ENV_ID" 2>&1 \
    | grep -E "Function name|Code size|Runtime|Modification" \
    | sed 's/^│ *//; s/ *│$//'
  echo ""
done
