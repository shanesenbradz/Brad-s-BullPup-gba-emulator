"""Builds gb_link.gb, a Game Boy serial-port test ROM, with a tiny built-in assembler.

The console holding A during the first two seconds becomes the clock master and sends
0x80|n once per frame with the internal clock; the other waits on the external clock
sending 0x40|n. Results in WRAM: C000 good, C001 bad, C002 last byte received,
C003 1 if master, C004 counter.
"""
import pathlib

code, labels, fix = bytearray(), {}, []
BASE = 0x150
def emit(*b): code.extend(b)
def label(n): labels[n] = BASE + len(code)
def jr(op, target): emit(op, 0); fix.append((len(code) - 1, target, 'rel'))
def jp(target): emit(0xC3, 0, 0); fix.append((len(code) - 2, target, 'abs'))
def ld_a_n(n): emit(0x3E, n)
def ldh_n_a(n): emit(0xE0, n)
def ldh_a_n(n): emit(0xF0, n)
def ld_mem_a(a): emit(0xEA, a & 0xFF, a >> 8)
def ld_a_mem(a): emit(0xFA, a & 0xFF, a >> 8)
def inc_mem(a): ld_a_mem(a); emit(0x3C); ld_mem_a(a)
def wait_vblank():
    label(f'v{len(code)}a'); l1 = BASE + len(code); ldh_a_n(0x44); emit(0xFE, 144); jr(0x28, l1)   # wait while LY == 144
    l2 = BASE + len(code); ldh_a_n(0x44); emit(0xFE, 144); jr(0x20, l2)                          # then until LY == 144

emit(0xF3)                       # di
emit(0x31, 0xFE, 0xFF)           # ld sp,$FFFE
emit(0xAF)                       # xor a
for a in range(0xC000, 0xC006): ld_mem_a(a)
# role: watch the A button for 120 frames
label('pick')
wait_vblank()
ld_a_n(0x10); ldh_n_a(0x00); ldh_a_n(0x00); ldh_a_n(0x00); ldh_a_n(0x00)
emit(0xE6, 0x01); jr(0x28, 'master')                       # A pressed (bit low) -> master
inc_mem(0xC005); emit(0xFE, 120); jr(0x20, 'pick')

label('slave')
ld_a_mem(0xC004); emit(0xE6, 0x3F, 0xF6, 0x40); ldh_n_a(0x01)  # SB = 0x40 | n
ld_a_n(0x80); ldh_n_a(0x02)                                  # SC = start, external clock
label('ws'); ldh_a_n(0x02); emit(0xCB, 0x7F); jr(0x20, 'ws')
ldh_a_n(0x01); ld_mem_a(0xC002); emit(0xE6, 0xC0, 0xFE, 0x80); jr(0x20, 'sbad')
inc_mem(0xC000); jr(0x18, 'snext')
label('sbad'); inc_mem(0xC001)
label('snext'); inc_mem(0xC004); jr(0x18, 'slave')

label('master')
ld_a_n(1); ld_mem_a(0xC003)
label('mloop')
wait_vblank()
ld_a_mem(0xC004); emit(0xE6, 0x3F, 0xF6, 0x80); ldh_n_a(0x01)  # SB = 0x80 | n
ld_a_n(0x81); ldh_n_a(0x02)                                  # SC = start, internal clock
label('wm'); ldh_a_n(0x02); emit(0xCB, 0x7F); jr(0x20, 'wm')
ldh_a_n(0x01); ld_mem_a(0xC002); emit(0xE6, 0xC0, 0xFE, 0x40); jr(0x20, 'mbad')
inc_mem(0xC000); jr(0x18, 'mnext')
label('mbad'); inc_mem(0xC001)
label('mnext'); inc_mem(0xC004); jp('mloop')

for pos, t, kind in fix:
    addr = labels[t] if isinstance(t, str) else t
    if kind == 'rel':
        off = addr - (BASE + pos + 1); assert -128 <= off < 128, (t, off); code[pos] = off & 0xFF
    else:
        code[pos], code[pos + 1] = addr & 0xFF, addr >> 8

rom = bytearray(0x8000)
rom[0x100:0x104] = bytes([0x00, 0xC3, 0x50, 0x01])          # nop; jp $0150
rom[0x104:0x108] = bytes([0xCE, 0xED, 0x66, 0x66])          # start of the logo, which mGBA checks
rom[0x134:0x13F] = b'LINKTEST\0\0\0'
rom[0x150:0x150 + len(code)] = code
rom[0x14D] = (-sum(rom[0x134:0x14D]) - 25) & 0xFF            # header checksum
out = pathlib.Path(__file__).with_name('gb_link.gb'); out.write_bytes(rom)
print(out.name, len(code), 'bytes of code')
