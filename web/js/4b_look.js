/* ============================================================
   Look: themes, accents, controller skins, button feel, live effects
   ============================================================ */
// [fill, ink on fill, text on dark, text on light]
const ACCENTS = {
  brass: ['#d9a441', '#1a1307', '#e3b55c', '#94650f', 'Brass'],
  cobalt: ['#4c8dff', '#06132b', '#7aa9ff', '#1f5fd1', 'Cobalt'],
  mint: ['#5fd3b5', '#04201a', '#86e0c8', '#1b7d65', 'Mint'],
  moss: ['#8fb36a', '#132008', '#a8c787', '#4a7526', 'Moss'],
  coral: ['#ff7a59', '#2a0d05', '#ff9a80', '#c2452a', 'Coral'],
  rose: ['#f2709c', '#2a0613', '#f593b5', '#b8325f', 'Rose'],
  silver: ['#c7ccd4', '#14161a', '#d6dae0', '#565c66', 'Silver'],
};
const SKIN_KEYS = ['skin-top', 'skin-bot', 'btn-top', 'btn-bot', 'ab-top', 'ab-bot', 'btn-ink', 'edge', 'plate', 'well', 'engrave', 'engrave-hi'];
const SKINS = {
  gunmetal: { name: 'Gunmetal', v: ['#2a2c31', '#232529', '#3b3e44', '#2e3035', '#45484f', '#36393f', 'rgba(255,255,255,.86)', '#111214', 'rgba(235,235,245,.28)', '#17181b', 'rgba(255,255,255,.52)', 'rgba(0,0,0,.5)'] },
  arctic: { name: 'Arctic', v: ['#eceef1', '#dcdfe4', '#fafafb', '#e4e6ea', '#ffffff', '#eceef1', '#3a3e46', '#a9aeb7', 'rgba(30,32,38,.38)', '#c2c6cd', 'rgba(40,44,52,.36)', 'rgba(255,255,255,.9)'] },
  smoke: { name: 'Clear smoke', clear: true, v: ['rgba(48,50,58,.94)', 'rgba(24,25,30,.97)', 'rgba(74,76,86,.78)', 'rgba(40,41,48,.86)', 'rgba(84,86,96,.82)', 'rgba(46,47,55,.9)', '#ececf2', '#08080a', 'rgba(235,235,245,.34)', 'rgba(6,6,8,.62)', 'rgba(255,255,255,.55)', 'rgba(0,0,0,.5)'] },
  atomic: { name: 'Atomic purple', clear: true, v: ['#5e4192', '#3f2a68', 'rgba(172,142,222,.78)', 'rgba(112,82,168,.88)', 'rgba(188,158,238,.82)', 'rgba(126,94,182,.9)', '#f5f0ff', '#22153a', 'rgba(245,240,255,.42)', 'rgba(28,16,50,.58)', 'rgba(255,255,255,.62)', 'rgba(40,20,70,.6)'] },
  olive: { name: 'Olive drab', v: ['#4b5139', '#3c412e', '#5d6447', '#4b5139', '#6a7151', '#555c41', '#ecefdc', '#22251a', 'rgba(236,239,220,.36)', '#2b2f21', 'rgba(236,239,220,.55)', 'rgba(0,0,0,.45)'] },
  tan: { name: 'Desert tan', v: ['#cbb68c', '#b9a476', '#dcc9a0', '#c5b086', '#e2d1ab', '#ccb88f', '#46392a', '#86734d', 'rgba(70,57,42,.48)', '#9a855c', 'rgba(70,57,42,.42)', 'rgba(255,248,230,.65)'] },
  classic: { name: 'Classic blue', v: ['#3d8ff0', '#1c5ccd', '#f6f7f9', '#d6d9df', '#f6f7f9', '#d6d9df', '#9aa0a9', '#aeb2ba', 'rgba(255,255,255,.55)', '#1847a3', 'rgba(60,66,78,.26)', 'rgba(255,255,255,.9)'] },
  raygun: { name: 'Ray gun', v: ['#93e2cd', '#5ec4ab', '#fff8de', '#eee0b6', '#ff7d6e', '#e2513f', '#6b5a3a', '#c8b88c', 'rgba(20,70,58,.5)', '#3e9b85', 'rgba(90,70,40,.34)', 'rgba(255,255,255,.85)'] },
  soaker: { name: 'Water blaster', v: ['#ffa04f', '#ef7820', '#5ea6ff', '#2f7be6', '#ffe169', '#f5c518', '#ffffff', '#1d58b8', 'rgba(90,30,0,.5)', '#c3570e', 'rgba(255,255,255,.58)', 'rgba(0,0,0,.25)'] },
  bubble: { name: 'Bubblegum', v: ['#ffb6d8', '#f48bbc', '#ffffff', '#efe5ee', '#a3e4ff', '#63c8f2', '#b07a98', '#d6bccd', 'rgba(120,30,80,.45)', '#d46aa0', 'rgba(150,60,110,.3)', 'rgba(255,255,255,.92)'] },
  signal: { name: 'Signal red', v: ['#b8382e', '#9b2c24', '#c9473b', '#ab352c', '#2d2d30', '#1f1f22', '#fff3ef', '#56140f', 'rgba(255,240,235,.48)', '#6c1b14', 'rgba(255,240,235,.6)', 'rgba(0,0,0,.4)'] },
};

function applyLook() {
  const r = document.documentElement, d = r.dataset;
  d.theme = S.theme; d.btn = S.btnStyle; d.press = S.press; d.labels = S.labels ? 'on' : 'off';
  d.amb = S.ambient; d.shell = S.shell ? 'on' : 'off'; d.gloss = S.gloss; d.grille = S.grille ? 'on' : 'off'; d.wall = S.wall && _wallUrl ? 'on' : 'off'; d.bezel = S.bezel ? 'on' : 'off'; d.glass = S.glass ? 'on' : 'off'; d.led = S.led ? 'on' : 'off'; d.motion = S.motion;
  const sk = SKINS[S.skin] || SKINS.gunmetal;
  d.tex = S.texture === 'auto' ? (d.wall === 'on' ? 'matte' : sk.clear ? 'pcb' : 'matte') : S.texture;
  r.style.setProperty('--armory', armoryTile());
  const wall = document.getElementById('wall'); if (wall) wall.style.filter = `blur(${S.wallBlur}px) brightness(${(1 - S.wallDim).toFixed(2)})`;
  const dec = document.getElementById('decal'); if (dec) { dec.innerHTML = SPRITES[S.decal] || ''; dec.classList.toggle('show', !!SPRITES[S.decal]); }
  SKIN_KEYS.forEach((k, i) => r.style.setProperty('--' + k, sk.v[i]));
  if (d.wall === 'on') r.style.setProperty('--well', 'rgba(0,0,0,.34)');
  const a = ACCENTS[S.accent] || ACCENTS.brass;
  r.style.setProperty('--acc', a[0]); r.style.setProperty('--acc-ink', a[1]); r.style.setProperty('--acc-text', S.theme === 'light' ? a[3] : a[2]);
  r.style.setProperty('--cover-min', { compact: '112px', regular: '148px', large: '208px' }[S.grid] || '148px');
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = S.theme === 'light' ? '#f2f2f7' : S.theme === 'oled' ? '#000000' : '#111113';
  if (typeof Emu !== 'undefined' && Emu.active) { Emu.layoutScreen(); Emu.updateLed(); }
}

/* ---- tactile feedback: haptics + synthesized click ---- */
let _noiseBuf = null;
function clickSound(kind = S.click) {
  if (kind === 'off' || !Audio_) return;
  const c = Audio_.ctx; if (c.state !== 'running') return;
  const t = c.currentTime + 0.002, out = c.createGain(); out.connect(c.destination);
  if (!_noiseBuf) { _noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate); const ch = _noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 5); }
  const noise = (type, freq, gain) => { const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = _noiseBuf; f.type = type; f.frequency.value = freq; g.gain.value = gain; n.connect(f).connect(g).connect(out); n.start(t); };
  const tone = (type, f0, f1, dur, gain) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.4); o.connect(g).connect(out); o.start(t); o.stop(t + dur * 1.5); };
  const vol = S.clickVol;
  if (kind === 'soft') tone('sine', 2400, 1100, 0.018, 0.05 * vol);
  else if (kind === 'clicky') { noise('highpass', 2800, 0.5 * vol); tone('square', 3200, 2600, 0.006, 0.015 * vol); }
  else if (kind === 'thock') { tone('triangle', 230, 85, 0.05, 0.22 * vol); noise('bandpass', 1300, 0.12 * vol); }
  else if (kind === 'membrane') { noise('lowpass', 900, 0.35 * vol); tone('sine', 140, 70, 0.03, 0.12 * vol); }
}
function feedback() {
  const ms = { off: 0, light: 6, medium: 12, strong: 22 }[S.haptic] || 0;
  if (ms) navigator.vibrate?.(ms);
  clickSound();
}

/* ---- ambient glow from the game picture ---- */
let _ambLast = '';
function sampleAmbient() {
  const { data } = core.video(); let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 31) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  if (!n) return;
  r /= n; g /= n; b /= n;
  const m = (r + g + b) / 3, k = 1.7; r = m + (r - m) * k; g = m + (g - m) * k; b = m + (b - m) * k;
  const mx = Math.max(r, g, b, 1), lift = Math.min(2.2, 210 / mx); r *= lift; g *= lift; b *= lift;
  const q = v => clamp(Math.round(v / 8) * 8, 0, 255);
  const col = `rgb(${q(r)},${q(g)},${q(b)})`;
  if (col !== _ambLast) { _ambLast = col; $('#amb').style.backgroundColor = col; }
}

/* ---- pixel armory pattern, built once from the sprites ---- */
let _armory = '';
function spriteInner(svg) { const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/); return { w: +vb[1], h: +vb[2], body: svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') }; }
function armoryTile() {
  if (_armory) return _armory;
  const place = [['pistol', 6, 6, 26, -12], ['raygun', 58, 4, 44, 8], ['soaker', 18, 40, 46, -6], ['bubble', 78, 40, 32, 14]];
  let g = '';
  for (const [k, x, y, w, rot] of place) { const sp = spriteInner(SPRITES[k]); const hh = w * sp.h / sp.w; g += `<g transform="rotate(${rot} ${x + w / 2} ${y + hh / 2})"><svg x="${x}" y="${y}" width="${w}" height="${hh}" viewBox="0 0 ${sp.w} ${sp.h}" shape-rendering="crispEdges">${sp.body}</svg></g>`; }
  _armory = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">${g}</svg>`)}")`;
  return _armory;
}
function spriteFor(seed) { const keys = ['pistol', 'revolver', 'raygun', 'soaker', 'sniper', 'bubble', 'bullpup']; let n = 0; for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) >>> 0; return SPRITES[keys[n % keys.length]]; }

/* ---- custom wallpaper on the device body ---- */
let _wallUrl = null;
function applyWall(u) { _wallUrl = u || null; const w = document.getElementById('wall'); if (w) w.style.backgroundImage = u ? `url(${u})` : ''; document.documentElement.style.setProperty('--wall-url', u ? `url(${u})` : 'none'); }
async function loadWallpaper() { try { applyWall(await DB.get('kv', 'wallpaper')); } catch (e) {} applyLook(); }
async function setWallpaperFromFile(f) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.86);
  await DB.put('kv', 'wallpaper', url); S.wall = true; saveSettings(); applyWall(url); applyLook();
}
async function clearWallpaper() { await DB.del('kv', 'wallpaper'); S.wall = false; saveSettings(); applyWall(null); applyLook(); }
