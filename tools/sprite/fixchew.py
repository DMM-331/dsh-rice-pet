# inpaint the "chew" text and "((" marks in g3 by diffusion from surrounding pixels
import numpy as np
from PIL import Image
im = np.asarray(Image.open("cut/g3.png")).astype(np.float32)
rgb = im[..., :3]; sat = rgb.max(2) - rgb.min(2)
mask = np.zeros(im.shape[:2], bool)
def boxm(x0, y0, x1, y1):
    b = np.zeros_like(mask); b[y0:y1, x0:x1] = True; return b & (im[..., 3] > 0)
mask |= boxm(168, 243, 206, 272) & ((sat < 22) | (rgb.max(2) < 115))  # "chew" over hair/skin
def dilate(m, n):
    for _ in range(n):
        o = m.copy()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)): o |= np.roll(np.roll(m, dy, 0), dx, 1)
        m = o
    return m
mask = dilate(mask, 1) | dilate(boxm(120, 228, 140, 256) & (sat < 40), 2)  # "((" on hair
print("masked px", mask.sum())
out = im.copy(); known = ~mask
out[mask] = 0
for _ in range(400):
    acc = np.zeros_like(out); cnt = np.zeros(mask.shape, np.float32)
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        k = np.roll(np.roll(known, dy, 0), dx, 1); v = np.roll(np.roll(out, dy, 0), dx, 1)
        acc += v * k[..., None]; cnt += k
    upd = mask & (cnt > 0)
    out[upd] = acc[upd] / cnt[upd][:, None]
    known = known | upd
Image.fromarray(out.clip(0,255).astype(np.uint8), "RGBA").save("cut/g3.png")
