/* ============================================================
   Core wrapper around the mGBA wasm build (single-threaded)
   ============================================================ */
const KEY_BIT = { a: 0, b: 1, select: 2, start: 3, right: 4, left: 5, up: 6, down: 7, r: 8, l: 9 };
const GBA_STATE_SIZE = 0x61000, ST_IWRAM = 0x19000, ST_WRAM = 0x21000;
function bytesIndexOf(hay, str) {
  const n = [...str].map(c => c.charCodeAt(0)), f = n[0], L = n.length;
  outer: for (let i = hay.indexOf(f); i >= 0 && i <= hay.length - L; i = hay.indexOf(f, i + 1)) {
    for (let k = 1; k < L; k++) if (hay[i + k] !== n[k]) continue outer;
    return i;
  }
  return -1;
}

class Core {
  async init() {
    const wasmBinary = b64ToBytes(WASM_B64);
    this.m = await createMgbaModule({
      instantiateWasm(imports, done) { WebAssembly.instantiate(wasmBinary, imports).then(r => done(r.instance)); return {}; },
      print() {}, printErr(t) { console.debug('[mgba]', t); },
    });
    this.m._mgbawasm_init();
    this.m._mgbawasm_set_log_level(0);
    this.loaded = false;
    this.audioPtr = this.m._malloc(4096 * 4);
  }
  _alloc(bytes) { const p = this.m._malloc(bytes.length); this.m.HEAPU8.set(bytes, p); return p; }
  load(rom, bios, opts = {}) {
    const m = this.m;
    if (this.loaded) this.unload();
    const rp = this._alloc(rom), bp = bios ? this._alloc(bios) : 0;
    const sysId = opts.system === 'gba' ? 0 : opts.system === 'gb' ? 1 : -1;
    const ok = m._mgbawasm_load(rp, rom.length, bp, bios ? bios.length : 0, sysId, 0, opts.skipBios === false && bios ? 0 : 1);
    m._free(rp); if (bp) m._free(bp);
    if (!ok) return false;
    this.loaded = true;
    this.platform = m._mgbawasm_platform();
    this.stateSize = m._mgbawasm_state_size();
    this.stPtr = m._malloc(this.stateSize);
    this.applyOptions(opts);
    this.locateMemory();
    return true;
  }
  applyOptions(o) {
    const m = this.m;
    m._mgbawasm_set_idle_optimization && m._mgbawasm_set_idle_optimization({ ignore: 0, remove: 1, detect: 2 }[o.idle || 'remove']);
    m._mgbawasm_set_allow_opposing_directions && m._mgbawasm_set_allow_opposing_directions(o.opposing ? 1 : 0);
  }
  unload() { if (!this.loaded) return; this.m._mgbawasm_unload(); this.m._free(this.stPtr); this.loaded = false; this.iw = this.wr = 0; }
  reset() { this.m._mgbawasm_reset(); this.locateMemory(); }
  frame() { this.m._mgbawasm_run_frame(); }
  get fps() { return this.m._mgbawasm_framerate_micro() / 1e6 || 59.7275; }
  get sampleRate() { return this.m._mgbawasm_sample_rate(); }
  setKeys(mask) { if (mask !== this._mask) { this._mask = mask; this.m._mgbawasm_set_keys(mask); } }
  video() {
    const m = this.m, w = m._mgbawasm_video_width(), h = m._mgbawasm_video_height();
    const p = m._mgbawasm_video_ptr();
    return { w, h, data: m.HEAPU8.subarray(p, p + w * h * 4) };
  }
  drainAudio(cb) {
    const m = this.m;
    for (;;) {
      const n = m._mgbawasm_read_audio(this.audioPtr, 4096);
      if (n <= 0) return;
      if (cb) cb(m.HEAP16.slice(this.audioPtr >> 1, (this.audioPtr >> 1) + n * 2), n);
      if (n < 4096) return;
    }
  }
  saveState() { if (!this.m._mgbawasm_state_save(this.stPtr)) return null; return this.m.HEAPU8.slice(this.stPtr, this.stPtr + this.stateSize); }
  saveStateInto(u8) { if (!this.m._mgbawasm_state_save(this.stPtr)) return false; u8.set(this.m.HEAPU8.subarray(this.stPtr, this.stPtr + this.stateSize)); return true; }
  loadState(u8) {
    if (!u8 || u8.length !== this.stateSize) return false;
    this.m.HEAPU8.set(u8, this.stPtr);
    return !!this.m._mgbawasm_state_load(this.stPtr);
  }
  sram() {
    const m = this.m, n = m._mgbawasm_sram_save(); if (!n) return null;
    const p = m._mgbawasm_sram_ptr(); if (!p) return null;
    return m.HEAPU8.slice(p, p + n);
  }
  loadSram(b, rom) {
    if (!b || !b.length) return;
    // mGBA only restores into save memory once the save type is known. For games that are
    // not in its override database the type is detected on first access, which is after the
    // game has already read its save. So the type is set up front: read from the save size,
    // written into a save state's savedata type byte (0x2E0), and loaded before any frame runs.
    if (this.platform === 0 && this.stateSize === GBA_STATE_SIZE) {
      const st = this.saveState();
      if (st && st[0x2E0] === 0xFF) {
        const n = b.length;
        const has = s => rom && bytesIndexOf(rom, s) >= 0;
        const t = n === 0x200 ? 5 : n === 0x2000 ? 4 : n === 0x8000 ? 1 : n === 0x20000 ? 3 : n === 0x10000 ? (has('SRAM_') && !has('FLASH') ? 6 : 2) : 0;
        if (t) { st[0x2E0] = t; this.loadState(st); }
      }
    }
    const p = this._alloc(b); this.m._mgbawasm_sram_load(p, b.length); this.m._free(p);
  }

  /* Find where the emulated work RAM lives inside the wasm heap.
     A random marker is planted in a save state, the state is loaded, and the heap is
     searched for the marker. The originals are restored before any frame runs. */
  locateMemory() {
    this.iw = this.wr = 0;
    if (this.platform !== 0 || this.stateSize !== GBA_STATE_SIZE) return;
    const m = this.m, sp = this.stPtr;
    if (!m._mgbawasm_state_save(sp)) return;
    const OFF_I = 0x7E00, OFF_W = 0x3FE00;
    const H0 = m.HEAPU8;
    const oi = H0.slice(sp + ST_IWRAM + OFF_I, sp + ST_IWRAM + OFF_I + 16), ow = H0.slice(sp + ST_WRAM + OFF_W, sp + ST_WRAM + OFF_W + 16);
    const mi = new Uint8Array(16), mw = new Uint8Array(16);
    crypto.getRandomValues(mi); crypto.getRandomValues(mw);
    H0.set(mi, sp + ST_IWRAM + OFF_I); H0.set(mw, sp + ST_WRAM + OFF_W);
    m._mgbawasm_state_load(sp);
    const H = m.HEAPU8;
    H.set(oi, sp + ST_IWRAM + OFF_I); H.set(ow, sp + ST_WRAM + OFF_W);
    const find = mk => {
      const H32 = new Int32Array(H.buffer, 0, H.byteLength >> 2);
      const dv = new DataView(mk.buffer); const w0 = dv.getInt32(0, true), w1 = dv.getInt32(4, true), w2 = dv.getInt32(8, true), w3 = dv.getInt32(12, true);
      for (let i = 0, n = H32.length - 4; i < n; i++) if (H32[i] === w0 && H32[i + 1] === w1 && H32[i + 2] === w2 && H32[i + 3] === w3) return i * 4;
      return -1;
    };
    const ai = find(mi), aw = find(mw);
    if (ai >= 0) { H.set(oi, ai); this.iw = ai - OFF_I; }
    if (aw >= 0) { H.set(ow, aw); this.wr = aw - OFF_W; }
  }
  get hasMem() { return !!(this.iw && this.wr); }
  /* GBA address -> heap index (or -1) */
  addr(a) {
    const reg = a >>> 24;
    if (reg === 2) return this.wr + (a & 0x3FFFF);
    if (reg === 3) return this.iw + (a & 0x7FFF);
    return -1;
  }
  r8(a) { const i = this.addr(a); return i < 0 ? 0 : this.m.HEAPU8[i]; }
  r16(a) { const i = this.addr(a); if (i < 0) return 0; const H = this.m.HEAPU8; return H[i] | H[i + 1] << 8; }
  r32(a) { const i = this.addr(a); if (i < 0) return 0; const H = this.m.HEAPU8; return (H[i] | H[i + 1] << 8 | H[i + 2] << 16 | H[i + 3] << 24) >>> 0; }
  w8(a, v) { const i = this.addr(a); if (i >= 0) this.m.HEAPU8[i] = v; }
  w16(a, v) { const i = this.addr(a); if (i >= 0) { const H = this.m.HEAPU8; H[i] = v; H[i + 1] = v >> 8; } }
  w32(a, v) { const i = this.addr(a); if (i >= 0) { const H = this.m.HEAPU8; H[i] = v; H[i + 1] = v >> 8; H[i + 2] = v >> 16; H[i + 3] = v >>> 24; } }
}

/* ============================================================
   Rewind: XOR deltas between consecutive snapshots, run-length
   encoded. Only the newest full snapshot is kept; walking back
   one step is cur ^= delta.
   ============================================================ */
class Rewinder {
  constructor(size, budgetMB) {
    this.n = size >> 2;
    this.cur8 = new Uint8Array(size); this.tmp8 = new Uint8Array(size);
    this.scratch = new Uint32Array(this.n * 2 + 8);
    this.budget = budgetMB * 1048576; this.reset();
  }
  reset() { this.deltas = []; this.head = 0; this.bytes = 0; this.has = false; }
  get count() { return this.deltas.length - this.head; }
  capture(core) {
    if (!core.saveStateInto(this.tmp8)) return;
    if (!this.has) { this.cur8.set(this.tmp8); this.has = true; return; }
    const a = new Uint32Array(this.cur8.buffer), b = new Uint32Array(this.tmp8.buffer), out = this.scratch, n = this.n;
    let o = 0, i = 0;
    while (i < n) {
      let z = i; while (z < n && a[z] === b[z]) z++;
      const zr = z - i; i = z;
      if (i >= n) break;
      let l = i; while (l < n && a[l] !== b[l]) l++;
      out[o++] = zr; out[o++] = l - i;
      for (let k = i; k < l; k++) out[o++] = a[k] ^ b[k];
      i = l;
    }
    const d = out.slice(0, o);
    const t = this.cur8; this.cur8 = this.tmp8; this.tmp8 = t;
    this.deltas.push(d); this.bytes += d.byteLength;
    while (this.bytes > this.budget && this.count > 1) { this.bytes -= this.deltas[this.head].byteLength; this.deltas[this.head++] = null; }
    if (this.head > 512) { this.deltas = this.deltas.slice(this.head); this.head = 0; }
  }
  step(core) {
    if (this.count < 1) return false;
    const d = this.deltas.pop(); this.bytes -= d.byteLength;
    const cur = new Uint32Array(this.cur8.buffer);
    let p = 0, i = 0;
    while (p < d.length) { i += d[p++]; const L = d[p++]; for (let k = 0; k < L; k++) cur[i + k] ^= d[p++]; i += L; }
    core.loadState(this.cur8);
    return true;
  }
}

/* ============================================================
   Cheats: Raw, CodeBreaker, GameShark v1/v2, Action Replay v3
   Constants verified against VBA-M's gbaCheats.cpp.
   ============================================================ */
const GS_SEEDS_V1 = [0x09F4FBBD, 0x9681884A, 0x352027E9, 0xF3DEE5A7];
const GS_SEEDS_V3 = [0x7AA9648F, 0x7FAE6994, 0xC0EFAAD5, 0x42712C57];
function gsDecrypt(addr, val, seeds) {
  let a = addr >>> 0, v = val >>> 0, roll = 0xC6EF3720;
  for (let k = 0; k < 32; k++) {
    v = (v - (((((a << 4) >>> 0) + seeds[2]) ^ (a + roll)) ^ ((a >>> 5) + seeds[3]))) >>> 0;
    a = (a - (((((v << 4) >>> 0) + seeds[0]) ^ (v + roll)) ^ ((v >>> 5) + seeds[1]))) >>> 0;
    roll = (roll - 0x9E3779B9) >>> 0;
  }
  return [a, v];
}
const inRam = a => { const r = a >>> 24; return r === 2 || r === 3; };

/* Returns { ops, errors } ; ops are {t:'w8'|'w16'|'w32'|'or16'|'and16'|'add16'|'if', ...} */
function parseCheat(code, fmt = 'auto') {
  const ops = [], errors = [];
  const lines = code.toUpperCase().split(/\n/).map(s => s.replace(/[^0-9A-F: ]/g, ' ').trim()).filter(Boolean);
  let format = fmt;
  for (const raw of lines) {
    const ln = raw.replace(/\s+/g, ' ');
    let m;
    if ((m = ln.match(/^([0-9A-F]{7,8})\s*:\s*([0-9A-F]{1,8})$/))) {
      const a = parseInt(m[1], 16) >>> 0, v = parseInt(m[2], 16) >>> 0, L = m[2].length;
      ops.push({ t: L <= 2 ? 'w8' : L <= 4 ? 'w16' : 'w32', a, v }); continue;
    }
    if ((m = ln.match(/^([0-9A-F]{8}) ?([0-9A-F]{4})$/)) && (format === 'auto' || format === 'cb')) {
      const a = parseInt(m[1], 16) >>> 0, v = parseInt(m[2], 16), type = a >>> 28, ad = a & 0x0FFFFFFF;
      switch (type) {
        case 3: ops.push({ t: 'w8', a: ad, v: v & 0xFF }); break;
        case 8: ops.push({ t: 'w16', a: ad & ~1, v }); break;
        case 2: ops.push({ t: 'or16', a: ad & ~1, v }); break;
        case 6: ops.push({ t: 'and16', a: ad & ~1, v }); break;
        case 0xE: ops.push({ t: 'add16', a: ad, v }); break;
        case 7: ops.push({ t: 'if', c: 'eq', a: ad & ~1, v }); break;
        case 0xA: ops.push({ t: 'if', c: 'ne', a: ad & ~1, v }); break;
        case 0xB: ops.push({ t: 'if', c: 'gt', a: ad & ~1, v }); break;
        case 0xC: ops.push({ t: 'if', c: 'lt', a: ad & ~1, v }); break;
        case 0xD: ops.push({ t: 'ifkeys', mode: (ad & 0xF0), v }); break;
        case 0: case 1: break; // master code / ROM ident, not needed here
        case 9: errors.push('Encrypted CodeBreaker codes are not supported'); break;
        default: errors.push('Unsupported CodeBreaker type ' + type.toString(16));
      }
      continue;
    }
    if ((m = ln.match(/^([0-9A-F]{8}) ?([0-9A-F]{8})$/))) {
      let a = parseInt(m[1], 16) >>> 0, v = parseInt(m[2], 16) >>> 0;
      if (format === 'auto') {
        if (inRam(a) && ((a & 0x00F00000) === 0)) format = 'raw';
        else {
          const [d1a] = gsDecrypt(a, v, GS_SEEDS_V1);
          const [d3a] = gsDecrypt(a, v, GS_SEEDS_V3);
          const t1 = d1a >>> 28, ok1 = t1 <= 2 && inRam(d1a & 0x0FFFFFFF);
          const t3 = ((d3a >>> 25) & 127) | ((d3a >>> 17) & 0x80), a3 = ((d3a & 0x00F00000) << 4 | (d3a & 0x0003FFFF)) >>> 0;
          const ok3 = (t3 === 0 || t3 === 1 || t3 === 2) && inRam(a3);
          format = ok1 ? 'gs1' : ok3 ? 'ar3' : 'raw';
        }
      }
      if (format === 'raw') { ops.push({ t: 'w32', a, v }); continue; }
      if (format === 'gs1') {
        [a, v] = gsDecrypt(a, v, GS_SEEDS_V1);
        if (v === 0x1DC0DE) continue;
        const t = a >>> 28, ad = a & 0x0FFFFFFF;
        if (t === 0) ops.push({ t: 'w8', a: ad, v: v & 0xFF });
        else if (t === 1) ops.push({ t: 'w16', a: ad, v: v & 0xFFFF });
        else if (t === 2) ops.push({ t: 'w32', a: ad, v });
        else errors.push('Unsupported GameShark code type ' + t.toString(16));
        continue;
      }
      if (format === 'ar3') {
        [a, v] = gsDecrypt(a, v, GS_SEEDS_V3);
        if (v === 0x1DC0DE) continue;
        if (((a >>> 24) & 0xFE) === 0xC4) continue; // master code
        const t = ((a >>> 25) & 127) | ((a >>> 17) & 0x80), ad = ((a & 0x00F00000) << 4 | (a & 0x0003FFFF)) >>> 0;
        if (t === 0 && a !== 0) ops.push({ t: 'fill8', a: ad, v: v & 0xFF, n: (v >>> 8) + 1 });
        else if (t === 1) ops.push({ t: 'fill16', a: ad, v: v & 0xFFFF, n: (v >>> 16) + 1 });
        else if (t === 2) ops.push({ t: 'w32', a: ad, v });
        else errors.push('Unsupported Action Replay code type ' + t.toString(16));
        continue;
      }
    }
    errors.push('Could not read line: ' + raw);
  }
  for (const o of ops) if (o.a !== undefined && !inRam(o.a)) { errors.push('Address ' + hex(o.a) + ' is outside RAM (ROM patches are not supported)'); o.skip = true; }
  return { ops: ops.filter(o => !o.skip), errors, format };
}

function runCheatOps(core, ops, keys) {
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    switch (o.t) {
      case 'w8': core.w8(o.a, o.v); break;
      case 'w16': core.w16(o.a, o.v); break;
      case 'w32': core.w32(o.a, o.v); break;
      case 'or16': core.w16(o.a, core.r16(o.a) | o.v); break;
      case 'and16': core.w16(o.a, core.r16(o.a) & o.v); break;
      case 'add16': core.w16(o.a, (core.r16(o.a) + o.v) & 0xFFFF); break;
      case 'fill8': for (let k = 0; k < o.n; k++) core.w8(o.a + k, o.v); break;
      case 'fill16': for (let k = 0; k < o.n; k++) core.w16(o.a + k * 2, o.v); break;
      case 'if': {
        const m = core.r16(o.a);
        const ok = o.c === 'eq' ? m === o.v : o.c === 'ne' ? m !== o.v : o.c === 'gt' ? m > o.v : m < o.v;
        if (!ok) i++; break;
      }
      case 'ifkeys': {
        const ok = o.mode === 0x20 ? (keys & o.v) !== 0 : o.mode === 0x10 ? (keys & o.v) === o.v : (keys & 0x3FF) === o.v;
        if (!ok) i++; break;
      }
    }
  }
}

/* ============================================================
   RAM search (cheat finder)
   ============================================================ */
class RamSearch {
  constructor(core) { this.core = core; this.reset(16); }
  reset(bits) { this.bits = bits; this.addrs = null; this.prev = null; this.history = 0; }
  read(a) { return this.bits === 8 ? this.core.r8(a) : this.bits === 16 ? this.core.r16(a) : this.core.r32(a); }
  start() {
    const step = this.bits / 8, list = [];
    for (let a = 0x02000000; a < 0x02040000; a += step) list.push(a);
    for (let a = 0x03000000; a < 0x03008000; a += step) list.push(a);
    this.addrs = Uint32Array.from(list);
    this.prev = new Float64Array(this.addrs.length);
    for (let i = 0; i < this.addrs.length; i++) this.prev[i] = this.read(this.addrs[i]);
    this.history = 1;
  }
  filter(mode, x) {
    if (!this.addrs) this.start();
    const A = this.addrs, P = this.prev, keepA = [], keepP = [];
    for (let i = 0; i < A.length; i++) {
      const v = this.read(A[i]), p = P[i];
      let ok;
      switch (mode) {
        case 'eq': ok = v === x; break; case 'ne': ok = v !== x; break;
        case 'changed': ok = v !== p; break; case 'same': ok = v === p; break;
        case 'inc': ok = v > p; break; case 'dec': ok = v < p; break;
        case 'incby': ok = v - p === x; break; case 'decby': ok = p - v === x; break;
      }
      if (ok) { keepA.push(A[i]); keepP.push(v); }
    }
    this.addrs = Uint32Array.from(keepA); this.prev = Float64Array.from(keepP); this.history++;
    return this.addrs.length;
  }
  get count() { return this.addrs ? this.addrs.length : 0; }
}
