# AGENTS.md —— 给 Codex 的项目手册（自动加载，改代码前必读）

## 项目

「练不虚」：中医健身产品，**网站 + 微信小程序** 双端共用引擎。
本目录 = 仓库根。`健身小程序/` 与 `健身网站/` 是两个项目，**任何功能改动两端必须同步**。

## 你接手时的当前任务（2026-10-19）

1. **小程序「今日」页与网站「饮食」页不一致**：网站饮食页有「我的饮食参考」引导条 + 大数字 + 圆环进度 + 三列营养 + **四餐按钮行（早餐/午餐/晚餐/加餐）** + 折叠卡；小程序今日页缺四餐按钮行。把小程序对齐网站（保留小程序底部五栏结构：首页/今日/计划/调理/我的——「调理」板块是小程序独有的，不要动它的存在）。
2. **修掉小程序 Console 的 6 个红色报错**（今日打卡页运行时报错，先在开发者工具 Console 定位）。
3. 修完 → 跑测试 → 上线（流程见下）。
4. 用户已授权你全权操作：改代码、调用微信开发者工具 CLI、部署云函数、push GitHub。

## 上线流程（照抄，不要自创）

### 网站
```bash
N=/Users/a1-6/.workbuddy/binaries/node/versions/22.22.2-6/bin/node
T=/Users/a1-6/Desktop/健身知识库/健身网站
$N $T/build/sync-engine.js --write      # 引擎 utils → 云函数 lib + 网站 shared 同步（⚠️ gamify/secret/pro/journal 不在清单里，手动 cp，见红线）
$N $T/build/bundle-engine.js && $N $T/build/build.js   # 产物在 dist/
# 测试全绿才算完：
for t in test-pages test-secret test-pro test-gamify test-reward test-auth test-macro; do $N $T/tools/$t.js 2>&1 | grep 失败; done
# 发布：调 workbuddy_sites_deploy（或告知用户），产物 dist/
```

### 小程序（微信开发者工具 CLI）
```bash
CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
# 前提：开发者工具 设置→安全设置→服务端口 已开启（用户已开）
$CLI upload --project /Users/a1-6/Desktop/健身知识库/健身小程序 -v 1.2.1 -d "饮食改版对齐+报错修复"
# 云函数部署（脚本方式，二选一）：
bash /Users/a1-6/Desktop/健身知识库/健身网站/tools/deploy-fn.sh webApi sendDailyPlan
# 或 CLI：$CLI cloud functions deploy --e cloud1-d7gtp1mv1bfcc25df --n webApi --r --project <项目路径>
```
正式发布：上传后到 mp.weixin.qq.com 版本管理提交审核→发布（这步只能用户在网页点，你把版本号和备注准备好）。

### GitHub
```bash
cd /Users/a1-6/Desktop/健身知识库
git -c http.proxy="" -c https.proxy="" push   # remote 已内嵌 token；网络不通时试代理 export https_proxy=http://127.0.0.1:7897
```

## 红线（违反 = 事故）

1. **引擎双维护**：`健身小程序/utils/` 是真相源；`build/sync-engine.js --write` 同步 calc/diet/kb/method/recipes-data/exercises-data 到云函数 lib 和网站 shared。⚠️ **gamify.js / secret.js / pro.js / journal.js 不在清单里，手动双维护**——改了必须手动 cp 到：webApi/lib、sendDailyPlan/lib、网站 shared（journal 仅网站一份）。
2. **改计划编排逻辑必须 PLAN_SCHEMA+1**（kb.js，当前 5）。
3. **写库**：小程序写 checkins 不能含 `_id/_openid`；不给 set 写 catch；会员字段不在 putState 白名单。
4. **测试全绿才交付**：test-pages（304）+ test-plan（69）+ 其余全套。
5. **用户给参考截图 = 照抄排版**，不要自创版本。界面密度对齐竞品（紧凑、行式）。
6. 内容合规：不出现「找专业的人看看/建议线下就医」类引流话术；没有出处的营养数字不写。
7. 本机 node 用 `/Users/a1-6/.workbuddy/binaries/node/versions/22.22.2-6/bin/node`。
8. `健身知识库/` 下除两个项目目录外（课程视频/文献）不要动；`.ai-key`、`project.private.config.json` 是密钥文件不要读入上下文更不要上传。

## 已知事实

- 网站已发布最新版；云函数 webApi/sendDailyPlan 已部署（2026-10-19 16:00）。
- GitHub: Ethanpang888/lianbux（私有），token 内嵌在 remote URL。
- 微信开发者工具 CLI 已存在但服务端口可能未开——报「需要开启服务端口」时让用户在工具 设置→安全设置 里开。
- 小程序调试器当前有 6 个 Console 报错（今日打卡页）——这是你要修的第一件事。
