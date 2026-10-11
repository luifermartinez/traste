// Teoría básica: nombres de notas, afinación, acordes, escalas y patrones rítmicos.

export const PC_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const PC_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LETTER_ES = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

let notation = 'both';
export const setNotation = (n) => { notation = n; };
export const getNotation = () => notation;
/** Nombre corto (sin doble notación) para espacios pequeños. */
export const pcShort = (pc) => pcName(pc, notation === 'en' ? 'en' : 'es');

export const mod12 = (n) => ((n % 12) + 12) % 12;

/** Nombre de una clase de altura (0 = Do) según la notación elegida. */
export function pcName(pc, mode = notation) {
  const es = PC_ES[mod12(pc)];
  const en = PC_EN[mod12(pc)];
  if (mode === 'es') return es;
  if (mode === 'en') return en;
  return `${es} (${en})`;
}

/** "Am" → "Lam (Am)", "Fmaj7" → "Famaj7 (Fmaj7)". */
export function chordName(sym, mode = notation) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  const es = LETTER_ES[m[1]] + m[2] + m[3];
  if (mode === 'es') return es;
  if (mode === 'en') return sym;
  return `${es} (${sym})`;
}

// Afinación estándar. Cuerda 1 = Mi agudo (la más fina).
export const OPEN_MIDI = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
export const STRING_NUMS = [6, 5, 4, 3, 2, 1];
export const fretMidi = (s, f) => OPEN_MIDI[s] + f;
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const stringName = (s) => `${s}ª (${pcName(OPEN_MIDI[s])})`;

/** Todas las posiciones (cuerda/traste) donde suena una nota MIDI exacta. */
export function positionsOf(midi, maxFret = 12) {
  const out = [];
  for (const s of STRING_NUMS) {
    const f = midi - OPEN_MIDI[s];
    if (f >= 0 && f <= maxFret) out.push({ s, f });
  }
  return out;
}

// Acordes: frets de la cuerda 6 a la 1 (-1 = no tocar). fingers: 1 índice … 4 meñique.
export const CHORDS = {
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  A7: { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  D7: { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  B7: { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2 },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  E5: { frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 3, 0, 0, 0] },
  A5: { frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 0, 1, 3, 0, 0] },
  G5: { frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  C5: { frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
  D5: { frets: [-1, 5, 7, 7, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
};

/** Notas MIDI del acorde, de grave a agudo. */
export function chordMidis(sym) {
  const c = CHORDS[sym];
  const out = [];
  c.frets.forEach((f, i) => { if (f >= 0) out.push(OPEN_MIDI[6 - i] + f); });
  return out;
}

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_PENTA = [0, 3, 5, 7, 10];
export const DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

/** Acordes del campo armónico mayor: [{pc, q}] con q '' | 'm' | 'dim'. */
export function majorKeyChords(rootPc) {
  const q = ['', 'm', 'm', '', '', 'm', 'dim'];
  return MAJOR.map((iv, i) => ({ pc: mod12(rootPc + iv), q: q[i] }));
}

export const chordSym = (pc, q = '') => PC_EN[mod12(pc)] + q;

// Patrones rítmicos: posiciones en pulsos dentro de un compás de 4/4.
export const PATTERNS = {
  negras: { name: 'Negras', hits: [0, 1, 2, 3], strokes: ['↓', '↓', '↓', '↓'], grid: 2 },
  corcheas: { name: 'Corcheas ↓↑', hits: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], strokes: ['↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'], grid: 2 },
  folk: { name: 'Folk/pop ↓ ↓↑ ↑↓↑', hits: [0, 1, 1.5, 2.5, 3, 3.5], strokes: ['↓', '↓', '↑', '↑', '↓', '↑'], grid: 2 },
  shuffle: { name: 'Shuffle (swing)', hits: [0, 2 / 3, 1, 5 / 3, 2, 8 / 3, 3, 11 / 3], strokes: ['↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'], grid: 3 },
  punk: { name: 'Corcheas todo ↓', hits: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], strokes: ['↓', '↓', '↓', '↓', '↓', '↓', '↓', '↓'], grid: 2 },
  tresillo: { name: 'Tresillo 3+3+2', hits: [0, 1.5, 3], strokes: ['↓', '↓', '↓'], grid: 2 },
  contra: { name: 'Contratiempo', hits: [0.5, 1.5, 2.5, 3.5], strokes: ['↑', '↑', '↑', '↑'], grid: 2 },
};

/** Parsea "1:0 1:3*2 | 2:1*.5" → [{s, f, d, midi}]. */
export function parseTab(src) {
  return src.split(/\s+/).filter((t) => t && t !== '|').map((tok) => {
    const [pos, dur] = tok.split('*');
    const [s, f] = pos.split(':').map(Number);
    return { s, f, d: dur ? Number(dur) : 1, midi: fretMidi(s, f) };
  });
}

export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
