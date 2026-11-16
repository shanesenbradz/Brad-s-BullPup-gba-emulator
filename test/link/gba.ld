ENTRY(_start)
SECTIONS {
  . = 0x08000000;
  .text : { *(.text.start) *(.text*) *(.rodata*) }
  /DISCARD/ : { *(.ARM.exidx*) *(.ARM.extab*) *(.data*) *(.bss*) }
}
