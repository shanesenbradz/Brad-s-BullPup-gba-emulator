import asyncio, json
from playwright.async_api import async_playwright
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist/Brads_Bullpup.html').as_uri()
CHROME = sys.argv[1] if len(sys.argv) > 1 else None
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':420,'height':860}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg = await ctx.new_page()
    errs=[]; pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None); pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    await pg.goto(URL); await pg.wait_for_function('!document.getElementById("boot")', timeout=20000)
    await pg.screenshot(path='/tmp/bullpup-s1_empty.png')
    async with pg.expect_file_chooser() as fc: await pg.click('#btnAdd2')
    await (await fc.value).set_files(str(ROOT / 'test/test_rom.gba'))
    await pg.wait_for_selector('.card'); await pg.screenshot(path='/tmp/bullpup-s2_lib.png')
    await pg.click('.card'); await pg.wait_for_timeout(1500)
    r = await pg.evaluate('({f:__calzone.Emu.frameNo, mem:__calzone.core.hasMem, iw:__calzone.core.iw, health:__calzone.core.r16(0x03000020), gl:!!document.getElementById("screen").getContext("webgl")})')
    print('running', r)
    await pg.screenshot(path='/tmp/bullpup-s3_play.png')
    # touch: press dpad right via touch tap-hold using dispatch pointer events
    box = await pg.evaluate('(()=>{const r=__calzone.Emu&&document.querySelector(".k-dpad").getBoundingClientRect();return {x:r.left+r.width*0.9,y:r.top+r.height/2}})()')
    await pg.mouse.move(box['x'],box['y']); await pg.mouse.down(); await pg.wait_for_timeout(500)
    tm = await pg.evaluate('__calzone.Input.touch'); await pg.mouse.up(); print('touch mask while holding dpad-right', tm)
    # RAM search: press B 3 times (KeyZ) to reduce health 10 -> 7
    await pg.evaluate('(()=>{const s=__calzone.Emu.search; s.reset(16); s.start();})()')
    for i in range(3):
      await pg.keyboard.down('KeyZ'); await pg.wait_for_timeout(120); await pg.keyboard.up('KeyZ'); await pg.wait_for_timeout(120)
    r = await pg.evaluate('(()=>{const s=__calzone.Emu.search; const n=s.filter("eq",7); return {n, has:[...s.addrs].includes(0x03000020), h:__calzone.core.r16(0x03000020)}})()')
    print('ram search', r)
    # cheat: lock health to 100 via raw, CodeBreaker and GameShark-encoded forms
    r = await pg.evaluate('''(async()=>{const E=__calzone.Emu; E.cheats=[{name:'hp',code:'03000020:0064',fmt:'auto',on:true}]; await E.saveCheats(); await new Promise(r=>setTimeout(r,300)); const a=__calzone.core.r16(0x03000020);
      E.cheats=[{name:'cb',code:'83000020 0032',fmt:'auto',on:true}]; await E.saveCheats(); await new Promise(r=>setTimeout(r,300)); const b=__calzone.core.r16(0x03000020);
      return {raw:a, cb:b, det:E.cheats[0].detected, err:E.cheats[0].errors}})()''')
    print('cheats', r)
    # GameShark: encrypt test via inverse of decrypt (TEA encrypt), then parse
    r = await pg.evaluate('''(()=>{function enc(a,v,s){let roll=0;for(let k=0;k<32;k++){roll=(roll+0x9E3779B9)>>>0; a=(a+((((v<<4)>>>0)+s[0])^(v+roll)^((v>>>5)+s[1])))>>>0; v=(v+((((a<<4)>>>0)+s[2])^(a+roll)^((a>>>5)+s[3])))>>>0;} return [a,v];}
      const [a,v]=enc(0x13000020,0x2A,GS_SEEDS_V1); const code=hex(a)+' '+hex(v); const r=parseCheat(code,'auto'); return {code, fmt:r.format, ops:r.ops, err:r.errors}})()''')
    print('gs roundtrip', json.dumps(r))
    await pg.evaluate('(async()=>{const E=__calzone.Emu; E.cheats=[]; await E.saveCheats();})()')
    # save state slot 1, move, load
    await pg.evaluate('__calzone.Emu.saveSlot(1)'); await pg.wait_for_timeout(300)
    h1 = await pg.evaluate('__calzone.core.r16(0x03000020)')
    await pg.keyboard.down('KeyZ'); await pg.wait_for_timeout(100); await pg.keyboard.up('KeyZ'); await pg.wait_for_timeout(200)
    h2 = await pg.evaluate('__calzone.core.r16(0x03000020)')
    await pg.evaluate('__calzone.Emu.loadSlot(1)'); await pg.wait_for_timeout(200)
    h3 = await pg.evaluate('__calzone.core.r16(0x03000020)')
    print('state save/load health', h1, h2, h3)
    # rewind: press B twice, then rewind
    await pg.wait_for_timeout(1500)
    hb = await pg.evaluate('__calzone.core.r16(0x03000020)')
    for i in range(2):
      await pg.keyboard.down('KeyZ'); await pg.wait_for_timeout(100); await pg.keyboard.up('KeyZ'); await pg.wait_for_timeout(150)
    await pg.wait_for_timeout(300)
    ha = await pg.evaluate('__calzone.core.r16(0x03000020)')
    c0 = await pg.evaluate('__calzone.Emu.rw.count')
    await pg.keyboard.down('KeyR'); await pg.wait_for_timeout(1400); await pg.keyboard.up('KeyR')
    hr = await pg.evaluate('({h:__calzone.core.r16(0x03000020), c:__calzone.Emu.rw.count, kb:__calzone.Emu.rw.bytes})')
    print('rewind', hb, ha, c0, hr)
    # fast forward
    f0 = await pg.evaluate('__calzone.Emu.frameNo'); await pg.keyboard.down('Space'); await pg.wait_for_timeout(1000); await pg.keyboard.up('Space')
    f1 = await pg.evaluate('__calzone.Emu.frameNo'); print('frames in 1s of FF x3', f1-f0)
    f0 = f1; await pg.wait_for_timeout(1000); f1 = await pg.evaluate('__calzone.Emu.frameNo'); print('frames in 1s normal', f1-f0)
    # shaders + audio fx
    for sh in ['smooth','crisp','lcd','subpixel','scan','crt','dmg','sharp']:
      await pg.evaluate(f'(()=>{{__calzone.S.shader="{sh}"; __calzone.S.colorFix=true; __calzone.S.blend=true;}})()'); await pg.wait_for_timeout(150)
      if sh in ('crt','lcd'): await pg.screenshot(path=f'/tmp/bullpup-s_shader_{sh}.png')
    await pg.evaluate('(()=>{const S=__calzone.S; S.reverb="cathedral"; S.bass=6; __calzone.Audio_.apply(S); S.colorFix=false; S.blend=false; S.shader="sharp";})()')
    # menu UI tabs
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    for t in ['Game','Cheats','Look','Audio','Input','System']:
      await pg.click(f'#tabs button:has-text("{t}")'); await pg.wait_for_timeout(250)
      await pg.screenshot(path=f'/tmp/bullpup-m_{t}.png')
    await pg.click('#sheetClose')
    # landscape
    await pg.set_viewport_size({'width':860,'height':400}); await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/bullpup-s4_land.png')
    await pg.set_viewport_size({'width':420,'height':860}); await pg.wait_for_timeout(300)
    # exit -> library ; reload -> boot count should be 2
    await pg.evaluate('__calzone.Emu.stop()'); await pg.wait_for_timeout(600)
    await pg.screenshot(path='/tmp/bullpup-s5_lib_after.png')
    await pg.reload(); await pg.wait_for_function('!document.getElementById("boot")')
    await pg.evaluate('(async()=>{const S=__calzone.S; S.autoResume=false;})()')
    await pg.click('.card'); await pg.wait_for_timeout(800)
    sram0 = await pg.evaluate('__calzone.core.sram()[0]'); print('boots counter in SRAM after reload', sram0)
    await pg.screenshot(path='/tmp/bullpup-s6_reboot.png')
    print('\n'.join(errs) or 'no console errors')
    await b.close()
asyncio.run(main())
