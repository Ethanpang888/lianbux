#!/usr/bin/env python3
"""
tools/make-character.py —— 把「生图得到的角色图」加工成网页可用的透明底素材

为什么要它：生图出来的图有三个问题，直接放进网页会很难看——
  1. 右下角带「AI生成」水印（在深色卡上会露馅）
  2. 不透明背景（贴在绿色渐变卡上像贴了张照片）
  3. 画布比例不统一（同一个页面上各个阶段大小不一）

做法（三步，都是可复现的数值规则，不是靠手调）：
  ① 四角估背景色 → 从四边洪泛「颜色接近 + 中性灰」的像素 → 得到 alpha
  ② 再吃一遍浅中性灰（地面阴影），但不吃深色鞋和亮白鞋底（用亮度区间圈住）
  ③ 按 alpha 的实际边界裁紧，再按统一高度导出（CSS 宽度 = 角色真实宽度）

用法：
  python3 tools/make-character.py <输入图> <输出名> [--ref 参考图]
    输出到 assets/characters/<输出名>.png（400px 高）+ <输出名>@2x.png（800px 高）
  --ref 给一个「画面对齐的参考图」，会先按参考图裁掉右下角水印区再抠图。
        不传就直接抠（适合已经是干净背景、无水印的图）。
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'characters')

# 导出高度（网页 hero 卡按宽度缩放，故只需固定高度保证各阶段一致）
OUT_H = 400


def cutout(img):
    """返回带 alpha 的 RGBA 图（不裁边）"""
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    h, w, _ = a.shape
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = mx - mn                                   # 饱和度：背景与地面阴影都接近中性

    # ① 四角 60×60 估计背景色（比取单像素稳）
    k = max(4, min(60, h // 8, w // 8))
    corners = np.concatenate([
        a[0:k, 0:k].reshape(-1, 3), a[0:k, -k:].reshape(-1, 3),
        a[-k:, 0:k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    bg = corners.mean(axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

    def flood(mask):
        vis = np.zeros((h, w), bool)
        q = deque()
        for x in range(w):
            for y in (0, h - 1):
                if mask[y, x] and not vis[y, x]:
                    vis[y, x] = True; q.append((y, x))
        for y in range(h):
            for x in (0, w - 1):
                if mask[y, x] and not vis[y, x]:
                    vis[y, x] = True; q.append((y, x))
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not vis[ny, nx]:
                    vis[ny, nx] = True; q.append((ny, nx))
        return vis

    # ② 第一遍：接近背景色 且 中性
    p1 = flood((dist < 78) & (sat < 30))
    # ③ 第二遍：允许穿越已判定背景，继续吃「浅中性灰」地面阴影
    #    亮度区间刻意排除深色鞋（mx≈50）和亮白鞋底（mx≈245）
    p2 = flood(p1 | ((sat < 30) & (mx > 112) & (mx < 234)))
    removed = flood(p2 | p1)          # 再收敛一次，处理边缘残留

    alpha = np.where(removed, 0, 255).astype(np.uint8)
    am = Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(1.0))
    am = am.point(lambda v: 0 if v < 45 else (255 if v > 210 else v))
    out = img.convert('RGBA')
    out.putalpha(am)
    return out


def trim(rgba, pad=3):
    bb = rgba.getchannel('A').getbbox()
    if not bb:
        return rgba
    x0, y0, x1, y1 = bb
    return rgba.crop((max(0, x0 - pad), max(0, y0 - pad),
                      min(rgba.width, x1 + pad), min(rgba.height, y1 + pad)))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, name = sys.argv[1], sys.argv[2]
    ref = None
    if '--ref' in sys.argv:
        ref = sys.argv[sys.argv.index('--ref') + 1]

    img = Image.open(src).convert('RGB')
    if ref:
        # 有参考图时：按参考图尺寸对齐，并裁掉右下角水印带（生图固定会打在右下角）
        r = Image.open(ref)
        if img.size != r.size:
            img = img.resize(r.size, Image.LANCZOS)
        w, h = img.size
        img = img.crop((int(w * 0.05), int(h * 0.005), int(w * 0.85), int(h * 0.975)))

    rgba = trim(cutout(img))
    os.makedirs(OUT_DIR, exist_ok=True)
    ar = rgba.width / rgba.height
    for scale, suffix in ((1, '.png'), (2, '@2x.png')):
        hh = OUT_H * scale
        ww = max(1, round(hh * ar))
        rgba.resize((ww, hh), Image.LANCZOS).save(os.path.join(OUT_DIR, name + suffix), 'PNG', optimize=True)
        print('  %s%s  %d×%d  %dKB' % (name, suffix, ww, hh,
              os.path.getsize(os.path.join(OUT_DIR, name + suffix)) // 1024))
    print('✅ 宽高比 %.3f（CSS 里宽度 = 角色实际宽度）' % ar)


if __name__ == '__main__':
    main()
