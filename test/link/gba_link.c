/* Link cable test ROM, GBA multiplayer mode. Player 1 sends 0x1nnn every frame and
 * expects 0x2nnn back; player 2 sends 0x2nnn and expects to see 0x1nnn arrive.
 * Results live at 0x03007000 so the test harness can read them:
 *   [0] frames  [1] good transfers  [2] last value received  [3] bad values  [4] 1 if player 2 */
#define R16(a) (*(volatile unsigned short*)(a))
#define VCOUNT    R16(0x4000006)
#define SIOMULTI0 R16(0x4000120)
#define SIOMULTI1 R16(0x4000122)
#define SIOCNT    R16(0x4000128)
#define SIOSEND   R16(0x400012A)
#define RCNT      R16(0x4000134)
#define RES ((volatile unsigned short*)0x03007000)
int main(void) {
    for (int i = 0; i < 8; i++) RES[i] = 0;
    RCNT = 0;
    SIOCNT = 0x2000 | 3;            /* multiplayer, 115200 baud */
    unsigned short n = 0, last = 0xFFFF;
    for (;;) {
        while (VCOUNT >= 160) {}
        while (VCOUNT < 160) {}
        RES[0]++;
        unsigned slave = (SIOCNT >> 2) & 1;
        RES[4] = slave;
        if (!slave) {
            SIOSEND = 0x1000 | (n & 0xFFF);
            SIOCNT = SIOCNT | 0x80;
            while (SIOCNT & 0x80) {}
            unsigned short got = SIOMULTI1;
            RES[2] = got;
            if ((got & 0xF000) == 0x2000) RES[1]++; else RES[3]++;
            n++;
        } else {
            SIOSEND = 0x2000 | (RES[0] & 0xFFF);
            unsigned short m0 = SIOMULTI0;
            if (m0 != last && (m0 & 0xF000) == 0x1000) { RES[1]++; RES[2] = m0; last = m0; }
            else if (m0 != last && m0 != 0xFFFF) { RES[3]++; last = m0; }
        }
    }
}
