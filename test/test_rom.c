#include <tonc.h>
// test ROM for the emulator frontend
volatile u16 health = 10;      // cheat target (IWRAM .data)
EWRAM_DATA volatile u32 ticks = 0;
#define SRAM ((volatile u8*)0x0E000000)
static void rect(int x,int y,int w,int h,u16 c){for(int j=y;j<y+h;j++)for(int i=x;i<x+w;i++)m3_plot(i,j,c);}
int main(void){
  REG_DISPCNT = DCNT_MODE3 | DCNT_BG2;
  // count boots in SRAM, needs signature so save type is detected
  static const char sig[] __attribute__((used)) = "SRAM_V113";
  u8 boots = SRAM[0]; if(boots==0xFF) boots=0; boots++; SRAM[0]=boots;
  REG_SNDSTAT = SSTAT_ENABLE; REG_SNDDMGCNT = SDMG_BUILD_LR(SDMG_SQR1,7); REG_SNDDSCNT = SDS_DMG100;
  REG_SND1SWEEP = SSW_OFF;
  int px=110, py=70;
  while(1){
    vid_vsync(); key_poll(); ticks++;
    if(key_is_down(KEY_LEFT)&&px>0)px--; if(key_is_down(KEY_RIGHT)&&px<230)px++;
    if(key_is_down(KEY_UP)&&py>20)py--; if(key_is_down(KEY_DOWN)&&py<150)py++;
    if(key_hit(KEY_A)){ REG_SND1CNT = SSQR_ENV_BUILD(12,0,2)|SSQR_DUTY1_2; REG_SND1FREQ = SFREQ_RESET | SND_RATE(NOTE_A,0); }
    if(key_hit(KEY_B) && health>0) health--;
    // background color cycles
    u16 bg = RGB15((ticks>>2)&31, 8, 16);
    rect(0,0,240,20,bg);
    // health bar
    rect(0,152,240,8,CLR_BLACK); rect(0,152,(health>100?100:health)*2,8,CLR_LIME);
    // boots indicator boxes
    for(int i=0;i<boots && i<20;i++) rect(4+i*10,24,8,8,CLR_YELLOW);
    rect(px,py,10,10,CLR_RED);
  }
}
