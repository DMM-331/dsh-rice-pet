import sys, numpy as np
from PIL import Image, ImageDraw
def components(mask):
    """label 4-connected True regions via PIL floodfill; returns list of bool masks"""
    m = Image.fromarray(mask.astype(np.uint8)*255).copy()
    comps = []; arr = np.asarray(m)
    ys, xs = np.nonzero(arr == 255)
    label = 1
    out = []
    for y, x in zip(ys, xs):
        if m.getpixel((int(x), int(y))) != 255: continue
        ImageDraw.floodfill(m, (int(x), int(y)), 100)
        a = np.asarray(m); c = a == 100
        out.append(c); m = Image.fromarray(np.where(c, 50, a).astype(np.uint8)).copy()
    return out
if __name__ == "__main__":
    f = sys.argv[1]
    rgb = np.asarray(Image.open(f"raw/{f}.png").convert("RGB")).astype(np.float32)
    cut = np.asarray(Image.open(f"cut/{f}.png"))
    mn = rgb.min(2)
    inner = (mn >= 236) & (cut[..., 3] == 255)
    vis = np.asarray(Image.open(f"cut/dbg_{f}.png").convert("RGB")).copy()
    for c in components(inner):
        n = c.sum()
        if n < 150: continue
        v = mn[c]; mx = rgb.max(2)[c]
        sat = (mx - v).mean()
        bg = v.mean() >= 249 and sat < 4.5
        print(f, n, round(v.mean(),1), round(v.std(),2), round(sat,2), "BG" if bg else "")
        vis[c] = (0,255,0) if bg else (255,160,0)
    Image.fromarray(vis).save(f"holes_{f}.png")
