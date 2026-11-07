"""Renders the Laravel add-on thumbnail: the official Laravel logomark on a red app tile with a status dot.

The tile, sheen and status dot match the PostgreSQL add-on's icon. The logomark is the white
RGB mark from Laravel's own artwork repository (github.com/laravel/art), kept next to this script.

Drawn at 4x and downsampled for clean anti-aliasing.
Usage: python3 scripts/make-icon.py assets/icon.png   (needs Pillow and cairosvg)
"""
import io
import sys
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter

SIZE = 256
SCALE = 4
S = SIZE * SCALE
RADIUS = 46 * SCALE
MARK_SVG = Path(__file__).with_name('laravel-mark-white.svg')
MARK_HEIGHT = 138 * SCALE

TOP_LEFT = (255, 92, 48)      # warm highlight
BOTTOM_RIGHT = (176, 26, 6)   # deep red
DOT = (61, 214, 132)
DOT_RING = (58, 12, 4)

Rgb = tuple[int, int, int]


def diagonal_gradient(size: int, start: Rgb, end: Rgb) -> Image.Image:
    grad = Image.new('RGB', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(start, end))
    return grad


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def tile() -> Image.Image:
    base = diagonal_gradient(SIZE, TOP_LEFT, BOTTOM_RIGHT).resize((S, S), Image.BICUBIC).convert('RGBA')
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse((-S * 0.3, -S * 0.75, S * 1.1, S * 0.45), fill=(255, 255, 255, 34))
    base = Image.alpha_composite(base, sheen.filter(ImageFilter.GaussianBlur(S * 0.04)))
    rim = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    inset = 3 * SCALE
    ImageDraw.Draw(rim).rounded_rectangle((inset, inset, S - inset, S - inset), radius=RADIUS - inset,
                                          outline=(255, 255, 255, 40), width=2 * SCALE)
    return Image.alpha_composite(base, rim)


def load_mark(height: int) -> Image.Image:
    """Rasterises the SVG large, trims its built-in padding, then scales to `height`."""
    png = cairosvg.svg2png(url=str(MARK_SVG), output_height=height * 2)
    mark = Image.open(io.BytesIO(png)).convert('RGBA')
    mark = mark.crop(mark.getbbox())
    width = round(mark.width * height / mark.height)
    return mark.resize((width, height), Image.LANCZOS)


def logomark(canvas: Image.Image) -> Image.Image:
    mark = load_mark(MARK_HEIGHT)
    x = (S - mark.width) // 2 - 8 * SCALE
    y = (S - mark.height) // 2 - 6 * SCALE
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    tint = Image.new('RGBA', mark.size, (70, 8, 0, 120))
    shadow.paste(tint, (x + 2 * SCALE, y + 6 * SCALE), mark)
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(7 * SCALE)))
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.paste(mark, (x, y), mark)
    return Image.alpha_composite(canvas, layer)


def status_dot(canvas: Image.Image) -> Image.Image:
    r = 19 * SCALE
    ring = 6 * SCALE
    cx = cy = S - 56 * SCALE
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring), fill=DOT_RING)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=DOT)
    glint = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glint).ellipse((cx - r * 0.55, cy - r * 0.7, cx + r * 0.1, cy - r * 0.15), fill=(255, 255, 255, 120))
    return Image.alpha_composite(canvas, glint.filter(ImageFilter.GaussianBlur(2 * SCALE)))


def main(out_path: str) -> None:
    art = status_dot(logomark(tile()))
    final = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    final.paste(art, (0, 0), rounded_mask(S, RADIUS))
    final.resize((SIZE, SIZE), Image.LANCZOS).save(out_path, optimize=True)


if __name__ == '__main__':
    main(sys.argv[1])
