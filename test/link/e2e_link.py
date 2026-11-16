"""Two copies of the app, linked through a relay that stands in for the Wi-Fi socket.

python3 test/link/e2e_link.py [rom] [seconds] [delay_ms]
Boots the link test ROM on both, connects them as host and guest, and checks that
values cross the link in both directions. delay_ms adds latency each way to mimic
a real network (try 5 for Wi-Fi, 30 for Bluetooth).
"""
import asyncio, pathlib, sys, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = (ROOT / 'dist/Brads_Bullpup.html').as_uri()
ROM = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'test/link/gba_link.gba'
SECS = float(sys.argv[2]) if len(sys.argv) > 2 else 4
DELAY = float(sys.argv[3]) / 1000 if len(sys.argv) > 3 else 0.0

FAKE = """
window.CalzoneAndroid = { haptic(){}, save: () => '', padNames: () => '' };
window.BullpupLink = {
  send(line) { window.__out(line); return true; },
  close() {}, search() {}, stopSearch() {}, localIp: () => '10.0.0.1', btState: () => 'ok',
  hostWifi(name) { setTimeout(() => bullpupLinkEvent('hosting', JSON.stringify({how:'wifi', name, ip:'10.0.0.1', port:47823})), 0); },
  joinWifi(ip) { window.__join(); },
};
"""

async def boot(b, name, log):
    ctx = await b.new_context(viewport={'width': 400, 'height': 860}, has_touch=True, is_mobile=True)
    await ctx.add_init_script(FAKE)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log.append(f'{name} PAGEERR {e}'))
    pg.on('console', lambda m: log.append(f'{name} {m.type}: {m.text}') if m.type == 'error' else None)
    await pg.goto(URL)
    await pg.wait_for_function('!document.getElementById("boot")', timeout=20000)
    async with pg.expect_file_chooser() as fc:
        await pg.click('#btnAdd2')
    await (await fc.value).set_files(str(ROM))
    await pg.wait_for_selector('.card'); await pg.click('.card'); await pg.wait_for_timeout(600)
    return pg

async def main():
    log = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        host = await boot(b, 'host', log)
        guest = await boot(b, 'guest', log)
        queues = {host: asyncio.Queue(), guest: asyncio.Queue()}
        count = {'msgs': 0}

        async def pump(dst):
            q = queues[dst]
            while True:
                line = await q.get()
                if DELAY: await asyncio.sleep(DELAY)
                count['msgs'] += 1
                try: await dst.evaluate('l => bullpupLinkMsg(l)', line)
                except Exception as e: log.append(f'relay {e}'); return
        tasks = [asyncio.create_task(pump(host)), asyncio.create_task(pump(guest))]
        await host.expose_function('__out', lambda line: queues[guest].put_nowait(line))
        await guest.expose_function('__out', lambda line: queues[host].put_nowait(line))
        await guest.expose_function('__join', lambda: None)

        if ROM.suffix != '.gba':
            await host.keyboard.down('KeyX')  # hold A so the host's ROM picks the master role
            await asyncio.sleep(0.4)
        for pg in (host, guest):
            await pg.evaluate("(() => { const o = window.bullpupLinkMsg; window.__rx = []; window.bullpupLinkMsg = l => { __rx.push(l); if (__rx.length > 8) __rx.shift(); try { o(l); } catch (e) { __rx.push('ERR ' + e); throw e; } }; })()")
        await host.evaluate('Link.hostWifi()')
        await guest.evaluate('Link.joinWifi("10.0.0.1")')
        await host.evaluate('bullpupLinkEvent("connected", JSON.stringify({how:"wifi", role:"host", peer:"guest"}))')
        await guest.evaluate('bullpupLinkEvent("connected", JSON.stringify({how:"wifi", role:"guest", peer:"host"}))')
        await host.wait_for_function('Link.active', timeout=5000); await guest.wait_for_function('Link.active', timeout=5000)

        read = '''(() => { const c = __calzone.core, r = a => c.r16(0x03007000 + a * 2);
          return { frames: r(0), good: r(1), last: r(2).toString(16), bad: r(3), p2: r(4), plat: c.platform,
                   transfers: Link.stats().transfers, timeouts: Link.stats().timeouts, fps: Math.round(__calzone.Emu.fps) } })()'''
        gbread = '''(() => { const m = __calzone.core.m, r = a => m._mgbawasm_bus_read8(0xC000 + a);
          return { good: r(0), bad: r(1), last: r(2).toString(16), master: r(3), plat: __calzone.core.platform,
                   transfers: Link.stats().transfers, timeouts: Link.stats().timeouts, fps: Math.round(__calzone.Emu.fps) } })()'''
        rd = read if ROM.suffix == '.gba' else gbread
        await asyncio.sleep(0.5)
        h0 = await host.evaluate(rd); g0 = await guest.evaluate(rd)
        t0 = time.time()
        await asyncio.sleep(SECS)
        hs = await host.evaluate(rd)
        gs = await guest.evaluate(rd)
        for a, z in ((hs, h0), (gs, g0)):
            a['good_in_window'] = (a['good'] - z['good']) & (0xFF if ROM.suffix != '.gba' else 0xFFFF)
            a['bad_in_window'] = (a['bad'] - z['bad']) & (0xFF if ROM.suffix != '.gba' else 0xFFFF)
        el = time.time() - t0
        print(f'{SECS:.0f}s, delay {DELAY*1000:.0f} ms each way, {count["msgs"]} messages relayed')
        print('host ', hs)
        print('guest', gs)
        await host.screenshot(path='/tmp/t/link_host.png'); await guest.screenshot(path='/tmp/t/link_guest.png')
        # disconnect from the guest side and make sure the host notices
        print("guest before cancel", await guest.evaluate("[Link.state, Link.active]"))
        sent = count["msgs"]
        await guest.evaluate("Link.cancel()"); await asyncio.sleep(1.5)
        print('messages relayed after cancel:', count['msgs'] - sent, ' host queue:', queues[host].qsize())
        print("host link state", await host.evaluate("[Link.state, Link.error]"), 'last lines', await host.evaluate('__rx'))
        print('after guest disconnect: host active =', await host.evaluate('Link.active'), ', guest active =', await guest.evaluate('Link.active'))
        for t in tasks: t.cancel()
        print('errors', log[:10])
        await b.close()

asyncio.run(main())
