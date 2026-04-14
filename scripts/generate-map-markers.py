"""
Generate map marker bitmap assets for Google Maps.

We split the marker into:
- a static route badge bitmap
- a rotated heading arrow bitmap

Both share the same transparent canvas and anchor point so they align cleanly.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"

BG = (9, 9, 11, 255)
INNER = (14, 17, 23, 255)
AMBER = (245, 162, 10, 255)
TEAL = (16, 184, 163, 255)
WHITE = (237, 234, 228, 255)

SCALE = 3
CANVAS = (72 * SCALE, 84 * SCALE)
BADGE_CENTER = (36 * SCALE, 54 * SCALE)
BADGE_DIAMETER = 44 * SCALE

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_bus_icon(draw: ImageDraw.ImageDraw, cx: int, cy: int, color) -> None:
    body = (cx - 8 * SCALE, cy - 4 * SCALE, cx + 8 * SCALE, cy + 5 * SCALE)
    draw.rounded_rectangle(body, radius=3 * SCALE, outline=color, width=2 * SCALE)
    draw.line((cx - 4 * SCALE, cy + 5 * SCALE, cx + 4 * SCALE, cy + 5 * SCALE), fill=color, width=2 * SCALE)
    for wx in (cx - 5 * SCALE, cx + 5 * SCALE):
        draw.ellipse((wx - 2 * SCALE, cy + 4 * SCALE, wx + 2 * SCALE, cy + 8 * SCALE), fill=color)
    for x in (cx - 5 * SCALE, cx, cx + 5 * SCALE):
        draw.line((x, cy - 2 * SCALE, x, cy + 2 * SCALE), fill=color, width=max(1, SCALE))


def make_badge(route: str, accent) -> Image.Image:
    img = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    cx, cy = BADGE_CENTER
    outer_r = BADGE_DIAMETER // 2
    inner_r = outer_r - 4 * SCALE

    draw.ellipse((cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r), fill=accent)
    draw.ellipse((cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r), fill=BG)
    draw.ellipse((cx - inner_r + 3 * SCALE, cy - inner_r + 3 * SCALE, cx + inner_r - 3 * SCALE, cy + inner_r - 3 * SCALE), fill=INNER)

    draw_bus_icon(draw, cx, cy - 8 * SCALE, accent)

    font = load_font(11 * SCALE)
    text_box = draw.textbbox((0, 0), route, font=font)
    tw = text_box[2] - text_box[0]
    th = text_box[3] - text_box[1]
    tx = cx - tw / 2 - text_box[0]
    ty = cy + 6 * SCALE - th / 2 - text_box[1]
    draw.text((tx, ty), route, fill=accent, font=font)
    return img


def make_heading(accent) -> Image.Image:
    img = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    cx = BADGE_CENTER[0]
    stem_top = 18 * SCALE
    stem_bottom = 28 * SCALE
    draw.rounded_rectangle((cx - 2 * SCALE, stem_top, cx + 2 * SCALE, stem_bottom), radius=2 * SCALE, fill=accent)
    tip_y = 10 * SCALE
    base_y = 20 * SCALE
    draw.polygon(((cx, tip_y), (cx - 8 * SCALE, base_y), (cx + 8 * SCALE, base_y)), fill=accent)
    return img


def save_markers(route: str, accent) -> None:
    make_badge(route, accent).save(OUT / f"map-marker-{route}.png")
    make_heading(accent).save(OUT / f"map-heading-{route}.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    save_markers("380", AMBER)
    save_markers("316", TEAL)
    print("Done - marker assets written to assets/images/")
