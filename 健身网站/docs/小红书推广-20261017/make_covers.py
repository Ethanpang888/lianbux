# -*- coding: utf-8 -*-
"""生成 3 张新小红书封面（1080x1440），底图用真实网站截图。
用法: /Users/a1-6/.workbuddy/binaries/python/envs/default/bin/python make_covers.py
改文案直接改下面 COVERS 里的字段，重跑即可。
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "..", "推广素材-20261017")   # 网站截图目录

COVERS = [
    {
        "file": "封面3-打卡成长型.png",
        "bg": "网站-home.png",
        "kicker": "练不虚 · 健身副本",
        "headline": ["练完一天", "经验值真的会涨"],
        "hl": "经验值真的会涨",
        "cross": ["打卡涨经验，Lv 从新手村往上走", "连续天数、徽章一枚枚收", "同城排行榜，看谁练得久"],
        "foot": "免费注册 · 邮箱验证码就行 · 不用下 App",
    },
    {
        "file": "封面4-AI顾问型.png",
        "bg": "网站-ai.png",
        "kicker": "练不虚 · AI 顾问",
        "headline": ["卧推卡住了", "先问它再上手"],
        "hl": "先问它再上手",
        "cross": ["训练怎么调、重量怎么加", "饮食怎么改、碳水放哪顿", "不知道的它直说，不瞎编"],
        "foot": "免费每天问 3 次 · 网站免费用",
    },
    {
        "file": "封面5-同城排行榜型.png",
        "bg": "网站-rank.png",
        "kicker": "练不虚 · 同城榜",
        "headline": ["一个人练", "最容易骗自己"],
        "hl": "最容易骗自己",
        "cross": ["等级榜看累计，连续榜看谁没断", "本周榜看谁这周练得狠", "榜上有人，你就不太想断"],
        "foot": "注册即真实上榜 · 免费",
    },
]

TPL = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1080px; height:1440px; font-family:"PingFang SC","Microsoft YaHei",sans-serif; }}
.cover {{ position:relative; width:1080px; height:1440px; overflow:hidden;
  background:url('{bg}') center/cover #05070d; }}
.shade {{ position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(4,7,13,.94) 0%, rgba(4,7,13,.72) 34%, rgba(4,7,13,.38) 58%, rgba(4,7,13,.9) 100%); }}
.main {{ position:absolute; top:110px; left:80px; right:80px; }}
.kicker {{ display:inline-block; font-size:34px; font-weight:700; color:#19c389;
  border:2px solid rgba(25,195,137,.55); border-radius:999px; padding:12px 34px; margin-bottom:52px; }}
.l1 {{ font-size:112px; font-weight:900; color:#fff; line-height:1.24; letter-spacing:2px; }}
.hl {{ color:#19c389; }}
.cross {{ position:absolute; bottom:250px; left:80px; right:80px; background:rgba(4,7,13,.78);
  border-radius:28px; padding:38px 44px; }}
.cross div {{ font-size:44px; color:#fff; line-height:1.5; margin-bottom:26px;
  padding-left:64px; position:relative; font-weight:600; }}
.cross div:last-child {{ margin-bottom:0; }}
.cross div::before {{ content:"✓"; position:absolute; left:0; top:2px; color:#19c389; font-weight:900; }}
.foot {{ position:absolute; bottom:80px; left:80px; right:80px; background:rgba(255,255,255,.95);
  color:#0b1220; border-radius:24px; padding:32px 40px; font-size:42px; font-weight:800; text-align:center; }}
</style></head><body>
<div class="cover"><div class="shade"></div>
  <div class="main">
    <div class="kicker">{kicker}</div>
    <div class="l1">{headline}</div>
  </div>
  <div class="cross">{cross}</div>
  <div class="foot">{foot}</div>
</div></body></html>"""

def build(c):
    headline = "<br>".join(
        (f'<span class="hl">{ln}</span>' if c["hl"] in ln else ln) for ln in c["headline"])
    cross = "".join(f"<div>{x}</div>" for x in c["cross"])
    html = TPL.format(bg=os.path.join(SHOTS, c["bg"]).replace(" ", "%20"),
                      kicker=c["kicker"], headline=headline, cross=cross, foot=c["foot"])
    hp = os.path.join(HERE, c["file"].replace(".png", ".html"))
    with open(hp, "w", encoding="utf-8") as f:
        f.write(html)
    return hp

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1080, "height": 1440}, device_scale_factor=1)
        pg = ctx.new_page()
        for c in COVERS:
            hp = build(c)
            pg.goto("file://" + hp)
            pg.wait_for_timeout(900)
            out = os.path.join(HERE, c["file"])
            pg.screenshot(path=out)
            print("OK  ", c["file"])
        b.close()
    print("\n全部封面生成完毕 ->", HERE)

if __name__ == "__main__":
    main()
