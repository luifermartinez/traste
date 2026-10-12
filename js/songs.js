// Tus canciones: lee una hoja de acordes pegada de cualquier web (acordes sobre la letra,
// ChordPro [Am], secciones, repeticiones y tablaturas), la adapta a lo que sabes tocar
// (capo y versión fácil) y la convierte en pasos de práctica medibles.
import { parseChord, transpose, capoOptions, chordDifficulty } from './chords.js';
import { chordName, getNotation, OPEN_MIDI, PATTERNS } from './music.js';
import { SKILLS } from './curriculum.js';
import { state, save, isPassed } from './store.js';

// ─────────────── Lectura de la hoja ───────────────

const SECTION_WORDS = /^(intro|introducci[oó]n|verso|estrofa|coro|estribillo|puente|pre-?coro|pre-?estribillo|solo|final|outro|interludio|interlude|verse|chorus|bridge|pre-?chorus|riff|instrumental|refr[aá]n|coda|parte)\b/i;
const META = /^\s*((afinaci[oó]n|tuning|tono|tonalidad|key|tom|bpm|tempo|ritmo)\s*:|(capo|cejilla)\b.{0,25}\d)/i;
const REPEAT = /^\(?\s*[x×]\s?(\d+)\s*\)?$|^\(?\s*(\d+)\s?[x×]\s*\)?$/i;
const FILLER = /^(\|+|-+|\/+|%|\.{2,}|N\.?C\.?|:?\|\|?:?|\*)$/i;
const TAB_LINE = /^\s*([eEBGDAbgda]\s*)?[|:]?[-\d|hpbrx/\\~().^s*]+\s*$/;

/** Capo indicado en la hoja: "Capo 2", "Capo: 2ª casa", "Cejilla en el 3". */
function sheetCapo(text) {
  const m = /\bcapo\b\D{0,12}(\d{1,2})/i.exec(text) || /\bcejilla\s+(?:en\s+)?(?:el\s+)?(?:traste\s+)?(\d{1,2})/i.exec(text);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n < 12 ? n : 0;
}

/** Si la línea es solo acordes ("Am  G | F  x2") → {items:[{sym, col}], repeat}; si no, null. */
function chordLine(line) {
  const items = [];
  let repeat = 1;
  for (const m of line.matchAll(/\S+/g)) {
    const tok = m[0];
    if (REPEAT.test(tok)) { const r = REPEAT.exec(tok); repeat = Number(r[1] || r[2]); continue; }
    const t = tok.replace(/^[([]+|[)\]]+$/g, '');
    if (!t || FILLER.test(t)) continue;
    const parts = t.split('|').filter(Boolean).flatMap((p) => {
      if (parseChord(p)) return [p];
      const d = p.split('-').filter(Boolean);
      return d.length > 1 && d.every(parseChord) ? d : [p];
    });
    let off = 0;
    for (const p of parts) {
      const c = parseChord(p);
      if (!c) return null;
      items.push({ sym: c.sym, col: m.index + tok.indexOf(p, off) });
      off = tok.indexOf(p, off) + p.length;
    }
  }
  return items.length ? { items, repeat } : null;
}

/** "[Coro]", "Coro:", "ESTRIBILLO", "Intro: Am G" → {name, rest}. */
function sectionLine(line) {
  const s = line.trim();
  let m = /^\[([^\]]{1,30})\]$/.exec(s);
  if (m && !parseChord(m[1])) return { name: m[1], rest: '' };
  m = /^([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .º-]{0,24}?)\s*:\s*(.*)$/.exec(s);
  if (m && (SECTION_WORDS.test(m[1]) || (m[2] && chordLine(m[2])))) return { name: m[1], rest: m[2] };
  if (SECTION_WORDS.test(s) && s.split(/\s+/).length <= 3 && !chordLine(s)) return { name: s.replace(/[:.]$/, ''), rest: '' };
  return null;
}
const niceName = (n) => { const t = n.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Tablatura de 6 líneas → "cuerda:traste*duración" (la nota más aguda si suenan varias). */
function asciiTab(lines6) {
  const bodies = lines6.map((l) => l.replace(/^\s*[eEBGDAbgda]?\s*[|:]?/, ''));
  const len = Math.max(...bodies.map((b) => b.length));
  const ev = [];
  for (let c = 0; c < len; c++) {
    let top = null;
    bodies.forEach((L, si) => {
      if (!/\d/.test(L[c] || '') || /\d/.test(L[c - 1] || '')) return;
      const f = Number(/\d/.test(L[c + 1] || '') ? L[c] + L[c + 1] : L[c]);
      const s = si + 1;
      if (f <= 24 && (!top || OPEN_MIDI[s] + f > OPEN_MIDI[top.s] + top.f)) top = { s, f };
    });
    if (top) ev.push({ ...top, col: c });
  }
  if (ev.length < 2) return ev.map((e) => ({ s: e.s, f: e.f, d: 1 }));
  const gaps = ev.slice(1).map((e, i) => e.col - ev[i].col).sort((a, b) => a - b);
  const unit = gaps[Math.floor(gaps.length / 2)] || 1;
  return ev.map((e, i) => {
    const gap = i < ev.length - 1 ? ev[i + 1].col - e.col : unit;
    return { s: e.s, f: e.f, d: Math.min(2, Math.max(0.5, Math.round((gap / unit) * 2) / 2)) };
  });
}

/**
 * Hoja de texto → {lines, capo}. Líneas: {t:'section', name} | {t:'chords', segs:[{chord, text}], repeat}
 * | {t:'text', text} | {t:'tab', notes:[{s,f,d}], section} | {t:'gap'}.
 */
export function parseSheet(text) {
  const raw = text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const lines = [];
  let section = null;
  const isTab = (l) => l != null && TAB_LINE.test(l) && (l.match(/-/g) || []).length >= 4;
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i].replace(/\s+$/, '');
    if (!line.trim()) { if (lines.length && lines.at(-1).t !== 'gap') lines.push({ t: 'gap' }); continue; }
    if (META.test(line) && !chordLine(line)) continue;
    // Directivas ChordPro: {c: Coro}, {soc}… marcan secciones; el resto ({title}, {key}…) se ignora.
    const dir = /^\s*\{\s*(\w+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
    if (dir) {
      const name = { c: dir[2], comment: dir[2], soc: dir[2] || 'Coro', start_of_chorus: dir[2] || 'Coro', sov: dir[2] || 'Verso', start_of_verse: dir[2] || 'Verso' }[dir[1].toLowerCase()];
      if (name) { section = niceName(name); lines.push({ t: 'section', name: section }); }
      continue;
    }
    if (isTab(line)) {
      const block = [];
      while (isTab(raw[i])) block.push(raw[i++]);
      i--;
      for (let k = 0; k + 6 <= block.length; k += 6) {
        const notes = asciiTab(block.slice(k, k + 6));
        if (notes.length) lines.push({ t: 'tab', notes, section });
      }
      continue;
    }
    const sec = sectionLine(line);
    if (sec) {
      section = niceName(sec.name);
      lines.push({ t: 'section', name: section });
      const cl = sec.rest && chordLine(sec.rest);
      if (cl) lines.push({ t: 'chords', segs: cl.items.map((it) => ({ chord: it.sym, text: '' })), repeat: cl.repeat });
      else if (sec.rest) lines.push({ t: 'text', text: sec.rest });
      continue;
    }
    const cl = chordLine(line);
    if (cl) {
      const next = raw[i + 1]?.replace(/\s+$/, '');
      if (next?.trim() && !chordLine(next) && !sectionLine(next) && !isTab(next) && !META.test(next)) {
        const cols = cl.items.map((it) => it.col);
        const segs = cols[0] > 0 ? [{ chord: null, text: next.slice(0, cols[0]) }] : [];
        cl.items.forEach((it, k) => segs.push({ chord: it.sym, text: next.slice(it.col, cols[k + 1] ?? undefined) }));
        if (segs[0].chord == null && !segs[0].text.trim()) segs.shift();
        lines.push({ t: 'chords', segs, repeat: cl.repeat });
        i++;
      } else lines.push({ t: 'chords', segs: cl.items.map((it) => ({ chord: it.sym, text: '' })), repeat: cl.repeat });
      continue;
    }
    // ChordPro: "[Am]Hola [C]mundo"
    const inline = [...line.matchAll(/\[([^\]]+)\]/g)].filter((m) => parseChord(m[1]));
    if (inline.length) {
      const segs = [];
      const pre = line.slice(0, inline[0].index);
      if (pre.trim()) segs.push({ chord: null, text: pre });
      inline.forEach((m, k) => {
        const end = inline[k + 1]?.index ?? line.length;
        segs.push({ chord: parseChord(m[1]).sym, text: line.slice(m.index + m[0].length, end) });
      });
      lines.push({ t: 'chords', segs, repeat: 1 });
      continue;
    }
    lines.push({ t: 'text', text: line.trim() });
  }
  while (lines.at(-1)?.t === 'gap') lines.pop();
  return { lines, capo: sheetCapo(text) };
}

// ─────────────── Canciones guardadas ───────────────

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const songById = (id) => state.songs.find((s) => s.id === id) || null;
export const activeSong = () => songById(state.activeSong);

/** Acordes (como suenan) en orden de aparición. */
const soundingChords = (parsed) => {
  const out = [];
  for (const l of parsed.lines) if (l.t === 'chords') for (const s of l.segs) if (s.chord) out.push(transpose(s.chord, parsed.capo));
  return out;
};

/** Capo recomendado para tocar la hoja con los acordes más fáciles. */
export function recommendCapo(text, easy) {
  const parsed = parseSheet(text);
  const opts = capoOptions(soundingChords(parsed), { easy, prefer: parsed.capo });
  return opts[0]?.capo ?? 0;
}

export function createSong({ title, artist = '', text, bpm = 80, pattern = 'folk', beats = 4 }) {
  const easy = state.unlockedStage < 5;
  const song = { id: uid(), title: title.trim() || 'Sin título', artist: artist.trim(), text, bpm, pattern, beats, easy, capo: recommendCapo(text, easy), createdAt: Date.now(), lastStep: null };
  state.songs.push(song);
  state.activeSong = song.id;
  save();
  return song;
}

export function updateSong(id, fields) {
  const song = songById(id);
  if (!song) return null;
  const textChanged = fields.text != null && fields.text !== song.text;
  Object.assign(song, fields);
  if (textChanged) song.capo = recommendCapo(song.text, song.easy);
  save();
  return song;
}

export function deleteSong(id) {
  state.songs = state.songs.filter((s) => s.id !== id);
  for (const k of Object.keys(state.skills)) if (k.startsWith(`S${id}.`)) delete state.skills[k];
  if (state.activeSong === id) state.activeSong = state.songs.at(-1)?.id ?? null;
  save();
}

// ─────────────── Análisis: qué tocas y cómo ───────────────

/** Acordes que ya tocas: los de habilidades superadas de la ruta y de tus canciones. */
function knownChords() {
  const out = new Set();
  for (const d of SKILLS) {
    if (!d.config || !isPassed(d)) continue;
    const { a, b, chord, chords } = d.config;
    [a, b, chord, ...(chords || [])].filter(Boolean).forEach((c) => out.add(c));
  }
  for (const song of state.songs) for (const c of songDefs(song).changes) if (isPassed(c)) { out.add(c.config.a); out.add(c.config.b); }
  return out;
}

/** Etapa de la ruta donde se aprende un acorde (o null). */
const stageOf = (sym) => SKILLS.find((d) => d.config && [d.config.a, d.config.b, d.config.chord, ...(d.config.chords || [])].includes(sym))?.stage ?? null;

/**
 * Lo que necesitas para tocar `song`: hoja leída, acordes que tocas (con capo y versión
 * fácil), compases en orden, secciones, opciones de capo y riffs.
 */
export function analyze(song) {
  const parsed = parseSheet(song.text);
  const shift = parsed.capo - song.capo; // de lo escrito a lo que tocas
  const play = (sym) => transpose(sym, shift);
  const lines = parsed.lines.map((l) => (l.t === 'chords' ? { ...l, segs: l.segs.map((s) => ({ ...s, chord: s.chord && play(s.chord) })) } : l));
  const bars = [];
  const sections = [];
  lines.forEach((l, li) => {
    if (l.t === 'section') sections.push({ name: l.name, from: bars.length, to: bars.length });
    if (l.t !== 'chords') return;
    for (let r = 0; r < (l.repeat || 1); r++) l.segs.forEach((s, si) => { if (s.chord) bars.push({ sym: s.chord, line: li, seg: si }); });
    if (sections.length) sections.at(-1).to = bars.length;
  });
  const chords = [...new Set(bars.map((b) => b.sym))];
  const riffs = [];
  for (const l of lines) {
    if (l.t !== 'tab') continue;
    const notes = l.notes.map((n) => ({ ...n, f: n.f + shift }));
    const ok = notes.every((n) => n.f >= 0);
    const prev = riffs.at(-1);
    const name = l.section || 'Riff';
    if (prev && prev.name === name && prev.ok && ok) prev.notes.push(...notes);
    else riffs.push({ name, notes: ok ? notes : l.notes, ok });
  }
  return {
    lines, bars, chords, riffs,
    sections: sections.filter((s) => s.to > s.from),
    sheetCapo: parsed.capo,
    capoOptions: capoOptions(soundingChords(parsed), { easy: song.easy, prefer: parsed.capo }),
  };
}

/** Estado de cada acorde para enseñarlo: 'known' | 'new' | 'barre'. */
export function chordStatus(sym, easy, known = knownChords()) {
  if (known.has(sym)) return { kind: 'known', stage: null };
  return { kind: chordDifficulty(sym, { easy }) >= 3 ? 'barre' : 'new', stage: stageOf(sym) };
}
export { knownChords };

// ─────────────── Pasos de práctica ───────────────

const shortName = (sym) => chordName(sym, getNotation() === 'en' ? 'en' : 'es');

/** Tempos de práctica hasta el tempo original: empieza lento y sube de 10 en 10. */
export function tempoLadder(bpm) {
  if (bpm <= 60) return [bpm];
  const out = [];
  for (let v = Math.max(50, Math.round((bpm * 0.6) / 5) * 5); v < bpm; v += 10) out.push(v);
  out.push(bpm);
  return out;
}

/**
 * Habilidades de la canción, con el mismo formato que las de la ruta (y su progreso propio):
 * cambios entre los acordes que van seguidos, tocar la canción con la letra, y riffs.
 */
export function songDefs(song) {
  const a = analyze(song);
  const base = `S${song.id}.`;
  const pairs = new Map();
  a.bars.forEach((b, i) => {
    const n = a.bars[i + 1];
    if (!n || n.sym === b.sym) return;
    const [x, y] = [b.sym, n.sym].sort();
    const k = `${x}|${y}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  });
  const changes = [...pairs.entries()]
    .sort((p, q) => q[1] - p[1]).slice(0, 6)
    .map(([k, n]) => {
      const [x, y] = k.split('|');
      const hard = Math.max(chordDifficulty(x, { easy: song.easy }), chordDifficulty(y, { easy: song.easy }));
      return {
        id: `${base}c.${x}_${y}`, song: song.id, stage: 1, type: 'changes', weight: n, hard,
        title: `Cambios ${shortName(x)} ↔ ${shortName(y)}`,
        desc: `Van seguidos ${n === 1 ? 'una vez' : `${n} veces`} en "${song.title}".`,
        config: { a: x, b: y, easy: song.easy },
        metric: { label: 'cambios/min', unit: '/min', target: hard >= 3 ? 20 : 25 },
      };
    })
    .sort((p, q) => q.hard - p.hard || q.weight - p.weight);
  const play = {
    id: `${base}play`, song: song.id, stage: 1, type: 'playalong', typeLabel: 'Canción',
    title: song.artist ? `${song.title} · ${song.artist}` : song.title,
    config: {
      chords: a.bars.map((b) => b.sym), beatsPerChord: song.beats, pattern: song.pattern, cycles: 1,
      easy: song.easy, capo: song.capo, sheet: { lines: a.lines, bars: a.bars, sections: a.sections },
    },
    ladder: tempoLadder(song.bpm),
    metric: { label: 'estrellas', unit: '★', target: 3 },
  };
  const riffs = a.riffs.filter((r) => r.ok && r.notes.length >= 3).map((r, k) => ({
    id: `${base}r${k}`, song: song.id, stage: 1, type: 'melody', typeLabel: 'Riff',
    title: r.name === 'Riff' ? 'Riff' : `Riff: ${r.name}`,
    desc: `La app espera a que toques cada nota.${song.capo ? ` Con capo en el traste ${song.capo}.` : ''}`,
    config: { tab: r.notes.map((n) => `${n.s}:${n.f}*${n.d}`).join(' '), bpm: Math.min(song.bpm, 90), capo: song.capo },
    metric: { label: 'notas/min', unit: '/min', target: 20 },
  }));
  const all = [...changes, ...(a.bars.length ? [play] : []), ...riffs];
  for (const d of all) d.songTitle = song.title; // para mostrar de qué canción es en Hoy
  return { changes, play: a.bars.length ? play : null, riffs, all };
}

/** Busca una habilidad de canción por id ("S<song>.…"). */
export function findSongDef(id) {
  if (!id?.startsWith('S')) return null;
  const song = songById(id.slice(1, id.indexOf('.')));
  return song ? songDefs(song).all.find((d) => d.id === id) || null : null;
}

const STEP_ORDER = ['changes', 'play', 'riff'];
const stepKind = (def) => (def.type === 'changes' ? 'changes' : def.type === 'melody' ? 'riff' : 'play');

/** Siguiente paso de la canción para la sesión: rota cambios → tocarla → riff. */
export function nextSongDef(song, used = new Set()) {
  const d = songDefs(song);
  const start = (STEP_ORDER.indexOf(song.lastStep) + 1) % STEP_ORDER.length;
  for (let k = 0; k < STEP_ORDER.length; k++) {
    const kind = STEP_ORDER[(start + k) % STEP_ORDER.length];
    const pick = kind === 'changes' ? d.changes.find((c) => !isPassed(c) && !used.has(c.id))
      : kind === 'play' ? (d.play && !used.has(d.play.id) ? d.play : null)
        : d.riffs.find((r) => !isPassed(r) && !used.has(r.id));
    if (pick) return pick;
  }
  return null;
}

/** Recuerda el último paso hecho de una canción (para rotar en la próxima sesión). */
export function noteSongStep(def) {
  const song = def?.song && songById(def.song);
  if (!song) return;
  song.lastStep = stepKind(def);
  song.lastAt = Date.now();
  save();
}

export const PATTERN_OPTIONS = Object.entries(PATTERNS).map(([k, p]) => [k, p.name]);
