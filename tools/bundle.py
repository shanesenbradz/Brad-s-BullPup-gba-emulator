#!/usr/bin/env python3
"""Inline the web app, the mGBA core and the pixel sprites into dist/Brads_Bullpup.html."""
import base64, glob, os, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = os.environ.get('VN', '1.7')
W = ROOT / 'web'
shell = (W / 'shell.html').read_text()
css = (W / 'app.css').read_text()
js = '\n'.join(pathlib.Path(p).read_text() for p in sorted(glob.glob(str(W / 'js' / '*.js'))))
core_js = (ROOT / 'vendor/mgba/mgba.js').read_text()
wasm = base64.b64encode((ROOT / 'vendor/mgba/mgba.wasm').read_bytes()).decode()
gun = (W / 'brand/gun.svg').read_text()
sprites = (W / 'brand/sprites.json').read_text()
assert '</script' not in js and '</script' not in core_js
out = (shell.replace('__SPRITES__', sprites).replace('__GUNJS__', gun).replace('__GUN__', gun)
       .replace('/*CSS*/', css).replace('/*MGBA_JS*/', core_js).replace('__WASM__', wasm).replace('__VERSION__', VERSION).replace('/*APP_JS*/', js))
dest = ROOT / 'dist/Brads_Bullpup.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out)
print(dest, len(out) // 1024, 'KB')

# GitHub Pages copy: docs/ is served at https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/
site = ROOT / 'docs'
(site / 'index.html').write_text(out)
shutil.copytree(W / 'pwa', site / 'pwa', dirs_exist_ok=True)
shutil.copy(W / 'site/manifest.webmanifest', site / 'manifest.webmanifest')
shutil.copy(W / 'site/privacy.html', site / 'privacy.html')
(site / '.nojekyll').write_text('')
(site / 'sw.js').write_text((W / 'site/sw.js').read_text().replace('__VERSION__', VERSION))
print(site / 'index.html', 'for GitHub Pages')
