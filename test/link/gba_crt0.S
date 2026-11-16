@ Minimal GBA cartridge start for the link test ROM (no libraries).
    .section .text.start, "ax"
    .arm
    .global _start
_start:
    b reset                     @ byte 3 is 0xEA, which mGBA checks for
    .fill 0xB2 - 4, 1, 0        @ logo, title, codes: unused by mGBA with the BIOS skipped
    .byte 0x96                  @ fixed value at 0xB2
    .fill 0xC0 - 0xB3, 1, 0
reset:
    mov r0, #0x12               @ IRQ mode stack
    msr cpsr_c, r0
    ldr sp, =0x03007FA0
    mov r0, #0x1F               @ system mode stack
    msr cpsr_c, r0
    ldr sp, =0x03007F00
    bl main
1:  b 1b
