#!/usr/bin/env python3
"""
Build the whale sprite atlas from the generated artwork.

    python3 scripts/sprites/build_sprites.py            # uses art/sprites.json

Pipeline per source image (white background, single pose or 2x2 grid):
  1. split grids along their white gutters
  2. cut the white background out (flood fill from the border + enclosed pure-white pockets),
     soften the edge and un-premultiply the white fringe
  3. optional inpainting (removes stray onomatopoeia text drawn by the image model)
  4. scale every frame of a source by one factor (so poses inside a grid keep their relative size),
     put the feet on a shared ground line and the head on a shared vertical axis
Then pack all frames into one atlas + JSON (frame ids, animations with per-frame durations).
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
WHITE = 236            # min(r,g,b) at or above this counts as background white
BULK_MIN_WIDTH = 0.25  # body rows narrower than this share of the widest row are protrusions
FACE_MIN_PX = 600      # a skin blob smaller than this is a hand, not the face (source pixels)
DARK = 200             # gutter detection: a pixel below this is "ink"


# ---- connected components (4-connected, via PIL flood fill; no scipy needed) -----------------

def components(mask: np.ndarray) -> list[np.ndarray]:
    m = Image.fromarray(mask.astype(np.uint8) * 255).copy()
    out = []
    for y, x in zip(*np.nonzero(mask)):
        if m.getpixel((int(x), int(y))) != 255:
            continue
        ImageDraw.floodfill(m, (int(x), int(y)), 100)
        a = np.asarray(m)
        comp = a == 100
        out.append(comp)
        m = Image.fromarray(np.where(comp, 50, a).astype(np.uint8)).copy()
    return out


def dilate(mask: np.ndarray, n: int) -> np.ndarray:
    for _ in range(n):
        o = mask.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            o |= np.roll(np.roll(mask, dy, 0), dx, 1)
        mask = o
    return mask


# ---- 1. grid splitting -----------------------------------------------------------------------

def gutter(ink_profile: np.ndarray, lo: float, hi: float) -> int:
    """Middle of the longest ink-free run inside [lo, hi] of the axis; midpoint if none."""
    n = len(ink_profile)
    a, b = int(n * lo), int(n * hi)
    best, run_start, best_span = None, None, 0
    for i in range(a, b + 1):
        free = i < b and not ink_profile[i]
        if free and run_start is None:
            run_start = i
        elif not free and run_start is not None:
            if i - run_start > best_span:
                best_span, best = i - run_start, (run_start + i) // 2
            run_start = None
    return best if best is not None else n // 2


def split(rgb: np.ndarray, grid: list[int] | None) -> list[tuple[int, int, np.ndarray]]:
    """Return [(x0, y0, crop)] in reading order."""
    if not grid:
        return [(0, 0, rgb)]
    cols, rows = grid
    assert (cols, rows) == (2, 2), "only 2x2 grids are supported"
    ink = rgb.min(2) < DARK
    ys = gutter(ink.any(1), 0.35, 0.65)
    cells = []
    for y0, y1 in ((0, ys), (ys, rgb.shape[0])):
        xs = gutter(ink[y0:y1].any(0), 0.35, 0.65)
        for x0, x1 in ((0, xs), (xs, rgb.shape[1])):
            cells.append((x0, y0, rgb[y0:y1, x0:x1]))
    return cells


# ---- 2. background removal -------------------------------------------------------------------

def cut_out(rgb_u8: np.ndarray) -> np.ndarray:
    rgb = rgb_u8.astype(np.float32)
    mn = rgb.min(2)
    m = Image.fromarray(np.pad((mn >= WHITE).astype(np.uint8) * 255, 1, constant_values=255)).copy()
    ImageDraw.floodfill(m, (0, 0), 128)
    bg = np.asarray(m)[1:-1, 1:-1] == 128
    # enclosed pockets (gaps between hair strands): pure, unshaded white
    sat = rgb.max(2) - mn
    for c in components((mn >= WHITE) & ~bg):
        if c.sum() >= 30 and mn[c].mean() >= 249 and sat[c].mean() < 4.5:
            bg |= c
    ring = dilate(bg, 2) & ~bg
    alpha = np.where(bg, 0.0, 1.0)
    alpha = np.where(ring, np.minimum(1.0, np.clip((255 - mn) / (255 - 150), 0, 1)), alpha)
    a3 = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((rgb - (1 - a3) * 255) / a3, 0, 255)       # un-premultiply against white
    return np.dstack([col, alpha * 255]).astype(np.uint8)


# ---- 3. inpainting ---------------------------------------------------------------------------

def inpaint(rgba: np.ndarray, boxes: list[dict]) -> np.ndarray:
    """Diffuse surrounding colour into small text/mark areas. Box coords are frame-local."""
    im = rgba.astype(np.float32)
    rgb = im[..., :3]
    sat = rgb.max(2) - rgb.min(2)
    mask = np.zeros(im.shape[:2], bool)
    for spec in boxes:
        x0, y0, x1, y1 = spec["box"]
        box = np.zeros_like(mask)
        box[y0:y1, x0:x1] = True
        box &= im[..., 3] > 0
        if spec["mode"] == "marks":      # white marks with dark outline over hair
            mask |= dilate(box & (sat < 40), 2)
        else:                            # dark/white lettering over hair and skin
            mask |= dilate(box & ((sat < 22) | (rgb.max(2) < 115)), 1)
    known = ~mask
    im[mask] = 0
    for _ in range(400):
        acc = np.zeros_like(im)
        cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(im, dy, 0), dx, 1) * k[..., None]
            cnt += k
        upd = mask & (cnt > 0)
        im[upd] = acc[upd] / cnt[upd][:, None]
        known |= upd
    return im.clip(0, 255).astype(np.uint8)


# ---- 4. measuring and placing ----------------------------------------------------------------

def measure(rgba: np.ndarray) -> dict:
    """
    Where the character itself is, ignoring things that vary from pose to pose:
      height  – top of the hair mass to the feet: rows of the body narrower than BULK_MIN_WIDTH of
                its widest row (the ahoge, a hand raised above the head) don't count
      head_x  – centre of the face (largest skin-coloured blob in the upper body); falls back to the
                centre of the hair mass when the face is hidden
    Floating effects and props on the floor are separate blobs and are ignored entirely.
    """
    main = max(components(rgba[..., 3] > 128), key=lambda c: c.sum())
    widths = main.sum(1)
    rows = np.nonzero(widths)[0]
    bottom = int(rows.max())
    top = int(np.nonzero(widths >= widths.max() * BULK_MIN_WIDTH)[0].min())

    r, g, b = (rgba[..., k].astype(int) for k in range(3))
    skin = main & (r > 215) & (r - b > 18) & (r - b < 75) & (g > 170) & (r >= g) & (g >= b - 5)
    upper = np.zeros_like(main)
    upper[top:top + int((bottom - top) * 0.55)] = True
    blobs = sorted(components(skin & upper), key=lambda c: -c.sum())
    if blobs and blobs[0].sum() >= FACE_MIN_PX:
        head_x = float(np.nonzero(blobs[0])[1].mean())
    else:
        head_x = float(np.nonzero(main[top:top + int((bottom - top) * 0.3)])[1].mean())
    return {"top": top, "bottom": bottom, "height": bottom - top + 1, "head_x": head_x}


def place(rgba: np.ndarray, m: dict, scale: float, ground: int, cfg: dict, frame_id: str) -> Image.Image:
    cw, ch = cfg["cell"]["w"], cfg["cell"]["h"]
    ax, ay = cfg["anchor"]["x"], cfg["anchor"]["y"]
    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    ox, oy = round(ax - m["head_x"] * scale), round(ay - (ground + 1) * scale)
    cell = Image.new("RGBA", (cw, ch))
    cell.alpha_composite(img, (max(ox, 0), max(oy, 0)), (max(-ox, 0), max(-oy, 0)))
    a = np.asarray(img)[..., 3] > 20
    ys, xs = np.nonzero(a)
    clipped = [s for s, bad in (("left", xs.min() + ox < 0), ("right", xs.max() + ox >= cw), ("top", ys.min() + oy < 0)) if bad]
    if clipped:
        print(f"  ! {frame_id}: clipped on {', '.join(clipped)}")
    return cell


# ---- main ------------------------------------------------------------------------------------

def main(manifest_path: Path) -> None:
    cfg = json.loads(manifest_path.read_text())
    art = manifest_path.parent
    body_h = cfg["bodyHeight"]

    # pass 1: cut and measure every frame
    sources = []
    for src in cfg["sources"]:
        rgb = np.asarray(Image.open(art / src["file"]).convert("RGB"))
        frames = []
        for k, ((x0, y0, crop), fid) in enumerate(zip(split(rgb, src.get("grid")), src["frames"])):
            if fid is None:
                continue
            row = k // 2 if src.get("grid") else 0
            rgba = cut_out(crop)
            boxes = [dict(b, box=[b["box"][0] - x0, b["box"][1] - y0, b["box"][2] - x0, b["box"][3] - y0])
                     for b in src.get("inpaint", []) if b["frame"] == fid]
            if boxes:
                rgba = inpaint(rgba, boxes)
            m = measure(rgba)
            m["row"] = row
            m["sitting"] = fid in src.get("sitting", [])
            frames.append((fid, rgba, m))
        sources.append((src, frames))
        print(f"cut {src['file']}: {', '.join(f for f, _, _ in frames)}")

    # Scale. The image model draws panels of one grid at slightly different sizes (the top row is
    # often 5-8% smaller), so every standing frame is normalised to bodyHeight on its own.
    # Sitting/lying frames can't be measured that way; they borrow the mean scale of the standing
    # frames in their grid (same row first), or — for a sheet with no standing pose at all —
    # "scaleMatch": {frame, to} makes `frame` exactly as tall as the already-placed frame `to`.
    frames_of = {src["file"]: frames for src, frames in sources}
    scale, height = {}, {}
    for _, frames in sources:
        for fid, _, m in frames:
            height[fid] = m["height"]
            if not m["sitting"]:
                scale[fid] = body_h / m["height"]
    pending = [(src, fid, m) for src, frames in sources for fid, _, m in frames if m["sitting"]]
    for _ in range(2):   # second pass resolves scaleMatch references to sitting frames
        for src, fid, m in pending:
            if fid in scale:
                continue
            same_sheet = [(scale[f], mm["row"] == m["row"])
                          for f, _, mm in frames_of[src["file"]] if not mm["sitting"]]
            same_row = [v for v, r in same_sheet if r]
            if same_row or same_sheet:
                scale[fid] = float(np.mean(same_row or [v for v, _ in same_sheet]))
            elif "scaleMatch" in src and src["scaleMatch"]["to"] in scale:
                ref, mine = src["scaleMatch"]["to"], src["scaleMatch"]["frame"]
                sheet_scale = scale[ref] * height[ref] / height[mine]
                for f, _, _ in frames_of[src["file"]]:
                    scale[f] = sheet_scale
    missing = [fid for _, fid, _ in pending if fid not in scale]
    if missing:
        sys.exit(f"no scale for sitting frames {missing}: add a standing frame to the grid or a scaleMatch")

    # pass 2: place and pack. Feet go on the ground; frames listed in "airborne" (a jump) keep their
    # height above the floor line of their grid row instead.
    cells, ids = [], []
    for src, frames in sources:
        floor = {}
        for fid, _, m in frames:
            if fid not in src.get("airborne", []):
                floor[m["row"]] = max(floor.get(m["row"], 0), m["bottom"])
        for fid, rgba, m in frames:
            ground = floor.get(m["row"], m["bottom"]) if fid in src.get("airborne", []) else m["bottom"]
            cells.append(place(rgba, m, scale[fid], ground, cfg, fid))
            ids.append(fid)
    if len(set(ids)) != len(ids):
        sys.exit("duplicate frame ids in manifest")

    cw, ch, cols = cfg["cell"]["w"], cfg["cell"]["h"], cfg["columns"]
    rows = (len(cells) + cols - 1) // cols
    atlas = Image.new("RGBA", (cw * cols, ch * rows))
    for i, cell in enumerate(cells):
        atlas.alpha_composite(cell, ((i % cols) * cw, (i // cols) * ch))

    out = cfg["output"]
    image_path = ROOT / out["image"]
    image_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(image_path, quality=90, method=6)

    index = {fid: i for i, fid in enumerate(ids)}
    animations = {}
    for name, a in cfg["animations"].items():
        missing = [f for f in a["frames"] if f not in index]
        if missing:
            sys.exit(f"animation {name}: unknown frames {missing}")
        ms = a["ms"] if isinstance(a["ms"], list) else [a["ms"]] * len(a["frames"])
        animations[name] = {"frames": [index[f] for f in a["frames"]], "durations": ms}
    meta = {
        "image": image_path.name,
        # Content hash: clients request the atlas as `whale.webp?v=<version>` so a rebuild is never
        # shadowed by a cached copy of the old image (the frame layout ships inside the JS bundle).
        "version": hashlib.sha256(image_path.read_bytes()).hexdigest()[:12],
        "cell": cfg["cell"],
        "columns": cols,
        "anchor": cfg["anchor"],
        "frames": ids,
        "poses": {k: index[v] for k, v in cfg["poses"].items()},
        "walkFacing": cfg.get("walkFacing", "right"),   # which way the walk frames face as drawn
        "animations": animations,
    }
    (ROOT / out["meta"]).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    # preview: contact sheet with frame ids on a light background
    if "preview" in out:
        sheet = Image.new("RGB", atlas.size, (238, 243, 250))
        sheet.paste(atlas, (0, 0), atlas)
        d = ImageDraw.Draw(sheet)
        for i, fid in enumerate(ids):
            d.text(((i % cols) * cw + 6, (i // cols) * ch + 4), f"{i} {fid}", fill=(60, 80, 120))
        prev = ROOT / out["preview"]
        prev.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(prev)
    print(f"wrote {out['image']} ({len(cells)} frames, {atlas.width}x{atlas.height}) and {out['meta']}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "art" / "sprites.json")
