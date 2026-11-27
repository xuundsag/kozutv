#!/usr/bin/env python3
"""Burn a caption bar onto each walkthrough frame, using PIL.

The static ffmpeg build has no drawtext (no freetype), so the labels are drawn
with Pillow and the frames are then stitched by ffmpeg.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

WALK = sys.argv[1] if len(sys.argv) > 1 else '/tmp/walk'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/walk-cap'
os.makedirs(OUT, exist_ok=True)

frames = json.load(open(os.path.join(WALK, 'frames.json')))

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
]
font_path = None
for f in FONT_CANDIDATES:
    if os.path.exists(f):
        font_path = f
        break

def fit_font(text, max_w, start=20, floor=12):
    """Shrink the label until it fits the frame; long captions never clip."""
    if font_path is None:
        return ImageFont.load_default()
    for size in range(start, floor - 1, -1):
        f = ImageFont.truetype(font_path, size)
        if f.getlength(text) <= max_w:
            return f
    return ImageFont.truetype(font_path, floor)

font = ImageFont.truetype(font_path, 20) if font_path else ImageFont.load_default()

BAR_H = 50
n = 0
for fr in frames:
    src = os.path.join(WALK, fr['file'])
    dst = os.path.join(OUT, f"c{n:05d}.png")
    img = Image.open(src).convert('RGB')
    W, H = img.size
    draw = ImageDraw.Draw(img, 'RGBA')
    # A quiet translucent bar, not a title card: the app stays the subject.
    draw.rectangle([0, H - BAR_H, W, H], fill=(10, 11, 16, 226))
    draw.rectangle([0, H - BAR_H, W, H - BAR_H + 2], fill=(255, 115, 28, 255))
    label = fr['label']
    f = fit_font(label, W - 40)
    draw.text((20, H - BAR_H + (BAR_H - f.size) / 2 - 1), label, font=f, fill=(244, 245, 248, 255))
    img.save(dst)
    n += 1

print(f'captioned {n} frames')
