# 练不虚（啊清练不虚）· 中医健身产品源码

抖音 IP「啊清练不虚」的产品底盘：中医健身内容 + 训练/饮食计划引擎 + 修炼游戏化系统。

## 目录

- `健身小程序/` —— 微信小程序（微信 + 腾讯 CloudBase 云开发）
  - `pages/` `subpkgs/` —— 页面（洞府/训练/饮食/修炼记录/我的 等）
  - `cloudfunctions/webApi` —— 全部后端逻辑（鉴权/打卡/排行榜/AI/收徒/邮件）
  - `cloudfunctions/webAuth` `sendDailyPlan` —— 注册鉴权 / 每日邮件
  - `utils/` —— **引擎真相源**（kb 计划生成 / calc 热量 / gamify 修炼 / pro 重量处方 / method 方法论 / secret 秘籍 / exercises-data 1112 动作库）
- `健身网站/` —— 网页版（与小程序共用引擎）
  - `src/` —— 页面与组件；`shared/` —— 引擎副本（由 `build/sync-engine.js` 从小程序 utils 同步）
  - `tools/` —— 全部测试（test-pages/test-gamify/test-reward/test-auth 等 12 套）与部署脚本

## 关键约定（改代码前必读）

1. 引擎真相源在 `健身小程序/utils/`，改后必须 `node build/sync-engine.js --write` 同步；`gamify.js` 例外——手动同步三处（utils / webApi/lib / sendDailyPlan/lib / 网站shared）。
2. 计划模型：只存 `micro` + `cycleStart` 取模无限循环；动作只存 oid。改编排逻辑必须 PLAN_SCHEMA+1。
3. 写库铁律：set 数据不能含 `_id/_openid`；会员发放收敛在 webApi `grantMember()`；`member/gamify` 不进 putState WRITABLE 白名单。
4. 发布前九套测试全绿：`node tools/test-*.js`（网站）+ `node tools/test-plan.js`（小程序）。
5. 部署：云函数 `tools/deploy-fn.sh webApi webApi`；网站发布 dist（`build/build.js` 产物）。

## 数据流

小程序 `wx.cloud.callFunction(webApi)`；网站 POST 到 CloudBase HTTP 网关（CORS 通配）。两端打卡/会员/排行榜互通（mp-* 前缀镜像）。
