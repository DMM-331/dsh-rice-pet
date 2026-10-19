import sys, os, json, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from holes import components
CUT, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CW, CH = 440, 400          # cell size
BODY_H, BASE_Y, HEAD_X = 372, 394, 205   # body height, feet baseline, head center x inside cell

def load(name):
    im = np.asarray(Image.open(f"{CUT}/{name}.png")).copy()
    if name == "g3":  # drop the "chew" text + motion marks next to the chopsticks
        a = im[..., 3] > 0
        comps = sorted(components(a), key=lambda c: -c.sum())
        for c in comps[1:]:
            ys, xs = np.nonzero(c)
            if c.sum() < 600 and 100 <= xs.min() and xs.max() <= 230 and 220 <= ys.min() and ys.max() <= 300:
                im[c] = 0
    return im

def body_box(im):
    a = im[..., 3] > 128
    main = max(components(a), key=lambda c: c.sum())   # character body, ignoring sparkles
    ys, xs = np.nonzero(main)
    top, bot = ys.min(), ys.max()
    band = main[top:top + int((bot - top) * 0.30)]
    hx = np.nonzero(band)[1].mean()
    return top, bot, hx

FRAMES = {"g1":"开饭", "s1":"夹饭到嘴边", "s3":"啊呜", "s2":"嚼(开心)", "g3":"嚼(用力)", "g4":"吃完", "s4":"再来一碗"}
cells = {}
for n in FRAMES:
    im = load(n); top, bot, hx = body_box(im)
    s = BODY_H / (bot - top + 1)
    img = Image.fromarray(im, "RGBA")
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    cell = Image.new("RGBA", (CW, CH))
    ox, oy = round(HEAD_X - hx * s), round(BASE_Y - (bot + 1) * s)
    cell.alpha_composite(img, (max(ox,0), max(oy,0)), (max(-ox,0), max(-oy,0)))
    # clipping report
    a = np.asarray(img)[..., 3] > 20; ys, xs = np.nonzero(a)
    clip = [xs.min()+ox < 0, xs.max()+ox >= CW, ys.min()+oy < 0]
    print(n, "scale %.3f" % s, "x-range", xs.min()+ox, xs.max()+ox, "y-top", ys.min()+oy, "CLIP" if any(clip) else "")
    cells[n] = cell

ANIMS = {
  "eat_start": {"frames": ["g1"], "fps": 2, "loop": False},
  "eat_loop":  {"frames": ["s1", "s3", "g3", "s2", "g3", "s2"], "durations": [260, 220, 180, 180, 180, 260], "loop": True},
  "eat_bite":  {"frames": ["s1", "s3", "s2", "g3", "s2"], "fps": 5, "loop": True},
  "eat_done":  {"frames": ["g4", "s4"], "fps": 2, "loop": False},
}
order = ["g1", "s1", "s3", "s2", "g3", "g4", "s4"]
COLS = 4; rows = (len(order) + COLS - 1) // COLS
sheet = Image.new("RGBA", (CW * COLS, CH * rows))
idx = {}
for i, n in enumerate(order):
    sheet.alpha_composite(cells[n], ((i % COLS) * CW, (i // COLS) * CH)); idx[n] = i
sheet.save(f"{OUT}/whale-eat.png", optimize=True)
sheet.save(f"{OUT}/whale-eat.webp", quality=92, method=6)
meta = {"image": "whale-eat.webp", "cell": {"w": CW, "h": CH}, "columns": COLS,
        "anchor": {"x": HEAD_X, "y": BASE_Y, "note": "head center x / feet baseline y inside each cell"},
        "frames": [{"index": idx[n], "id": n, "label": FRAMES[n]} for n in order],
        "animations": {k: {**v, "frames": [idx[f] for f in v["frames"]]} for k, v in ANIMS.items()}}
json.dump(meta, open(f"{OUT}/whale-eat.json", "w"), ensure_ascii=False, indent=2)
# preview gif: start(hold) -> bite x2 -> done
seq = [("g1", 600)] + [(f, 200) for f in ANIMS["eat_bite"]["frames"]] * 2 + [("g4", 500), ("s4", 900)]
bgc = (238, 243, 250, 255)
gif = []
for n, ms in seq:
    f = Image.new("RGBA", (CW, CH), bgc); f.alpha_composite(cells[n]); gif.append((f.convert("RGB"), ms))
gif[0][0].save(f"{OUT}/preview.gif", save_all=True, append_images=[g for g, _ in gif[1:]], duration=[m for _, m in gif], loop=0)
# alignment check: overlay outlines
ov = Image.new("RGBA", (CW, CH), (255,255,255,255))
for n in order:
    c = cells[n].copy(); c.putalpha(c.getchannel("A").point(lambda v: v // 5)); ov.alpha_composite(c)
d = ImageDraw.Draw(ov); d.line([(0, BASE_Y), (CW, BASE_Y)], fill=(255,0,0)); d.line([(HEAD_X, 0), (HEAD_X, CH)], fill=(255,0,0))
ov.save(f"{OUT}/align-check.png")
