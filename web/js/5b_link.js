/* ============================================================
   Link cable: two phones over Wi-Fi or Bluetooth
   ------------------------------------------------------------
   The core (bullpup_link.c) does the emulation side: it pauses the
   console that drives a transfer until the other side's value arrives.
   This file carries the values between phones. Lines on the wire:
     h,<ver>,<platform>,<title>   hello, sent once by both sides
     x,<seq>,<mode>,<value>       a transfer we drove
     r,<seq>,<value>              the answer to the other side's transfer
     p,<t> / q,<t>                ping and pong, for the status line
     b                            bye
   ============================================================ */
const LINK_VER = 1;
const Link = {
  state: 'off',   // off | hosting | searching | connecting | linked
  how: '', role: '', peer: '', ip: '', found: [], error: '',
  active: false, mb: 0, waitSince: 0, rtt: 0, helloSent: false, gotHello: false,
  get native() { return window.BullpupLink || null; },
  get supported() { return !!(this.native && core.m && core.m._mgbawasm_run_link); },

  /* ---------- transport (native, or a test transport) ---------- */
  transport: null,
  send(line) {
    if (this.transport) return this.transport.send(line);
    return this.native ? this.native.send(line) : false;
  },
  closeTransport(why) {
    if (this.transport) this.transport.close?.(why);
    else this.native?.close(why || 'user');
  },

  /* ---------- user actions ---------- */
  deviceName() { return `Bullpup ${Emu.game?.name?.slice(0, 20) || ''}`.trim() + ' ' + Math.floor(Math.random() * 900 + 100); },
  hostWifi() { this.reset(); this.state = 'hosting'; this.how = 'wifi'; this.native.hostWifi(this.deviceName()); this.changed(); },
  searchWifi() { this.reset(); this.state = 'searching'; this.how = 'wifi'; this.found = []; this.native.search(); this.changed(); },
  joinWifi(ip, port) { this.native.stopSearch(); this.state = 'connecting'; this.how = 'wifi'; this.peer = ip; this.native.joinWifi(ip, port || 0); this.changed(); },
  btReady(then) {
    const st = this.native.btState();
    if (st === 'ok') return then();
    if (st === 'noperm') { this._afterPerm = then; this.native.askPermission(); return; }
    this.error = st === 'off' ? 'Bluetooth is off. Turn it on and try again.' : 'This phone has no Bluetooth.'; this.changed();
  },
  hostBt() { this.btReady(() => { this.reset(); this.state = 'hosting'; this.how = 'bt'; this.native.hostBt(); this.changed(); }); },
  searchBt() { this.btReady(() => { this.reset(); this.state = 'searching'; this.how = 'bt'; try { this.found = JSON.parse(this.native.pairedDevices()); } catch (e) { this.found = []; } this.changed(); }); },
  joinBt(address, name) { this.state = 'connecting'; this.how = 'bt'; this.peer = name; this.native.joinBt(address); this.changed(); },
  cancel() { if (this.state === 'linked') this.send('b'); this.closeTransport('user'); this.detach(); this.reset(); this.changed(); },
  reset() { this.state = 'off'; this.error = ''; this.found = []; this.peer = ''; this.ip = ''; this.helloSent = this.gotHello = false; this.earlyHello = null; },

  /* ---------- link up / down ---------- */
  onConnected(info) {
    this.role = info.role; this.how = info.how; this.peer = info.peer || this.peer; this.state = 'connecting';
    this.helloSent = true;
    this.send(`h,${LINK_VER},${core.platform},${(Emu.game?.name || '').replace(/[,\n]/g, ' ').slice(0, 40)}`);
    // their hello can beat our own "connected" event; it was parked until we knew our role
    if (this.earlyHello) { const p = this.earlyHello; this.earlyHello = null; this.onHello(p); }
    this.changed();
  },
  onHello(p) {
    if (!this.helloSent) { this.earlyHello = p; return; }
    if (this.active) return;
    this.gotHello = true;
    if (+p[1] !== LINK_VER) return this.fail('The other phone has a different version of Brad\'s Bullpup. Update both.');
    if (!Emu.active) return this.fail('Start a game on both phones first');
    if (+p[2] !== core.platform) return this.fail('One phone is running a GBA game and the other a Game Boy game. Those can\'t link.');
    this.peerGame = p.slice(3).join(',');
    this.attach();
  },
  attach() {
    if (!Emu.active || !core.m._mgbawasm_link_set_role(this.role === 'host' ? 1 : 2)) { this.fail('Start a game first'); return; }
    this.mb = core.m._mgbawasm_link_mailbox() >> 2;
    this.active = true; this.state = 'linked'; this.waitSince = 0; this.rtt = 0; this._t0 = Math.round(performance.now());
    Emu.ffToggle = false; Emu.rewinding = false; Input.holds.delete('ff_hold'); Input.holds.delete('rw_hold');
    clearInterval(this._ping); this._ping = setInterval(() => this.send('p,' + Math.round(performance.now())), 2000);
    toast(`Link cable connected${this.peer ? ' to ' + this.peer : ''}`); haptic('medium');
    Emu.hud(); this.changed();
  },
  detach() {
    clearInterval(this._ping);
    if (this.active && core.loaded) core.m._mgbawasm_link_set_role(0);
    this.active = false; this.waitSince = 0;
    if (Emu.linkStalled) { Emu.linkStalled = false; }
    Emu.hud?.();
  },
  fail(msg) { this.send('b'); this.closeTransport('error'); this.detach(); this.reset(); this.error = msg; this.changed(); toast(msg); },
  onClosed(reason) {
    const was = this.active || this.state !== 'off';
    this.detach(); this.reset();
    if (was && reason !== 'restart') { this.error = reason || 'Link closed'; toast(this.error); }
    this.changed();
  },

  /* ---------- per frame ---------- */
  stats() { const H = core.m.HEAP32, b = this.mb; return { transfers: H[b + 5], timeouts: H[b + 6] }; },
  flush() {
    const H = core.m.HEAP32, b = this.mb;
    if (H[b + 7]) { const seq = H[b + 8], v = H[b + 9] >>> 0; core.m._mgbawasm_link_reply_sent(); this.send(`r,${seq},${v}`); }
    if (H[b]) { const seq = H[b + 1], mode = H[b + 2], v = H[b + 3] >>> 0; core.m._mgbawasm_link_out_sent(); this.send(`x,${seq},${mode},${v}`); }
  },
  get rxPending() { return !!core.m.HEAP32[this.mb + 10]; },
  // Runs the rest of the current frame: 1 when it finished, 0 while the core waits for the
  // other phone, 2 when stopOnReply is set and our answer to their transfer just went out.
  runFrame(stopOnReply) {
    for (let i = 0; i < 4096; i++) {
      const done = core.m._mgbawasm_run_link();
      this.flush();
      if (done) { this.waitSince = 0; return 1; }
      if (core.m._mgbawasm_link_waiting()) { if (!this.waitSince) this.waitSince = performance.now(); return 0; }
      if (stopOnReply && !this.rxPending) return 2;
    }
    return 0;
  },
  watchdog(now) {
    // a partner that stopped answering (app closed, out of range) would freeze us forever
    if (this.waitSince && now - this.waitSince > 15000) { core.m._mgbawasm_link_timeout(); this.waitSince = 0; toast('The other phone isn\'t answering'); }
  },

  /* ---------- incoming ---------- */
  onLine(line) {
    const p = line.split(',');
    switch (p[0]) {
      case 'x': {
        if (!this.active) return;
        core.m._mgbawasm_link_request(+p[1], +p[2], (+p[3]) >>> 0);
        this.flush();
        if (this.rxPending) Emu.linkService(); // our game isn't ready yet: run it a little until it is
        else Emu.linkKick();
        break;
      }
      case 'r':
        if (!this.active) return;
        core.m._mgbawasm_link_reply(+p[1], (+p[2]) >>> 0);
        Emu.linkKick();
        break;
      case 'h': this.onHello(p); break;
      case 'p': this.send('q,' + p[1]); break;
      case 'q': this.rtt = Math.max(0, performance.now() - +p[1]); if (Sheet.isOpen && Sheet.tab === 'game') this.paintStatus(); break;
      case 'b': this.closeTransport('peer'); this.onClosed('The other phone disconnected'); break;
    }
  },

  /* ---------- UI ---------- */
  changed() { if (typeof Sheet !== 'undefined' && Sheet.isOpen && Sheet.tab === 'game') Sheet.render(); },
  paintStatus() {
    const el = document.getElementById('linkStat'); if (!el || !this.active) return;
    const s = this.stats();
    el.textContent = `${this.how === 'bt' ? 'Bluetooth' : 'Wi-Fi'} · you are player ${this.role === 'host' ? 1 : 2} · ${s.transfers} transfers${this.rtt ? ` · ${Math.round(this.rtt)} ms ping` : ''}`;
  },
};

// events from the Android app's LinkManager
window.bullpupLinkEvent = (type, data) => {
  let d = data; try { d = JSON.parse(data); } catch (e) {}
  if (type === 'hosting') { Link.ip = d.ip; Link.hostName = d.name; Link.changed(); }
  else if (type === 'found') { if (!Link.found.some(f => f.ip === d.ip)) { Link.found.push(d); Link.changed(); } }
  else if (type === 'connected') Link.onConnected(d);
  else if (type === 'closed') Link.onClosed(d);
  else if (type === 'error') { Link.reset(); Link.error = d; Link.changed(); }
  else if (type === 'perm') { if (d === 'granted' && Link._afterPerm) Link._afterPerm(); else if (d !== 'granted') { Link.error = 'Bluetooth needs the Nearby devices permission. You can allow it in Android settings, Apps, Brad\'s Bullpup.'; Link.changed(); } Link._afterPerm = null; }
};
window.bullpupLinkMsg = line => Link.onLine(line);
