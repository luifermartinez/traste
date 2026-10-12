// Acordes de cualquier canción: lee el símbolo (inglés o español), encuentra una forma
// tocable (abierta, mini-cejilla o cejilla) y recomienda capo para que sea más fácil.
import { CHORDS, OPEN_MIDI, PC_EN, mod12 } from './music.js';

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ES_LETTER = { Do: 'C', Re: 'D', Mi: 'E', Fa: 'F', Sol: 'G', La: 'A', Si: 'B', DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
const ROOT = 'Do|Re|Mi|Fa|Sol|La|Si|DO|RE|MI|FA|SOL|LA|SI|[A-G]';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Sufijo escrito → calidad de la forma. '~' = se toca una versión simplificada (C9 → C7).
const QUALITY = {
  '': '', M: '', maj: '',
  m: 'm', min: 'm', '-': 'm',
  7: '7',
  maj7: 'maj7', M7: 'maj7', '7M': 'maj7', Maj7: 'maj7', ma7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', maj9: 'maj7~', M9: 'maj7~', '7M9': 'maj7~',
  m7: 'm7', min7: 'm7', '-7': 'm7', m9: 'm7~', m11: 'm7~', m79: 'm7~', 'm7/9': 'm7~',
  sus4: 'sus4', sus: 'sus4', 4: 'sus4', sus2: 'sus2', 2: 'sus2',
  '7sus4': '7sus4', '7sus': '7sus4', '74': '7sus4',
  add9: 'add9', add2: 'add9', 9: '7~', 11: '7~', 13: '7~', '7b9': '7~', '7#9': '7~', 79: '7~', '7/9': '7~', '7(9)': '7~', '7b13': '7~',
  6: '6', 69: '6', '6/9': '6', m6: 'm6',
  dim: 'dim', 'º': 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', 'º7': 'dim7', '°7': 'dim7', o7: 'dim7',
  m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'm7(b5)': 'm7b5',
  aug: 'aug', '+': 'aug', '#5': 'aug', '+5': 'aug',
  5: '5',
  mmaj7: 'm~', mM7: 'm~', 'm7M': 'm~',
};
// Si no hay forma para la calidad, se toca esta otra (siempre marcada como simplificada).
const FALLBACK = { add9: [''], 6: [''], m6: ['m'], aug: [''], '7sus4': ['sus4', '7'], dim: ['dim7'], sus2: [''], maj7: [''], sus4: [''], m7b5: ['m'], dim7: ['m'] };

const RE_NOTE = new RegExp(`^(${ROOT})([#b♯♭]?)$`);
const RE_CHORD = new RegExp(`^(${ROOT})([#b]?)(.*)$`);
const RE_CHORD_EN = /^([A-G])([#b]?)(.*)$/;
const RE_SLASH = new RegExp(`^(.*)/((?:${ROOT})[#b]?)$`);

/** Nota escrita ("Bb", "Sib", "FA#") → {pc, name} con nombre en inglés. */
function parseNote(s) {
  const m = RE_NOTE.exec(s);
  if (!m) return null;
  const letter = ES_LETTER[m[1]] || m[1];
  const acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
  return { pc: mod12(LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0)), name: letter + acc };
}

/**
 * Lee un acorde escrito como en las webs de acordes: "Am", "F#m7", "Bb", "G/B", "Lam", "Sol7",
 * "Fa#m", "LAm", "Do7M", "Cadd9", "D°". Devuelve null si no es un acorde.
 * → {sym, root, rootName, suffix, q, approx, bass, bassName}; `sym` es la forma canónica en inglés.
 */
export function parseChord(token) {
  if (!token) return null;
  const t = token.replace(/♯/g, '#').replace(/♭/g, 'b');
  // "Fadd9" o "Faug" empiezan como "Fa": si la lectura en español no cuadra, se prueba en inglés.
  return readChord(RE_CHORD.exec(t)) || readChord(RE_CHORD_EN.exec(t));
}

function readChord(m) {
  if (!m) return null;
  const root = parseNote(m[1] + m[2]);
  let rest = m[3];
  let bass = null;
  const slash = RE_SLASH.exec(rest);
  if (slash) {
    bass = parseNote(slash[2]);
    rest = slash[1];
  }
  const suffix = rest; // como está escrito ("7(9)"), para mostrarlo igual
  const key = rest in QUALITY ? rest : rest.replace(/[()]/g, '');
  if (!(key in QUALITY)) return null;
  const qRaw = QUALITY[key];
  const q = qRaw.replace('~', '');
  return {
    sym: root.name + suffix + (bass ? `/${bass.name}` : ''),
    root: root.pc, rootName: root.name, suffix, q, approx: qRaw.endsWith('~'),
    bass: bass?.pc ?? null, bassName: bass?.name ?? null,
  };
}

const noteName = (pc, flat) => (flat ? FLAT_NAMES : PC_EN)[mod12(pc)];
const prefersFlat = (pc) => pc === 3 || pc === 10 || pc === 8; // Mib, Sib, Lab: lo habitual

/** Sube o baja un acorde `semis` semitonos conservando cómo se escribe ("Bb" -1 → "A"). */
export function transpose(sym, semis) {
  const c = parseChord(sym);
  if (!c) return sym;
  if (!mod12(semis)) return sym;
  const pc = mod12(c.root + semis);
  const flat = c.rootName.includes('b') || prefersFlat(pc);
  const bass = c.bass == null ? '' : `/${noteName(c.bass + semis, flat || prefersFlat(mod12(c.bass + semis)))}`;
  return noteName(pc, flat) + c.suffix + bass;
}

// ─────────────── Formas ───────────────

// Formas abiertas además de las de la ruta (CHORDS). Cuerda 6 → 1; -1 = no tocar.
const OPEN_EXTRA = {
  C7: { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0] },
  Csus4: { frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3] },
  Em7: { frets: [0, 2, 2, 0, 3, 0], fingers: [0, 1, 2, 0, 3, 0] },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  Bm7: { frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3] },
  Fmaj7: CHORDS.Fmaj7,
};
const LIBRARY = { ...CHORDS, ...OPEN_EXTRA };
delete LIBRARY.F; // F y Bm se generan (cejilla o mini-cejilla) como el resto
delete LIBRARY.Bm;

// Plantillas móviles: desplazamiento desde el traste de la raíz (null = no tocar).
const SHAPE_E = { // raíz en la 6ª
  '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0], '7sus4': [0, 2, 0, 2, 0, 0], 5: [0, 2, 2, null, null, null], maj7: [0, null, 1, 1, 0, null],
};
const SHAPE_A = { // raíz en la 5ª
  '': [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], 7: [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0], sus2: [null, 0, 2, 2, 0, 0], sus4: [null, 0, 2, 2, 3, 0], '7sus4': [null, 0, 2, 0, 3, 0],
  5: [null, 0, 2, 2, null, null], m7b5: [null, 0, 1, 0, 1, null], dim7: [null, 0, 1, -1, 1, null],
};

/** Dedos razonables para una forma: cejilla con el 1 si hace falta, luego 2, 3, 4 por traste. */
function fingerize(frets) {
  const fingers = [0, 0, 0, 0, 0, 0];
  const pressed = frets.map((f, i) => [f, i]).filter(([f]) => f > 0);
  if (!pressed.length) return { fingers, barre: null };
  const minF = Math.min(...pressed.map(([f]) => f));
  const atMin = pressed.filter(([f]) => f === minF).map(([, i]) => i);
  const from = atMin[0];
  const barre = atMin.length >= 2 && atMin.includes(5) && frets.slice(from).every((f) => f === -1 || f >= minF) ? minF : null;
  let next = 1;
  if (barre) { atMin.forEach((i) => { fingers[i] = 1; }); next = 2; }
  pressed.filter(([f]) => !(barre && f === barre)).sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([, i]) => { fingers[i] = next++; });
  return { fingers, barre, count: next - 1 };
}

const soundingPcs = (frets) => frets.map((f, i) => (f < 0 ? null : mod12(OPEN_MIDI[6 - i] + f))).filter((x) => x != null);

/** 'open' | 'mini' | 'barre' según lo que exige la mano. */
function kindOf(shape) {
  const fr = shape.frets;
  const pressed = fr.filter((f) => f > 0);
  if (shape.barre) return fr[0] < 0 && fr[1] < 0 ? 'mini' : 'barre';
  if (fr.includes(0) && Math.max(0, ...pressed) <= 4) return 'open';
  return pressed.length <= 4 && Math.max(0, ...pressed) <= 7 ? 'mini' : 'barre';
}
const KIND_SCORE = { open: 1, mini: 2, barre: 3 };
const score = (s) => KIND_SCORE[s.kind] + (Math.min(...s.frets.filter((f) => f > 0).concat(99)) > 5 ? 1 : 0);

function fromTemplate(tpl, r, rootPc, mini) {
  const frets = tpl.map((o) => (o == null ? -1 : r + o));
  if (frets.some((f, i) => tpl[i] != null && f < 0)) return null;
  if (mini) { frets[0] = -1; frets[1] = -1; }
  const pcs = soundingPcs(frets);
  if (pcs.length < 3 || !pcs.includes(rootPc)) return null;
  const { fingers, barre, count } = fingerize(frets);
  if (count > 4) return null;
  return { frets, fingers, barre };
}

function candidates(rootPc, q, easy) {
  const out = [];
  const lib = LIBRARY[PC_EN[rootPc] + q];
  if (lib) out.push({ ...lib });
  for (const [tpls, low] of [[SHAPE_E, 4], [SHAPE_A, 9]]) {
    const tpl = tpls[q];
    if (!tpl) continue;
    const r = mod12(rootPc - low);
    for (const mini of easy ? [false, true] : [false]) {
      const s = fromTemplate(tpl, r, rootPc, mini);
      if (s) out.push(s);
    }
  }
  return out;
}

const cache = new Map();

/**
 * Forma para tocar `sym`. easy: permite mini-cejillas (4 cuerdas) en vez de cejilla completa.
 * → {frets, fingers, barre, kind, approx, played} — `played`: calidad realmente tocada.
 */
export function shapeFor(sym, { easy = false } = {}) {
  const key = `${sym}|${easy}`;
  if (cache.has(key)) return cache.get(key);
  const c = parseChord(sym) || parseChord('C');
  let approx = c.approx;
  let found = [];
  const tried = [c.q, ...(FALLBACK[c.q] || [])];
  for (const q of tried) {
    found = candidates(c.root, q, easy);
    if (found.length) { approx ||= q !== c.q; break; }
  }
  if (!found.length) { found = candidates(c.root, c.q.startsWith('m') ? 'm' : '', easy); approx = true; }
  for (const s of found) s.kind = kindOf(s);
  // Más fácil primero; a igualdad, la forma de la biblioteca (va primera) o la más grave.
  const best = found.reduce((a, b) => (score(b) < score(a) ? b : a));
  const out = { ...best, approx };
  cache.set(key, out);
  return out;
}

/** Notas MIDI del acorde, de grave a agudo (con capo, `capo` trastes más agudas). */
export function chordMidis(sym, { easy = false, capo = 0 } = {}) {
  const out = [];
  shapeFor(sym, { easy }).frets.forEach((f, i) => { if (f >= 0) out.push(OPEN_MIDI[6 - i] + f + capo); });
  return out;
}

/** Dificultad de tocar un acorde: 1 abierto, 2 mini-cejilla, 3 cejilla (+1 arriba del traste 5). */
export const chordDifficulty = (sym, opts) => score(shapeFor(sym, opts));

/**
 * Para acordes que suenan como `sounding`, prueba capo 0–7 y ordena por facilidad.
 * Un capo alto cambia mucho el timbre, así que cuesta un poco; el de la hoja original
 * (`prefer`) tiene ventaja porque es el arreglo que suena en la grabación.
 * → [{capo, total, played: [sym…]}], el primero es el recomendado.
 */
export function capoOptions(sounding, { easy = false, prefer = 0 } = {}) {
  const uniq = [...new Set(sounding)];
  const opts = [];
  for (let capo = 0; capo <= 7; capo++) {
    const played = uniq.map((s) => transpose(s, -capo));
    const total = played.reduce((a, s) => a + chordDifficulty(s, { easy }), 0) + capo * 0.2 - (capo === prefer ? 0.3 : 0);
    opts.push({ capo, total, played });
  }
  return opts.sort((a, b) => a.total - b.total);
}
