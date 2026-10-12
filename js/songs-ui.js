// Pantallas de "Canciones": tu lista, añadir/editar (pegando la hoja de acordes), la página
// de cada canción (acordes, capo, pasos, letra) y tocar un paso.
import { h, topBar, chordCard, lyricLine, chordShort, svgNode, tabSvg, progressBar, stars, metricText, toast } from './ui.js';
import { icon, TYPE_ICON } from './icons.js';
import { state, save, isPassed, bestFor, currentParam, progress } from './store.js';
import {
  parseSheet, songById, createSong, updateSong, deleteSong, analyze, songDefs, findSongDef, noteSongStep,
  chordStatus, knownChords, PATTERN_OPTIONS,
} from './songs.js';
import { strum } from './audio.js';
import { runSkill } from './activities/index.js';

const go = (hash) => { location.hash = hash; };
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

const EXAMPLE = `La cucaracha (tradicional)

[Coro]
C
La cucaracha, la cucaracha,
                 G7
ya no puede caminar,
G7
porque no tiene, porque le falta
                C
una patita de atrás.`;

// ─────────────── Lista ───────────────

export function viewSongs(root, mode, id) {
  if (mode === 'nueva') return editor(root, null);
  if (mode === 'editar') return editor(root, songById(id));
  root.append(topBar('Canciones'),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Pega cualquier canción con acordes. Traste te dice qué acordes ya tocas, te enseña los nuevos, te sugiere capo y te la hace tocar siguiendo la letra.'),
    h('a', { class: 'btn primary big', href: '#/canciones/nueva' }, icon('plus', { size: 18 }), 'Añadir canción'));
  if (!state.songs.length) return null;
  root.append(h('div', { class: 'section' }, h('h2', null, 'Tus canciones'), h('span', { class: 'muted small' }, plural(state.songs.length, 'canción', 'canciones'))),
    h('div', { class: 'list' }, state.songs.slice().reverse().map((song) => {
      const d = songDefs(song);
      const bpm = d.play ? currentParam(d.play) : null;
      const meta = [song.artist, `${plural(analyze(song).chords.length, 'acorde')}`, bpm && `practicando a ${bpm} BPM`].filter(Boolean).join(' · ');
      return h('a', { class: 'item', href: `#/cancion/${song.id}` },
        h('span', { class: 'tool-icon' }, icon('music', { size: 20 })),
        h('div', { class: 'body' }, h('b', null, song.title), h('span', null, meta)),
        state.activeSong === song.id && h('span', { class: 'end' }, 'En tus sesiones'),
        icon('chevron', { size: 18 }));
    })));
  return null;
}

// ─────────────── Añadir / editar ───────────────

function editor(root, song) {
  const back = song ? `#/cancion/${song.id}` : '#/canciones';
  const title = h('input', { type: 'text', class: 'input', value: song?.title || '', placeholder: 'Ej.: Zombie', autocomplete: 'off' });
  const artist = h('input', { type: 'text', class: 'input', value: song?.artist || '', placeholder: 'Ej.: The Cranberries', autocomplete: 'off' });
  const text = h('textarea', { class: 'input sheet-input', rows: 14, spellcheck: 'false', placeholder: 'Am           F\nHoy te vi pasar\nC                 G\ny no supe qué decir' });
  text.value = song?.text || '';
  const bpm = h('input', { type: 'number', class: 'input', min: 40, max: 220, step: 1, value: song?.bpm || 80, inputmode: 'numeric' });
  const preview = h('div', { class: 'sheet-preview' });
  let taps = [];
  const tap = h('button', {
    class: 'btn', type: 'button',
    onclick: () => {
      const t = performance.now();
      taps = taps.filter((x) => t - x < 3000).concat(t);
      if (taps.length >= 3) {
        const gaps = taps.slice(1).map((x, i) => x - taps[i]);
        bpm.value = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
      }
    },
  }, 'Marcar el pulso');

  function paintPreview() {
    const parsed = parseSheet(text.value);
    const chords = [...new Set(parsed.lines.filter((l) => l.t === 'chords').flatMap((l) => l.segs.map((s) => s.chord).filter(Boolean)))];
    const sections = parsed.lines.filter((l) => l.t === 'section').length;
    const tabs = parsed.lines.filter((l) => l.t === 'tab').length;
    if (!text.value.trim()) { preview.replaceChildren(); return; }
    if (!chords.length) {
      preview.replaceChildren(h('p', { class: 'note' }, icon('info', { size: 16 }), 'Aún no encuentro acordes. Pon cada acorde encima de la sílaba donde cambia, o escríbelos en una línea: Am F C G.'));
      return;
    }
    preview.replaceChildren(
      h('div', { class: 'chips static' }, chords.map((c) => h('span', null, chordShort(c)))),
      h('p', { class: 'muted small' }, [plural(chords.length, 'acorde'), sections && plural(sections, 'sección', 'secciones'), tabs && plural(tabs, 'tablatura')].filter(Boolean).join(' · '),
        parsed.capo ? ` · la hoja indica capo ${parsed.capo}` : ''));
  }
  let timer = null;
  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(paintPreview, 250); });
  paintPreview();

  const field = (label, input, hint) => h('label', { class: 'form-field' }, h('span', null, label), input, hint && h('small', null, hint));
  root.append(topBar(song ? 'Editar canción' : 'Nueva canción', back, { settings: false }),
    h('div', { class: 'card form' },
      field('Título', title),
      field('Artista', artist, 'Opcional.'),
      field('Letra con acordes', text, 'Cópiala de LaCuerda.net, Cifra Club o Ultimate Guitar: la versión con los acordes encima de la letra. También vale solo la secuencia de acordes.'),
      !song && h('button', { class: 'btn small ghost', type: 'button', onclick: () => { text.value = EXAMPLE; title.value ||= 'La cucaracha'; paintPreview(); } }, 'Probar con un ejemplo'),
      preview,
      h('div', { class: 'form-field' }, h('span', null, 'Tempo original (BPM)'),
        h('div', { class: 'btn-row' }, bpm, tap),
        h('small', null, 'Toca "Marcar el pulso" al ritmo de la canción, o deja 80. Practicarás empezando más lento.'))),
    h('button', {
      class: 'btn primary big',
      onclick: () => {
        const parsed = parseSheet(text.value);
        if (!parsed.lines.some((l) => l.t === 'chords')) { toast('Necesito al menos un acorde para armar la práctica.', 'info'); return; }
        const fields = { title: title.value.trim() || 'Sin título', artist: artist.value.trim(), text: text.value, bpm: Math.min(220, Math.max(40, Math.round(+bpm.value || 80))) };
        const s = song ? updateSong(song.id, fields) : createSong(fields);
        go(`#/cancion/${s.id}`);
      },
    }, song ? 'Guardar cambios' : 'Guardar y ver cómo aprenderla'));
  if (!song) title.focus();
  return null;
}

// ─────────────── Una canción ───────────────

const CHORD_CAPTION = { known: 'Ya lo tocas', new: 'Nuevo', barre: 'Con cejilla' };

function stepRow(song, def) {
  const passed = isPassed(def);
  const best = bestFor(def, currentParam(def));
  let meta;
  if (def.type === 'playalong') {
    const p = currentParam(def);
    meta = [`${p} BPM${p < song.bpm ? ` de ${song.bpm}` : ''}`, best != null ? null : 'sin intentos'].filter(Boolean).join(' · ');
  } else meta = best != null ? `récord ${metricText(def, best)} · objetivo ${metricText(def, def.metric.target)}` : `objetivo ${metricText(def, def.metric.target)}`;
  const label = def.type === 'playalong' ? 'Tocar la canción con la letra' : def.title;
  return h('a', { class: `skill ${passed ? 'passed' : ''}`, href: `#/tocar/${song.id}/${encodeURIComponent(def.id)}` },
    h('span', { class: 'sk-icon' }, icon(passed && def.type !== 'playalong' ? 'check' : def.type === 'playalong' ? 'music' : TYPE_ICON[def.type], { size: 18 })),
    h('div', { class: 'sk-body' },
      h('div', { class: 'sk-title' }, label),
      h('div', { class: 'sk-meta' }, meta, def.type === 'playalong' && best != null && h('span', { class: 'sk-stars' }, stars(best, 14))),
      !passed && progressBar(progress(def), 'thin')),
    icon('chevron', { size: 16 }));
}

export function viewSong(root, id) {
  const song = songById(id);
  if (!song) { go('#/canciones'); return null; }
  const a = analyze(song);
  const defs = songDefs(song);
  const known = knownChords();
  const best = a.capoOptions[0];
  const set = (fields) => { updateSong(song.id, fields); rerender(); };

  root.append(topBar(song.title, '#/canciones', { settings: false }));
  if (song.artist) root.append(h('p', { class: 'muted', style: { marginTop: 0 } }, song.artist));
  if (defs.play) {
    root.append(h('a', { class: 'btn primary big', href: `#/tocar/${song.id}/${encodeURIComponent(defs.play.id)}` }, icon('play', { size: 18 }), 'Tocar la canción'));
  }

  // Acordes
  const strip = h('div', { class: 'chord-strip' }, a.chords.map((sym) => {
    const st = chordStatus(sym, song.easy, known);
    const cap = [CHORD_CAPTION[st.kind], st.kind === 'new' && st.stage ? `etapa ${st.stage}` : null].filter(Boolean).join(' · ');
    const card = chordCard(sym, st.kind, { easy: song.easy, caption: cap });
    card.addEventListener('click', () => strum(sym, undefined, { easy: song.easy, capo: song.capo }));
    return card;
  }));
  const newCount = a.chords.filter((c) => chordStatus(c, song.easy, known).kind !== 'known').length;
  root.append(h('div', { class: 'section' }, h('h2', null, 'Acordes'), h('span', { class: 'muted small' }, newCount ? `${newCount} por aprender` : 'Ya los tocas todos')),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Toca un diagrama para oírlo. Números: dedos (1 índice … 4 meñique).'),
    strip);

  // Cómo la tocas
  const capoSel = h('select', { 'aria-label': 'Capo', onchange: (e) => set({ capo: +e.target.value }) },
    Array.from({ length: 8 }, (_, k) => h('option', { value: k, selected: k === song.capo }, k ? `Traste ${k}` : 'Sin capo')));
  const patSel = h('select', { 'aria-label': 'Rasgueo', onchange: (e) => set({ pattern: e.target.value }) },
    PATTERN_OPTIONS.map(([k, name]) => h('option', { value: k, selected: k === song.pattern }, name)));
  const beatsSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Pulsos por acorde' }, [2, 4, 8].map((n) => h('button', {
    role: 'radio', 'aria-checked': n === song.beats, class: n === song.beats ? 'on' : '', onclick: () => set({ beats: n }),
  }, `${n} pulsos`)));
  const bpmIn = h('input', { type: 'number', class: 'input', min: 40, max: 220, value: song.bpm, inputmode: 'numeric', onchange: (e) => set({ bpm: Math.min(220, Math.max(40, Math.round(+e.target.value || song.bpm))) }) });
  const row = (label, control, hint) => h('div', { class: 'set-row' }, h('div', { class: 'body' }, h('b', null, label), hint && h('span', null, hint)), control);
  const check = (checked, onchange) => h('input', { type: 'checkbox', class: 'switch', checked, onchange });
  // Con cualquier capo suena en el tono original: solo cambian las formas que tocas.
  const capoHint = song.capo !== best.capo
    ? `Recomendado ${best.capo ? `traste ${best.capo}` : 'sin capo'}: ${best.played.map(chordShort).join(' ')}`
    : a.sheetCapo !== song.capo
      ? `Recomendado. La hoja usa ${a.sheetCapo ? `capo ${a.sheetCapo}` : 'sin capo'}; así los acordes son más fáciles y suena igual.`
      : 'Recomendado. Suena en el tono de la original.';
  root.append(h('div', { class: 'section' }, h('h2', null, 'Cómo la tocas')),
    h('div', { class: 'list' },
      row('Capo', capoSel, capoHint),
      row('Versión fácil', check(song.easy, (e) => set({ easy: e.target.checked })), 'Acordes con cejilla en 4 cuerdas'),
      row('Rasgueo', patSel),
      row('Tempo original', bpmIn, 'BPM. Practicas desde más lento.'),
      h('div', { class: 'set-row col' }, h('div', { class: 'body' }, h('b', null, 'Cada acorde dura'), h('span', null, 'Si en la letra hay dos acordes por compás, elige 2.')), beatsSeg),
      row('En tus sesiones', check(state.activeSong === song.id, (e) => { state.activeSong = e.target.checked ? song.id : null; save(); rerender(); }), 'El bloque Música alterna entre esta canción y la ruta')));

  // Pasos
  const steps = [...defs.changes, defs.play, ...defs.riffs].filter(Boolean);
  root.append(h('div', { class: 'section' }, h('h2', null, 'Pasos para aprenderla')),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Primero los cambios que van seguidos en la canción, del más difícil al más fácil; luego tocarla con la letra, subiendo el tempo cada vez que te salga con 3 estrellas.'),
    h('div', { class: 'list' }, steps.map((d) => stepRow(song, d))));
  if (a.riffs.some((r) => !r.ok)) root.append(h('p', { class: 'note' }, icon('info', { size: 16 }), 'Hay una tablatura que no se puede tocar con este capo. Quítalo para practicarla.'));

  // Letra
  root.append(h('div', { class: 'section' }, h('h2', null, 'Letra y acordes')),
    h('div', { class: 'card sheet' }, a.lines.map((l) => {
      if (l.t === 'section') return h('h3', null, l.name);
      if (l.t === 'chords') return lyricLine(l);
      if (l.t === 'text') return h('div', { class: 'lyric-text' }, l.text);
      if (l.t === 'tab') return h('div', { class: 'tab-wrap' }, svgNode(tabSvg(l.notes)));
      return h('div', { class: 'sheet-gap' });
    })));

  root.append(h('div', { class: 'btn-row', style: { marginTop: '24px' } },
    h('a', { class: 'btn', href: `#/canciones/editar/${song.id}` }, 'Editar'),
    h('button', {
      class: 'btn danger',
      onclick: () => {
        if (!confirm(`¿Borrar "${song.title}" y su progreso?`)) return;
        deleteSong(song.id);
        go('#/canciones');
      },
    }, icon('trash', { size: 18 }), 'Borrar')));
  return null;
}

// ─────────────── Tocar un paso ───────────────

export function viewPlaySong(root, songId, defId) {
  const def = findSongDef(defId);
  if (!def) { go(songById(songId) ? `#/cancion/${songId}` : '#/canciones'); return null; }
  root.append(h('header', { class: 'top' }, h('a', { href: `#/cancion/${songId}`, class: 'btn small ghost' }, icon('back', { size: 18 }), 'Canción')));
  const holder = h('div');
  root.append(holder);
  return runSkill(holder, def, {
    budgetSec: 180,
    onFinish: (summary) => {
      if (!summary.skipped) noteSongStep(def);
      go(`#/cancion/${songId}`);
    },
  });
}
