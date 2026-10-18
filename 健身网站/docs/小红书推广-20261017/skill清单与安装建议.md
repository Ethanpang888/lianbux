# 小红书推广 skill 清单与安装建议（2026-10-17）

> 检索范围：GitHub 开源 + WorkBuddy 技能市场（SkillHub）+ 你本地已装。
> 全部经过源码审计（网络调用 / 危险函数 / 凭证处理 / 提示词注入四项）。

---

## 一句话结论

**已经给你装好一个：`guizang-social-card-skill`**（归藏出品，约 4.8k★）——专门做小红书图文卡 / 封面，28 套版式 + 10 套主题，**图片可以用你的真实网站截图**，正好补上「做图」这块。
文案你本地已有 skill + 我的能力已经够用；带「自动发布」的 skill 全部不建议用（原因见最后一节）。

---

## 一、GitHub 开源候选（按匹配度排）

| Skill | Star | 文案 | 做图 | 自动发布 | 审计结论 |
|---|---|---|---|---|---|
| **guizang-social-card-skill**（op7418） | ~4.8k | — | ✅ 28 版式/10 主题，HTML+CSS 渲染 | ❌ 无 | ✅ **干净，已安装**。AGPL-3.0，见下 |
| **xhs-workflow**（jovian-zhibai） | — | ✅ 爆款拆解→去 AI 味→Obsidian 素材库 | ✅ 5 种封面模板 | ⚠️ 推草稿箱 | ✅ 干净。核心功能开箱即用，需 `npx skills add`（**npm 在我这边被墙，需你自己装**） |
| **Auto-Redbook-Skills**（comeonzhj） | ~2.3k | ✅ 爆款套路 | ✅ 8 主题 3:4 卡 | ⚠️ 纯 HTTP 直发 | ⚠️ 含 `vendor/xhs_publish_runtime/`：一整套小红书创作者平台反向 API 客户端（curl_cffi 伪装 Chrome TLS 指纹） |
| **RedInk**（HisMax） | ~5.2k | ✅ 一句话出图文 | ✅ AI 生图 | ❌ 无 | 需 Docker + Gemini/Nano Banana API Key，门槛最高 |
| **write-xiaohongshu**（adjfks） | 2.4k 装 | ✅ 限时校验+情绪触发+竞品分析 | ❌ 无 | ⚠️ 需人工确认 | 干净。纯文案向 |
| **xhs-autopilot**（Jinsong-Zhou） | — | ✅ | ✅ Pillow/Playwright | ⚠️ 依赖 xiaohongshu-mcp | 偏开发者，依赖链重 |

## 二、你本地已经能用的（零安装）

| Skill | 干嘛用 |
|---|---|
| `xiaohongshu-cover` | 小红书封面设计（已装，直接喊我就行） |
| `fitness-koubo-style` / `tianlei-copywriting` / `aqing-copywriting-skill` | 健身口播文案 |
| **Playwright + Chromium**（受管 Python 环境，已验证可跑） | 截图网站、渲染 HTML 封面出 PNG |
| `shot_site.py`（同项目 `推广素材-20261017/`） | 一条命令重截全站 13 个页面 |
| `make_covers.py`（同项目 `小红书推广-20261017/`） | 改文案字段 → 重跑 → 出新封面 |

## 三、为什么只装了 guizang，没装带自动发布的

1. **合规**：小红书 2026-03《关于打击 AI 托管运营账号的治理公告》——AI 托管代发轻则限流重则封号；主页笔记全为 AI 代发的直接封禁。Auto-Redbook 的 `vendor/xhs_publish_runtime` 就是干这个的，**装上等于把封号工具放在手边**。它的「写+画」能力我这边已有替代，不值得为它冒这个险。
2. **安全**：审计中它的网络调用全部指向小红书域名、凭证只落本地 `.env`，没发现外联或注入——**技术上没问题，是路线有问题**。
3. **guizang 的独特价值**：它不用 AI 生成像素，而是 HTML+CSS 排版 + 真实图库/截图，输出是「网页渲染截图」而非「AI 生成图」——2026 年起小红书用视听识别模型给 AIGC 打标限流，**这条路线最容易避开检测**，且出来的图是杂志级排版。

**如果你还是想要 Auto-Redbook 的写+画能力**：跟我说一声，我把它装上但**删掉 vendor 发布模块**，只留文案+卡片生成。

## 四、环境说明（重要）

- 我这边 **npm / github.com 被墙**，所以 `npx skills add` 装不了；但 `codeload.github.com`（GitHub 打包下载）通，guizang 就是这么装上的。
- guizang 声明依赖 Node 版 playwright，装不了；但**渲染这步我能用受管 Python 的 Playwright（已装 1.64.0 + Chromium）替代**，实际使用不受影响。
- 想让 `npx skills add` 也能用（比如装 xhs-workflow），需要你在我发起安装时批准一次沙箱外执行，或者你自己在终端跑那条命令。

## 五、版权注意

guizang 是 **AGPL-3.0**（copyleft）：拿它**生成图片**给商用账号发帖没问题（AGPL 管的是软件分发，不是产出物）；但**别把它的代码/模板改改再去售卖或分发**。仓库里有 `COMMERCIAL_LICENSING.md`，真要商业化它的代码，找作者买商业授权。

---

## 附：这次实际交付的东西

| 文件 | 说明 |
|---|---|
| `推广素材-20261017/网站-*.png`（13 张） | 10-17 重截的竖版截图，1000×1920，可直接进抖音视频 |
| `推广素材-20261017/shot_site.py` | 重截脚本，网站改版后随时更新素材 |
| `小红书推广-20261017/封面3/4/5-*.png` + `.html` | 3 张新封面，底图为真实网站截图 |
| `小红书推广-20261017/make_covers.py` | 封面生成脚本，改字段重跑即出新封面 |
| `小红书推广-20261017/小红书推广物料-新增3篇.md` | 3 篇新笔记（打卡成长 / AI 顾问 / 同城榜） |
| `小红书推广-20261017/视频素材-口播稿与插入清单-20261017.md` | 新口播稿 + 13 张图插入时间点表 |
