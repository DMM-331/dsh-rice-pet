#!/usr/bin/env python3
"""
Review sheet: every behaviour's frames laid out in playback order, each labelled with its frame id
and measured face width, so size jumps between consecutive frames are easy to spot.

    python3 scripts/sprites/flows.py        # → art/previews/flows.png
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import build_sprites as bs  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def main() -> None:
    meta = json.loads((ROOT / "assets/sprites/whale.json").read_text())
    atlas = Image.open(ROOT / "assets/sprites" / meta["image"])
    pixels = np.asarray(atlas)
    cw, ch, cols = meta["cell"]["w"], meta["cell"]["h"], meta["columns"]
    bs.FACE_MIN_SHARE = 0.01            # atlas cells are smaller than the source panels
    poses, an = meta["poses"], meta["animations"]
    seq = lambda name: an[name]["frames"]

    def cell(i: int) -> Image.Image:
        return atlas.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch))

    def face(i: int):
        box = pixels[(i // cols) * ch:(i // cols + 1) * ch, (i % cols) * cw:(i % cols + 1) * cw].copy()
        try:
            return bs.measure(box)["face_w"]
        except ValueError:
            return None

    air = [poses["air_rise"], poses["air_tumble"], poses["air_fall"]]
    flows = [
        ("吃饭  eat_start → eat_loop → eat_done", seq("eat_start") + seq("eat_loop") + seq("eat_done")),
        ("走路  walk", seq("walk")),
        ("待机小动作  idle_*", seq("idle_look") + seq("idle_tap")[:1] + seq("idle_peek") + seq("idle_swish")),
        ("睡觉  sleep_in → sleep → wake", seq("sleep_in") + seq("sleep") + seq("wake")),
        ("跑工具  tool_start → tool_loop", seq("tool_start") + seq("tool_loop")),
        ("请求确认  ask → ask_more", seq("ask") + seq("ask_more")),
        ("报错 / 吃撑 / 完成  oops · full · cheer", seq("oops") + seq("full") + seq("cheer")),
        ("前滚翻  sault_in → 球 0/90/180/270 → sault_out", seq("sault_in") + meta["spin"]["frames"] + seq("sault_out")),
        ("被拎起  lift → hang → kick", seq("lift") + seq("hang") + seq("kick")),
        ("挣扎  flail → wiggle → tired", seq("flail") + seq("wiggle") + seq("tired")[:3]),
        ("抛飞 + 体操落地  air → land_a", air + seq("land_a")),
        ("抛飞 + 脸着地  air → land_b", air + seq("land_b")),
    ]

    scale = 0.5
    w, h = int(cw * scale), int(ch * scale)
    title_h = 36
    width = max(len(f) for _, f in flows) * w + 20
    sheet = Image.new("RGB", (width, len(flows) * (h + title_h) + 20), (240, 244, 250))
    draw = ImageDraw.Draw(sheet)
    title_font, label_font = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT, 15)
    y = 10
    for title, frames in flows:
        draw.text((12, y + 5), title, fill=(30, 50, 90), font=title_font)
        y += title_h
        for k, i in enumerate(frames):
            tile = Image.new("RGB", (w, h), (255, 255, 255) if k % 2 == 0 else (246, 248, 252))
            c = cell(i).resize((w, h))
            tile.paste(c, (0, 0), c)
            sheet.paste(tile, (10 + k * w, y))
            fw = face(i)
            draw.text((14 + k * w, y + h - 20), f"{meta['frames'][i]}  脸 {int(fw) if fw else '–'}",
                      fill=(110, 120, 145), font=label_font)
        y += h
    out = ROOT / "art/previews/flows.png"
    sheet.save(out)
    print(f"wrote {out.relative_to(ROOT)} {sheet.size}")


if __name__ == "__main__":
    main()
