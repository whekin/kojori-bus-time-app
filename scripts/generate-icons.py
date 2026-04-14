"""
Generate app icons for Kojoring Time from a master PNG illustration.

Source of truth:
- assets/images/icon-master.png
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"
MASTER_PATH = IMAGES / "icon-master.png"
BG = (8, 25, 45, 255)


def load_master() -> Image.Image:
    if not MASTER_PATH.exists():
        raise FileNotFoundError(f"Missing master icon: {MASTER_PATH}")
    return Image.open(MASTER_PATH).convert("RGBA")


def fit_master(size: int, *, inset: float = 0.0, rounded: bool = False) -> Image.Image:
    master = load_master()
    inner_size = max(1, int(size * (1.0 - inset * 2)))

    # Cover square output while preserving the original composition.
    fitted = ImageOps.fit(master, (inner_size, inner_size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    fitted = ImageEnhance.Sharpness(fitted).enhance(1.08)

    canvas = Image.new("RGBA", (size, size), BG)
    x = (size - inner_size) // 2
    y = (size - inner_size) // 2

    if rounded:
        mask = Image.new("L", (inner_size, inner_size), 0)
        mask_draw = ImageDrawProxy(mask)
        radius = max(12, inner_size // 7)
        mask_draw.rounded_rectangle((0, 0, inner_size, inner_size), radius=radius, fill=255)
        canvas.paste(fitted, (x, y), mask)
    else:
        canvas.paste(fitted, (x, y), fitted)

    return canvas


class ImageDrawProxy:
    def __init__(self, image: Image.Image) -> None:
        from PIL import ImageDraw

        self.draw = ImageDraw.Draw(image)

    def rounded_rectangle(self, *args, **kwargs):
        return self.draw.rounded_rectangle(*args, **kwargs)


def make_main_icon(size: int = 1024) -> Image.Image:
    return fit_master(size).convert("RGB")


def make_master_preview(size: int = 1024) -> Image.Image:
    return make_main_icon(size)


def make_foreground(size: int = 1024) -> Image.Image:
    # Derived from the full master art, inset so Android masks do not clip key details.
    return fit_master(size, inset=0.08)


def make_background(size: int = 1024) -> Image.Image:
    master = ImageOps.fit(load_master(), (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    background = master.filter(ImageFilter.GaussianBlur(radius=max(8, size // 48)))
    background = ImageEnhance.Brightness(background).enhance(0.48)
    background = ImageEnhance.Color(background).enhance(0.78)
    overlay = Image.new("RGBA", (size, size), BG)
    return Image.blend(background, overlay, 0.32).convert("RGB")


def make_monochrome(size: int = 1024) -> Image.Image:
    return make_foreground(size).convert("L")


def make_splash(size: int = 256) -> Image.Image:
    return fit_master(size, inset=0.14)


def make_favicon(size: int = 48) -> Image.Image:
    return make_main_icon(256).resize((size, size), Image.Resampling.LANCZOS)


def export_all(output_dir: str | os.PathLike[str]) -> None:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    make_main_icon(1024).save(output / "icon.png")
    make_foreground(1024).save(output / "android-icon-foreground.png")
    make_background(1024).save(output / "android-icon-background.png")
    make_monochrome(1024).save(output / "android-icon-monochrome.png")
    make_splash(256).save(output / "splash-icon.png")
    make_favicon(48).save(output / "favicon.png")


if __name__ == "__main__":
    export_all(IMAGES)
    print("Done - icons written to assets/images/")
