#!/usr/bin/env python3
# 用 Farneback 光流在两帧之间做"运动感知"插帧：把起始姿势形变到结束姿势，
# 生成 N_MID 个中间帧，让动作从硬切变成平滑过渡。本地、免费、2 帧即可。
# 每次运行先删除旧中间帧，保证数量与 N_MID 一致（幂等）。
import sys, os, glob
import numpy as np
import cv2

ROOT = "subpkgs/exlib/assets/ex"
N_MID = 6          # 中间帧数量（6 针 → 共 8 帧: 0, 1b..6b, 1）
QUALITY = 65        # 中间帧画质(缩略图, 65 与 70 肉眼难分, 但更省包体)

def interp_one(d):
    a = os.path.join(d, "0.jpg"); b = os.path.join(d, "1.jpg")
    if not (os.path.exists(a) and os.path.exists(b)):
        return False
    im0 = cv2.imread(a); im1 = cv2.imread(b)
    if im0 is None or im1 is None:
        return False
    g0 = cv2.cvtColor(im0, cv2.COLOR_BGR2GRAY)
    g1 = cv2.cvtColor(im1, cv2.COLOR_BGR2GRAY)
    flow = cv2.calcOpticalFlowFarneback(
        g0, g1, None, pyr_scale=0.5, levels=3, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2, flags=0)
    h, w = g0.shape
    x, y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    for k in range(1, N_MID + 1):
        t = k / (N_MID + 1)
        mx = (x + t * flow[:, :, 0]).astype(np.float32)
        my = (y + t * flow[:, :, 1]).astype(np.float32)
        warped = cv2.remap(im0, mx, my, cv2.INTER_LINEAR)
        out = os.path.join(d, f"{k}b.jpg")
        cv2.imwrite(out, warped, [cv2.IMWRITE_JPEG_QUALITY, QUALITY])
    return True

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    dirs = sorted(glob.glob(os.path.join(ROOT, "*")))
    dirs = [d for d in dirs if os.path.isdir(d)]
    # 幂等：N_MID 增加(4→6)时直接覆盖写 1b..4b 并新增 5b/6b，无需删除旧帧
    done = 0; skip = 0
    for d in dirs:
        if limit and done >= limit:
            break
        if os.path.exists(os.path.join(d, f"{N_MID}b.jpg")):
            skip += 1; continue
        if interp_one(d):
            done += 1
        else:
            skip += 1
    print(f"插帧完成: 新增 {done} 个动作, 跳过/失败 {skip} 个")

if __name__ == "__main__":
    main()
