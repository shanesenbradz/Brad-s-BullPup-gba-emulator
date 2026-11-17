#!/usr/bin/env python3
"""Inline the web app, the mGBA core and the pixel sprites into dist/Brads_Bullpup.html.
LITE=1 builds Brad's Bullpup Lite instead (dist/Brads_Bullpup_Lite.html, docs/lite/)."""
import base64, glob, os, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
LITE = os.environ.get('LITE') == '1'
VERSION = os.environ.get('VN', '1.0' if LITE else '1.8')
W = ROOT / 'web'
shell = (W / 'shell.html').read_text()
css = (W / 'app.css').read_text() + ('\n' + (W / 'lite/lite.css').read_text() if LITE else '')
js = '\n'.join(pathlib.Path(p).read_text() for p in sorted(glob.glob(str(W / 'js' / '*.js'))))
core_js = (ROOT / 'vendor/mgba/mgba.js').read_text()
wasm = base64.b64encode((ROOT / 'vendor/mgba/mgba.wasm').read_bytes()).decode()
gun = (W / 'brand/gun.svg').read_text()
sprites = (W / 'brand/sprites.json').read_text()
assert '</script' not in js and '</script' not in core_js
out = (shell.replace('__SPRITES__', sprites).replace('__GUNJS__', gun).replace('__GUN__', gun)
       .replace('/*CSS*/', css).replace('/*MGBA_JS*/', core_js).replace('__WASM__', wasm).replace('__VERSION__', VERSION).replace('__LITE__', 'true' if LITE else 'false').replace('/*APP_JS*/', js))
if LITE:
    out = (out.replace("<title>Brad's Bullpup</title>", "<title>Brad's Bullpup Lite</title>")
           .replace('<span class="bname">Brad\'s Bullpup</span>', '<span class="bname">Brad\'s Bullpup<span class="lite-tag">LITE</span></span>')
           .replace('content="Brad\'s Bullpup: a Game', 'content="Brad\'s Bullpup Lite, the light edition for older phones: a Game')
           .replace('<span>Brad\'s Bullpup</span></div></div>', '<span>Brad\'s Bullpup Lite</span></div></div>'))
    assert "Bullpup Lite</title>" in out and 'lite-tag">LITE' in out
dest = ROOT / ('dist/Brads_Bullpup_Lite.html' if LITE else 'dist/Brads_Bullpup.html')
dest.parent.mkdir(exist_ok=True)
dest.write_text(out)
print(dest, len(out) // 1024, 'KB')

# GitHub Pages copy: docs/ is served at https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/
site = ROOT / 'docs' / ('lite' if LITE else '')
site.mkdir(exist_ok=True)
(site / 'index.html').write_text(out)
shutil.copytree(W / 'pwa', site / 'pwa', dirs_exist_ok=True)
if LITE:
    from PIL import Image
    big = Image.open(W / 'lite/icon-512.png').convert('RGB')
    for name, size in [('icon-512.png', 512), ('icon-maskable-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180)]:
        big.resize((size, size), Image.NEAREST).save(site / 'pwa' / name)
man = (W / 'site/manifest.webmanifest').read_text()
if LITE: man = man.replace('"name": "Brad\'s Bullpup"', '"name": "Brad\'s Bullpup Lite"').replace('"short_name": "Bullpup"', '"short_name": "Bullpup Lite"')
(site / 'manifest.webmanifest').write_text(man)
shutil.copy(W / 'site/privacy.html', site / 'privacy.html')
(site / '.nojekyll').write_text('')
(site / 'sw.js').write_text((W / 'site/sw.js').read_text().replace('__VERSION__', VERSION).replace('__LITE__', 'true' if LITE else 'false'))
print(site / 'index.html', 'for GitHub Pages')
