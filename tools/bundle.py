#!/usr/bin/env python3
"""Inline the web app, the mGBA core and the pixel sprites into dist/Brads_Bullpup.html."""
import base64, glob, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
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
       .replace('/*CSS*/', css).replace('/*MGBA_JS*/', core_js).replace('__WASM__', wasm).replace('/*APP_JS*/', js))
dest = ROOT / 'dist/Brads_Bullpup.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out)
print(dest, len(out) // 1024, 'KB')
