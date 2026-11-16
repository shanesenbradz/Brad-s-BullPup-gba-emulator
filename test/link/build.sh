#!/bin/bash
# Builds the link test ROMs with clang + lld (no devkitARM or RGBDS needed).
set -e
cd "$(dirname "$0")"
clang --target=armv4t-none-eabi -marm -O2 -ffreestanding -nostdlib -fno-builtin -fno-unwind-tables -c gba_crt0.S -o /tmp/crt0.o
clang --target=armv4t-none-eabi -marm -O2 -ffreestanding -nostdlib -fno-builtin -fno-unwind-tables -c gba_link.c -o /tmp/gl.o
ld.lld -T gba.ld /tmp/crt0.o /tmp/gl.o -o /tmp/gl.elf
llvm-objcopy -O binary /tmp/gl.elf gba_link.gba
python3 -c "
d=bytearray(open('gba_link.gba','rb').read()); assert d[3]==0xEA and d[0xB2]==0x96, (d[3], d[0xB2])
d+=b'\xff'*(0x1000-len(d)); open('gba_link.gba','wb').write(d)"
python3 gb_link.py
