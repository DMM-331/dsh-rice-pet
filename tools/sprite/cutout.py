import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from holes import components
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
WHITE = 236
def cut(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    mn = rgb.min(2)
    m = Image.fromarray(np.pad((mn >= WHITE).astype(np.uint8)*255, 1, constant_values=255)).copy()
    ImageDraw.floodfill(m, (0,0), 128)
    bg = (np.asarray(m)[1:-1,1:-1] == 128)
    inner = (mn >= WHITE) & ~bg
    sat = rgb.max(2) - mn
    for c in components(inner):
        if c.sum() >= 30 and mn[c].mean() >= 249 and sat[c].mean() < 4.5:
            bg |= c
    # soft edge: ring of 2px around bg gets alpha from darkness
    ring = np.zeros_like(bg)
    for dy in (-2,-1,0,1,2):
        for dx in (-2,-1,0,1,2):
            ring |= np.roll(np.roll(bg, dy, 0), dx, 1)
    ring &= ~bg
    alpha = np.where(bg, 0.0, 1.0)
    soft = np.clip((255 - mn) / (255 - 150), 0, 1)
    alpha = np.where(ring, np.minimum(1.0, soft), alpha)
    a3 = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((rgb - (1 - a3) * 255) / a3, 0, 255)  # un-premultiply against white
    rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")
for f in sorted(os.listdir(src)):
    im = cut(f"{src}/{f}"); im.save(f"{out}/{f}")
    # debug on magenta
    dbg = Image.new("RGBA", im.size, (255,0,200,255)); dbg.alpha_composite(im)
    dbg.convert("RGB").save(f"{out}/dbg_{f}")
