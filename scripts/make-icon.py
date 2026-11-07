"""Renders the add-on icon: the official white Laravel logomark on a red app tile.

The logomark comes from Laravel's own artwork repository (github.com/laravel/art)
and is kept next to this script. Drawn at 4x and downsampled for clean edges.

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
RADIUS = 56 * SCALE
MARK_SVG = Path(__file__).with_name('laravel-mark-white.svg')
MARK_HEIGHT = 144 * SCALE

TILE_TOP = (255, 64, 40)
TILE_BOTTOM = (196, 24, 10)
MARK_SHADOW = (90, 6, 0, 120)

Rgb = tuple[int, int, int]
Rgba = tuple[int, int, int, int]


def vertical_gradient(top: Rgb, bottom: Rgb) -> Image.Image:
    column = Image.new('RGB', (1, SIZE))
    for y in range(SIZE):
        t = y / (SIZE - 1)
        column.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return column.resize((S, S), Image.BICUBIC).convert('RGBA')


def soft_ellipse(color: Rgba, box: tuple[float, float, float, float], blur: float) -> Image.Image:
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def load_mark(height: int) -> Image.Image:
    """Rasterises the SVG large, trims its built-in padding, then scales to `height`."""
    png = cairosvg.svg2png(url=str(MARK_SVG), output_height=height * 2)
    mark = Image.open(io.BytesIO(png)).convert('RGBA')
    mark = mark.crop(mark.getbbox())
    return mark.resize((round(mark.width * height / mark.height), height), Image.LANCZOS)


def with_mark(canvas: Image.Image) -> Image.Image:
    mark = load_mark(MARK_HEIGHT)
    x, y = (S - mark.width) // 2, (S - mark.height) // 2 + 2 * SCALE
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.paste(Image.new('RGBA', mark.size, MARK_SHADOW), (x, y + 8 * SCALE), mark)
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(10 * SCALE)))
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.paste(mark, (x, y), mark)
    return Image.alpha_composite(canvas, layer)


def with_rim(canvas: Image.Image) -> Image.Image:
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    inset = 2 * SCALE
    ImageDraw.Draw(layer).rounded_rectangle((inset, inset, S - inset, S - inset), radius=RADIUS - inset,
                                            outline=(255, 255, 255, 40), width=2 * SCALE)
    return Image.alpha_composite(canvas, layer)


def render() -> Image.Image:
    tile = vertical_gradient(TILE_TOP, TILE_BOTTOM)
    tile = Image.alpha_composite(tile, soft_ellipse((255, 255, 255, 30), (-S * .2, -S * .7, S * 1.2, S * .45), 30 * SCALE))
    art = with_rim(with_mark(tile))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=RADIUS, fill=255)
    rounded = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rounded.paste(art, (0, 0), mask)
    return rounded.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == '__main__':
    render().save(sys.argv[1], optimize=True)
