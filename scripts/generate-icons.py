"""
Generate all app icons for Kojori Bus.
Design: two route-number chips (380 amber, 316 teal) on a near-black bg.
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

BG     = (9,   9,  11, 255)   # #09090B
AMBER  = (245, 162, 10)       # #F5A20A
TEAL   = (16,  184, 163)      # #10B8A3
DARK   = (9,   9,  11)        # text on chips
WHITE  = (255, 255, 255)

FONT_PATH = '/System/Library/Fonts/Supplemental/Arial Black.ttf'

def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default(size=size)

def draw_chips(draw, size, include_bg=True):
    """Draw the two route chips centred in `size`×`size`."""
    chip_w = int(size * 0.60)
    chip_h = int(size * 0.185)
    radius = chip_h // 2
    cx     = size // 2
    gap    = int(size * 0.048)

    total_h = chip_h * 2 + gap
    y0 = (size - total_h) // 2

    # 380 – amber
    x1 = cx - chip_w // 2
    draw.rounded_rectangle([x1, y0, x1 + chip_w, y0 + chip_h],
                            radius=radius, fill=AMBER)
    # 316 – teal
    y2 = y0 + chip_h + gap
    draw.rounded_rectangle([x1, y2, x1 + chip_w, y2 + chip_h],
                            radius=radius, fill=TEAL)

    font = load_font(int(chip_h * 0.52))
    for text, y_chip, fg in [('380', y0, DARK), ('316', y2, DARK)]:
        bb = draw.textbbox((0, 0), text, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        tx = cx - tw // 2 - bb[0]
        ty = y_chip + (chip_h - th) // 2 - bb[1]
        draw.text((tx, ty), text, fill=fg, font=font)

    # small connector dot between chips
    dot_r = int(size * 0.018)
    dot_x, dot_y = cx, y0 + chip_h + gap // 2
    draw.ellipse([dot_x - dot_r, dot_y - dot_r,
                  dot_x + dot_r, dot_y + dot_r], fill=(255, 255, 255, 60))


def make_main_icon(size=1024):
    img  = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img, 'RGBA')
    draw_chips(draw, size)
    return img.convert('RGB')


def make_foreground(size=1024):
    """Android adaptive icon foreground – transparent bg, chips centred in safe zone."""
    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, 'RGBA')

    # Safe zone is inner 66 %; scale chips to fit
    safe  = int(size * 0.66)
    offset= (size - safe) // 2
    inner = Image.new('RGBA', (safe, safe), (0, 0, 0, 0))
    d2    = ImageDraw.Draw(inner, 'RGBA')
    draw_chips(d2, safe)
    img.paste(inner, (offset, offset), inner)
    return img


def make_background(size=1024):
    """Android adaptive icon background – solid dark."""
    return Image.new('RGB', (size, size), BG[:3])


def make_monochrome(size=1024):
    """Android monochrome icon – white shapes on black."""
    img  = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(img)
    chip_w = int(size * 0.60)
    chip_h = int(size * 0.185)
    radius = chip_h // 2
    cx     = size // 2
    gap    = int(size * 0.048)
    total_h = chip_h * 2 + gap
    y0 = (size - total_h) // 2
    x1 = cx - chip_w // 2

    draw.rounded_rectangle([x1, y0, x1 + chip_w, y0 + chip_h], radius=radius, fill=255)
    y2 = y0 + chip_h + gap
    draw.rounded_rectangle([x1, y2, x1 + chip_w, y2 + chip_h], radius=radius, fill=255)
    return img


def make_splash(size=256):
    """Splash screen icon – same design, transparent bg."""
    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, 'RGBA')
    draw_chips(draw, size)
    return img


OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images')
os.makedirs(OUT, exist_ok=True)

make_main_icon(1024).save(f'{OUT}/icon.png')
make_foreground(1024).save(f'{OUT}/android-icon-foreground.png')
make_background(1024).save(f'{OUT}/android-icon-background.png')
make_monochrome(1024).save(f'{OUT}/android-icon-monochrome.png')
make_splash(256).save(f'{OUT}/splash-icon.png')
make_main_icon(48).save(f'{OUT}/favicon.png')

print('Done — icons written to assets/images/')
