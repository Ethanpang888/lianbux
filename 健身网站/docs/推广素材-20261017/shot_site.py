# -*- coding: utf-8 -*-
"""练不虚网站截图脚本 —— 竖版视频素材
用法: /Users/a1-6/.workbuddy/binaries/python/envs/default/bin/python shot_site.py [all|单页名]
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = "https://c289b837374c4dfc8f14d386d2e36a02.app.workbuddy.host"
OUT = os.path.dirname(os.path.abspath(__file__))

PAGES = [
    ("网站-home",    "#/home"),
    ("网站-today",   "#/today"),
    ("网站-plan",    "#/plan"),
    ("网站-diet",    "#/diet"),
    ("网站-records", "#/records"),
    ("网站-rank",    "#/rank"),
    ("网站-badges",  "#/badges"),
    ("网站-pro",     "#/pro"),
    ("网站-plus",    "#/plus"),
    ("网站-ai",      "#/ai"),
    ("网站-login",   "#/login"),
    ("网站-me",      "#/me"),
    ("网站-calc",    "/calc.html"),
]

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else "all"
    todo = [p for p in PAGES if only == "all" or p[0] == only]
    if not todo:
        print("没有匹配的页面:", only); return
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(
            viewport={"width": 500, "height": 960},
            device_scale_factor=2, locale="zh-CN",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        pg = ctx.new_page()
        ok, fail = 0, 0
        for name, route in todo:
            try:
                pg.goto(BASE + "/" + route, wait_until="load", timeout=25000)
                pg.wait_for_timeout(2000)  # 等 SPA 渲染 + demo 数据
                pg.screenshot(path=os.path.join(OUT, name + ".png"))
                print("OK  ", name, route); ok += 1
            except Exception as e:
                print("FAIL", name, route, "->", str(e)[:160]); fail += 1
        b.close()
        print(f"\n完成: 成功 {ok} 张, 失败 {fail} 张 -> {OUT}")

if __name__ == "__main__":
    main()
