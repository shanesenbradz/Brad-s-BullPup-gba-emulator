#!/usr/bin/env python3
"""Makes Brad's Bullpup Lite's launcher icons: the normal icons plus a green pixel LITE tag.
Writes android/res-lite/mipmap-*/ (merged over android/res by build_apk.sh when LITE=1)."""
import pathlib
from PIL import Image, ImageDraw
ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = {  # 3x5 pixel letters
    'L': ['100', '100', '100', '100', '111'], 'I': ['111', '010', '010', '010', '111'],
    'T': ['111', '010', '010', '010', '010'], 'E': ['111', '100', '110', '100', '111']}
GREEN, INK = (76, 195, 138, 255), (14, 32, 22, 255)

def tag(im, frac_y, frac_w):
    W, H = im.size
    cols = 4 * 3 + 3  # letters plus one-pixel gaps
    px = max(1, round(W * frac_w / (cols + 4)))  # 2 pixels of padding each side
    tw, th = (cols + 4) * px, (5 + 4) * px
    x0, y0 = (W - tw) // 2, round(H * frac_y)
    d = ImageDraw.Draw(im)
    d.rectangle([x0, y0, x0 + tw - 1, y0 + th - 1], fill=GREEN)
    x = x0 + 2 * px
    for ch in 'LITE':
        for r, line in enumerate(FONT[ch]):
            for c, bit in enumerate(line):
                if bit == '1': d.rectangle([x + c * px, y0 + (2 + r) * px, x + (c + 1) * px - 1, y0 + (3 + r) * px - 1], fill=INK)
        x += 4 * px
    return im

for d in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
    out = ROOT / 'android/res-lite' / f'mipmap-{d}'; out.mkdir(parents=True, exist_ok=True)
    tag(Image.open(ROOT / f'android/res/mipmap-{d}/ic_launcher.png').convert('RGBA'), 0.66, 0.46).save(out / 'ic_launcher.png')
    # adaptive foreground: keep the tag inside the 66% safe zone
    tag(Image.open(ROOT / f'android/res/mipmap-{d}/ic_fg.png').convert('RGBA'), 0.6, 0.3).save(out / 'ic_fg.png')
im = tag(Image.open(ROOT / 'play/icon-512.png').convert('RGBA'), 0.66, 0.46)
(ROOT / 'web/lite').mkdir(exist_ok=True); im.save(ROOT / 'web/lite/icon-512.png')
print('lite icons written')
