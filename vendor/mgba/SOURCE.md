# mGBA core

`mgba.js` and `mgba.wasm` are built from source by `tools/build_core.sh`:

- mGBA (https://github.com/mgba-emu/mgba) at commit c034660f007c543233f1cadeb0ca13c71afd8f41,
  unchanged, built as a static library with Emscripten
- `src/mgba_shim.c`, the flat C API from wasm-gaming/mGBA-wasm
  (https://github.com/wasm-gaming/mGBA-wasm), with one change: video packing is split out of
  `mgbawasm_run_frame` so the link runner can reuse it
- `mgbawasm_run_frame_skip` (end of `src/mgba_shim.c`), added in 1.8: runs a frame with mGBA's scanline
  renderer off, through its own frameskip counter, for frame skip on slow phones
- `src/bullpup_link.c`, Brad's Bullpup's network link cable driver for GBA multiplayer and
  normal modes and the Game Boy serial port

Up to 1.6 the app used the prebuilt files from the npm package `@wasm-gaming/mgba-wasm` 0.1.1.
The rebuilt core is otherwise identical: same mGBA commit, same options, same save state layout.

Everything here is under the Mozilla Public License 2.0 (see LICENSE in this folder).
