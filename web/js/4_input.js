/* ============================================================
   Settings
   ============================================================ */
const DEFAULT_KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyX: 'a', KeyZ: 'b', KeyA: 'l', KeyS: 'r', Enter: 'start', ShiftRight: 'select', Backspace: 'select',
  Space: 'ff_hold', Tab: 'ff_toggle', Backquote: 'rw_hold', KeyR: 'rw_hold', F2: 'qs', F4: 'ql', KeyP: 'pause', KeyN: 'step',
  F12: 'shot', KeyC: 'turbo_a', KeyV: 'turbo_b', Escape: 'menu', Equal: 'slot_next', Minus: 'slot_prev',
};
const DEFAULT_PAD = { 0: 'a', 1: 'b', 2: 'turbo_b', 3: 'turbo_a', 4: 'l', 5: 'r', 6: 'rw_hold', 7: 'ff_hold', 8: 'select', 9: 'start', 10: 'qs', 11: 'ql', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'menu' };
const ACTIONS = [
  ['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['a', 'A'], ['b', 'B'], ['l', 'L'], ['r', 'R'], ['start', 'Start'], ['select', 'Select'],
  ['turbo_a', 'Turbo A'], ['turbo_b', 'Turbo B'], ['ff_hold', 'Fast forward (hold)'], ['ff_toggle', 'Fast forward (toggle)'], ['rw_hold', 'Rewind (hold)'],
  ['qs', 'Quick save'], ['ql', 'Quick load'], ['slot_next', 'Next slot'], ['slot_prev', 'Previous slot'], ['pause', 'Pause'], ['step', 'Frame advance'], ['shot', 'Screenshot'], ['menu', 'Menu'],
];
const DEFAULTS = {
  // video
  shader: 'sharp', colorFix: false, blend: false, aspect: 'native', integer: false, brightness: 1, saturation: 1, contrast: 1, showFps: false,
  // audio
  volume: 1, mute: false, bass: 0, mid: 0, treble: 0, speaker: false, width: 1, reverb: 'off', reverbMix: 0.3, reverbSize: 1, limiter: true, ffAudio: 'chop',
  // speed
  ffSpeed: 3, slowSpeed: 0.5, rewind: true, rewindMB: 64, rewindEvery: 2, rewindRate: 1,
  // controls
  keys: DEFAULT_KEYS, pad: DEFAULT_PAD, haptics: true, ctlOpacity: 0.85, turboRate: 3, showTouch: 'auto', layout: null,
  // look
  theme: 'graphite', accent: 'brass', grid: 'regular', motion: 'full', skin: 'gunmetal', texture: 'auto', btnStyle: 'console', press: 'subtle', labels: true,
  click: 'off', clickVol: 1, haptic: 'light', ambient: 'subtle', bezel: false, glass: false, led: true,
  shell: true, gloss: 'satin', grille: true, decal: 'none', wall: false, wallDim: 0.1, wallBlur: 0,
  // system
  autoResume: true, autoSaveSec: 30, pauseOnMenu: true, pauseHidden: true, skipBios: true, idle: 'remove', opposing: false, wakeLock: true, slot: 1,
};
const S = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('calzone.settings') || '{}'); } catch (e) {}
  const s = Object.assign(structuredClone(DEFAULTS), saved);
  if (!s.v || s.v < 3) { s.btnStyle = 'console'; s.shell = true; s.v = 3; } // 1.3: molded console look by default
  if (s.v < 4) { const P = s.layout && s.layout.portrait; if (P) for (const k of ['rw', 'menu', 'ff']) delete P[k]; s.v = 4; } // respace hotkeys for button wells
  return s;
})();
let _saveT = 0;
function saveSettings() { clearTimeout(_saveT); _saveT = setTimeout(() => { try { localStorage.setItem('calzone.settings', JSON.stringify(S)); } catch (e) {} }, 150); }

/* ============================================================
   Input aggregator
   ============================================================ */
const Input = {
  kb: 0, pad: 0, touch: 0, turbo: 0, holds: new Set(), capture: null, padPrev: {},
  get mask() { return this.kb | this.pad | this.touch; },
  bitOf(act) { return KEY_BIT[act] !== undefined ? 1 << KEY_BIT[act] : 0; },
  init() {
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    window.addEventListener('blur', () => { this.kb = 0; this.touch = 0; this.holds.clear(); Emu.onHoldChange(); });
  },
  onKey(e, down) {
    if (this.capture && down) { e.preventDefault(); this.capture({ type: 'key', code: e.code }); return; }
    if (!Emu.active || e.target.matches?.('input,textarea,select')) return;
    if (!$('#sheet').classList.contains('hidden') && e.code !== 'Escape') return;
    const act = S.keys[e.code]; if (!act) return;
    e.preventDefault();
    if (e.repeat) return;
    this.action(act, down, 'kb');
  },
  action(act, down, src) {
    const bit = this.bitOf(act);
    if (bit) {
      if (src === 'kb') this.kb = down ? this.kb | bit : this.kb & ~bit;
      return;
    }
    if (act === 'turbo_a' || act === 'turbo_b') {
      const b = 1 << KEY_BIT[act === 'turbo_a' ? 'a' : 'b'];
      this.turbo = down ? this.turbo | b : this.turbo & ~b; return;
    }
    if (act === 'ff_hold' || act === 'rw_hold') { down ? this.holds.add(act) : this.holds.delete(act); Emu.onHoldChange(); return; }
    if (!down) return;
    Emu.hotkey(act);
  },
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let mask = 0; const seen = {};
    for (const p of pads) {
      if (!p || !p.connected) continue;
      p.buttons.forEach((b, i) => {
        const pressed = b.pressed || b.value > 0.5;
        if (pressed) seen[i] = true;
        if (this.capture && pressed && !this.padPrev[i]) { this.capture({ type: 'pad', btn: i }); }
        const act = S.pad[i]; if (!act) return;
        const bit = this.bitOf(act);
        if (bit) { if (pressed) mask |= bit; }
        else if (pressed !== !!this.padPrev[i] && !this.capture) this.action(act, pressed, 'pad');
      });
      const ax = p.axes;
      if (ax[0] < -0.45) mask |= 1 << KEY_BIT.left; if (ax[0] > 0.45) mask |= 1 << KEY_BIT.right;
      if (ax[1] < -0.45) mask |= 1 << KEY_BIT.up; if (ax[1] > 0.45) mask |= 1 << KEY_BIT.down;
    }
    this.padPrev = seen; this.pad = mask;
  },
};

/* ============================================================
   Touch controls
   ============================================================ */
const CTL_DEFS = {
  dpad: { label: '', round: true }, a: { label: 'A' }, b: { label: 'B' }, ab: { label: 'A+B', small: true },
  l: { label: 'L', pill: true }, r: { label: 'R', pill: true }, start: { label: 'START', pill: true, small: true }, select: { label: 'SELECT', pill: true, small: true },
  ff: { label: '>>', small: true, act: 'ff_toggle' }, rw: { label: '<<', small: true, act: 'rw_hold' }, menu: { label: 'MENU', small: true, act: 'menu' },
  qs: { label: 'SAVE', small: true, act: 'qs' }, ql: { label: 'LOAD', small: true, act: 'ql' }, ta: { label: 'TA', small: true, act: 'turbo_a' }, tb: { label: 'TB', small: true, act: 'turbo_b' },
};
const LAYOUT_DEFAULT = {
  portrait: {
    dpad: { x: 22, y: 75, s: 38 }, a: { x: 85, y: 70, s: 18 }, b: { x: 66, y: 79, s: 18 }, ab: { x: 82, y: 86, s: 11, v: false },
    l: { x: 13, y: 55, s: 22 }, r: { x: 87, y: 55, s: 22 }, select: { x: 38, y: 93, s: 18 }, start: { x: 62, y: 93, s: 18 },
    rw: { x: 34, y: 55, s: 11 }, menu: { x: 50, y: 55, s: 11 }, ff: { x: 66, y: 55, s: 11 },
    qs: { x: 12, y: 93, s: 13, v: false }, ql: { x: 88, y: 93, s: 13, v: false }, ta: { x: 92, y: 81, s: 10, v: false }, tb: { x: 58, y: 88, s: 10, v: false },
  },
  landscape: {
    dpad: { x: 11, y: 62, s: 36 }, a: { x: 92, y: 55, s: 16 }, b: { x: 81, y: 72, s: 16 }, ab: { x: 92, y: 76, s: 10, v: false },
    l: { x: 7, y: 14, s: 20 }, r: { x: 93, y: 14, s: 20 }, select: { x: 6, y: 92, s: 15 }, start: { x: 94, y: 92, s: 15 },
    rw: { x: 4, y: 34, s: 10 }, menu: { x: 50, y: 7, s: 10 }, ff: { x: 96, y: 34, s: 10 },
    qs: { x: 18, y: 92, s: 11, v: false }, ql: { x: 82, y: 92, s: 11, v: false }, ta: { x: 96, y: 66, s: 9, v: false }, tb: { x: 85, y: 88, s: 9, v: false },
  },
};
const CHEV = '<svg viewBox="0 0 10 10"><path d="M2.6 6.4 5 4 7.4 6.4"/></svg>';
function dpadEl() {
  const d = h('div', { class: 'dpad' }, h('i', { class: 'h' }), h('i', { class: 'v' }), h('span', { class: 'hub' }), h('b', { class: 'u' }), h('b', { class: 'd' }), h('b', { class: 'l' }), h('b', { class: 'r' }));
  for (const k of ['ku', 'kr', 'kd', 'kl']) d.append(h('span', { class: 'dk ' + k, html: '<i class="kw"></i><i class="key">' + CHEV + '</i>' }));
  return d;
}
const Touch = {
  ptrs: new Map(), els: {}, rects: {}, editing: false, sel: null,
  get orient() { return innerWidth > innerHeight ? 'landscape' : 'portrait'; },
  layout() {
    const o = this.orient; S.layout = S.layout || {};
    const L = S.layout[o] = S.layout[o] || {};
    for (const k in LAYOUT_DEFAULT[o]) L[k] = Object.assign({ v: true, o: 1 }, LAYOUT_DEFAULT[o][k], L[k]);
    return L;
  },
  visible() {
    if (S.showTouch === 'on') return true; if (S.showTouch === 'off') return false;
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  },
  build() {
    const ov = $('#overlay'); ov.innerHTML = ''; this.els = {};
    ov.style.display = this.visible() || this.editing ? '' : 'none';
    const L = this.layout(); const vmin = Math.min(innerWidth, innerHeight) / 100;
    for (const k in CTL_DEFS) {
      const d = CTL_DEFS[k], c = L[k]; if (!c) continue;
      const e = h('div', { class: `ctl k-${k}${d.pill ? ' pill' : ''}${d.small ? ' small' : ''}`, 'data-k': k });
      const sz = c.s * vmin;
      e.style.left = c.x + '%'; e.style.top = c.y + '%'; e.style.width = sz + 'px'; e.style.height = (d.pill ? sz * 0.42 : sz) + 'px';
      e.style.opacity = (c.o ?? 1) * S.ctlOpacity;
      if (k === 'dpad') e.append(dpadEl());
      else e.append(h('div', { class: 'face' }, h('span', { class: 'lbl' }, d.label)));
      if (!c.v) { if (!this.editing) continue; e.classList.add('ghost'); }
      ov.append(e); this.els[k] = e;
    }
    this.measure();
    this.syncToggles();
  },
  measure() { this.rects = {}; for (const k in this.els) { const r = this.els[k].getBoundingClientRect(); this.rects[k] = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; } },
  syncToggles() { this.els.ff?.classList.toggle('on', Emu.ffToggle); this.els.ta?.classList.toggle('on', !!(Input.turboLatch & 1)); this.els.tb?.classList.toggle('on', !!(Input.turboLatch & 2)); },
  hit(x, y) {
    let best = null, bd = Infinity;
    for (const k in this.rects) {
      const r = this.rects[k]; const pad = k === 'dpad' ? r.w * 0.2 : Math.min(r.w, r.h) * 0.22;
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) {
        const d = Math.hypot(x - r.cx, y - r.cy) / Math.max(r.w, r.h); if (d < bd) { bd = d; best = k; }
      }
    }
    return best;
  },
  dpadBits(k, x, y) {
    const r = this.rects[k]; const dx = (x - r.cx) / (r.w / 2), dy = (y - r.cy) / (r.h / 2);
    if (Math.hypot(dx, dy) < 0.22) return 0;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI; let m = 0; // -180..180, 0 = right
    if (ang > -67.5 && ang < 67.5) m |= 1 << KEY_BIT.right;
    if (ang > 112.5 || ang < -112.5) m |= 1 << KEY_BIT.left;
    if (ang > 22.5 && ang < 157.5) m |= 1 << KEY_BIT.down;
    if (ang < -22.5 && ang > -157.5) m |= 1 << KEY_BIT.up;
    return m;
  },
  init() {
    const ov = $('#overlay');
    const down = e => {
      Audio_.resume();
      if (this.editing) return this.editDown(e);
      e.preventDefault(); ov.setPointerCapture?.(e.pointerId);
      this.ptrs.set(e.pointerId, { k: null, x: e.clientX, y: e.clientY }); this.update(e);
    };
    const move = e => { if (this.editing) return this.editMove(e); if (!this.ptrs.has(e.pointerId)) return; e.preventDefault(); this.update(e); };
    const up = e => { if (this.editing) return this.editUp(e); const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId); this.release(p); this.recompute(); };
    ov.addEventListener('pointerdown', down); ov.addEventListener('pointermove', move);
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
    ov.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('resize', () => { if (Emu.active) { this.build(); Emu.layoutScreen(); } });
  },
  update(e) {
    const p = this.ptrs.get(e.pointerId); const k = this.hit(e.clientX, e.clientY);
    p.x = e.clientX; p.y = e.clientY;
    if (k !== p.k) {
      const prevAct = p.k && CTL_DEFS[p.k].act;
      if (prevAct) this.release(p);
      p.k = k;
      if (k && CTL_DEFS[k].act) this.press(k);
      if (k) feedback();
    }
    if (k === 'dpad') { const nb = this.dpadBits(k, e.clientX, e.clientY); if (nb !== p.bits && nb) feedback(); p.bits = nb; }
    this.recompute();
  },
  press(k) {
    const act = CTL_DEFS[k].act;
    if (act === 'turbo_a' || act === 'turbo_b') { Input.turboLatch = (Input.turboLatch || 0) ^ (act === 'turbo_a' ? 1 : 2); this.syncToggles(); return; }
    if (act === 'rw_hold') { Input.holds.add('rw_hold'); Emu.onHoldChange(); return; }
    if (act === 'menu') return;
    Input.action(act, true, 'touch');
  },
  release(p) {
    if (!p.k) return; const act = CTL_DEFS[p.k].act;
    if (act === 'rw_hold') { Input.holds.delete('rw_hold'); Emu.onHoldChange(); }
    if (act === 'menu') Emu.hotkey('menu');
  },
  recompute() {
    let m = 0; const pressed = new Set();
    for (const p of this.ptrs.values()) {
      if (!p.k) continue; pressed.add(p.k);
      if (p.k === 'dpad') m |= p.bits || 0;
      else if (p.k === 'ab') m |= 3;
      else if (KEY_BIT[p.k] !== undefined) m |= 1 << KEY_BIT[p.k];
    }
    Input.touch = m;
    for (const k in this.els) this.els[k].classList.toggle('press', pressed.has(k) && k !== 'dpad');
    const dp = this.els.dpad?.firstChild;
    if (dp) for (const d of ['up', 'down', 'left', 'right']) dp.classList.toggle('p-' + d, !!(m & (1 << KEY_BIT[d])));
  },
  clear() { this.ptrs.clear(); Input.touch = 0; this.recompute(); },

  /* ---- layout editor ---- */
  startEdit() {
    this.editing = true; this.sel = null; Emu.pause(true);
    $('#overlay').classList.add('editing'); $('#editBar').classList.remove('hidden'); this.build(); this.selUpdate();
  },
  endEdit() {
    this.editing = false; $('#overlay').classList.remove('editing'); $('#editBar').classList.add('hidden');
    saveSettings(); this.build(); Emu.pause(false);
  },
  editDown(e) {
    const t = e.target.closest('.ctl'); if (!t) return;
    e.preventDefault(); this.sel = t.dataset.k; $$('.ctl').forEach(c => c.classList.toggle('sel', c === t));
    const r = $('#overlay').getBoundingClientRect(); const c = this.layout()[this.sel];
    this.drag = { id: e.pointerId, ox: e.clientX - (c.x / 100) * r.width, oy: e.clientY - (c.y / 100) * r.height, r };
    $('#overlay').setPointerCapture?.(e.pointerId); this.selUpdate();
  },
  editMove(e) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const { r, ox, oy } = this.drag, c = this.layout()[this.sel];
    c.x = clamp((e.clientX - ox) / r.width * 100, 0, 100); c.y = clamp((e.clientY - oy) / r.height * 100, 0, 100);
    const el = this.els[this.sel]; el.style.left = c.x + '%'; el.style.top = c.y + '%';
  },
  editUp() { this.drag = null; },
  selUpdate() {
    const k = this.sel, L = this.layout();
    $('#ebName').textContent = k ? `${(CTL_DEFS[k].label || 'D-pad')}  (${this.orient})` : `Drag controls to move them (${this.orient})`;
    $('#ebSize').disabled = $('#ebOpacity').disabled = $('#ebHide').disabled = !k;
    if (k) { $('#ebSize').value = L[k].s; $('#ebOpacity').value = L[k].o ?? 1; $('#ebHide').textContent = L[k].v ? 'Hide' : 'Show'; }
  },
};
