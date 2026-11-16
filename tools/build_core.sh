#!/bin/bash
# Rebuilds vendor/mgba/mgba.js and mgba.wasm from source: mGBA at the pinned commit plus
# vendor/mgba/src (the wasm-gaming shim and Bullpup's link cable driver).
#
# Needs Emscripten. Either have emcc on PATH (emsdk), or point EMSCRIPTEN_DIR at an
# Emscripten 3.1.50 checkout configured with EM_CONFIG (this is how it's built when
# the prebuilt emsdk compilers can't be downloaded: system clang 18 + binaryen from npm).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK=${WORK:-$ROOT/.toolchain/core}
MGBA_REF=c034660f007c543233f1cadeb0ca13c71afd8f41
[ -n "${EMSCRIPTEN_DIR:-}" ] && export PATH="$EMSCRIPTEN_DIR:$PATH"
command -v emcc >/dev/null || { echo "emcc not found"; exit 1; }
mkdir -p "$WORK"
if [ ! -d "$WORK/mgba/.git" ]; then
  git init -q "$WORK/mgba" && git -C "$WORK/mgba" remote add origin https://github.com/mgba-emu/mgba
fi
git -C "$WORK/mgba" fetch -q --depth 1 origin $MGBA_REF && git -C "$WORK/mgba" checkout -q FETCH_HEAD

OPTS=(-DCMAKE_BUILD_TYPE=Release "-DCMAKE_C_FLAGS=-O3 -D_GNU_SOURCE -DDISABLE_THREADING" -DCMAKE_EXE_LINKER_FLAGS=-sWASM_BIGINT
  -DBUILD_STATIC=ON -DBUILD_SHARED=OFF -DDISABLE_FRONTENDS=ON -DDISABLE_DEPS=ON -DBUILD_QT=OFF -DBUILD_SDL=OFF
  -DBUILD_LIBRETRO=OFF -DBUILD_TEST=OFF -DBUILD_SUITE=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF
  -DUSE_PTHREADS=OFF -DUSE_ZLIB=OFF -DUSE_MINIZIP=OFF -DUSE_LIBZIP=OFF -DUSE_PNG=OFF -DUSE_SQLITE3=OFF -DUSE_FFMPEG=OFF
  -DUSE_ELF=OFF -DUSE_LZMA=OFF -DUSE_LUA=OFF -DUSE_JSON_C=OFF -DUSE_FREETYPE=OFF -DUSE_EDITLINE=OFF
  -DUSE_DISCORD_RPC=OFF -DUSE_EPOXY=OFF -DENABLE_SCRIPTING=OFF -DENABLE_DEBUGGERS=OFF)
[ -f "$WORK/cm/build.ninja" ] || emcmake cmake -S "$WORK/mgba" -B "$WORK/cm" -G Ninja "${OPTS[@]}" >/dev/null
cmake --build "$WORK/cm" --target mgba -j "$(nproc)"
# the shim must see exactly the defines libmgba was built with (struct mCore changes shape with them)
DEFS=$(grep -m1 "DEFINES = " "$WORK/cm/build.ninja" | sed 's/.*DEFINES = //')
emcc -O3 -std=gnu11 -I"$WORK/mgba/include" -I"$WORK/mgba/src" -I"$WORK/cm/include" -D_GNU_SOURCE -DDISABLE_THREADING -DNDEBUG $DEFS \
  -Wno-deprecated-declarations "$ROOT/vendor/mgba/src/mgba_shim.c" "$WORK/cm/libmgba.a" \
  --no-entry -sWASM_BIGINT -sMODULARIZE=1 -sEXPORT_NAME=createMgbaModule -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=1048576 \
  -sEXPORTED_FUNCTIONS=_malloc,_free -o "$ROOT/vendor/mgba/mgba.js"
ls -l "$ROOT/vendor/mgba/mgba.js" "$ROOT/vendor/mgba/mgba.wasm"
