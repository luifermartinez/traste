// Toca con la banda: progresión con guitarra de acompañamiento y metrónomo. Con `sheet`
// (tus canciones) sigue la letra línea a línea y se puede practicar por secciones.
import { h, chordCard, stars, lyricLine } from '../ui.js';
import { icon } from '../icons.js';
import { PATTERNS, chordName } from '../music.js';
import { Metronome, strum, atAudioTime, audioCtx } from '../audio.js';
import { state, currentParam } from '../store.js';
import { header, startButton } from './common.js';

export function mount(root, { def, onDone }) {
  const { chords, beatsPerChord, pattern, cycles, easy = false, capo = 0, sheet = null } = def.config;
  const pat = PATTERNS[pattern];
  const bpm = currentParam(def) || 70;
  let from = 0;
  let to = chords.length;
  let met = null;
  let timeouts = [];
  let backing = true;
  let clickOn = true;
  const seq = () => chords.slice(from, to);

  const cur = h('div', { class: 'pa-current' });
  const nxt = h('div', { class: 'pa-next' });
  const beatsEl = h('div', { class: 'beats' }, Array.from({ length: beatsPerChord }, () => h('span')));
  const info = h('div', { class: 'counter-line' });
  const paintInfo = () => { info.textContent = `${bpm} BPM · ${sheet ? `${seq().length} compases` : `${cycles} vueltas`}`; };
  paintInfo();
  const patEl = h('div', { class: 'pa-pattern' }, h('span', { class: 'muted small' }, `Rasgueo: ${pat.name}`), h('b', null, pat.strokes.join(' ')));
  const prog = sheet ? null : h('div', { class: 'pa-prog' }, chords.map((c) => h('span', null, chordName(c, 'es'))));
  const lyrics = sheet ? h('div', { class: 'pa-lyrics' }) : null;
  const toggles = h('div', { class: 'row center', style: { gap: '20px' } },
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { backing = e.target.checked; } }), 'Guitarra de la app'),
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { clickOn = e.target.checked; if (met) met.volume = clickOn ? state.settings.clickVol : 0; } }), 'Clic'));

  // Secciones: practicar solo el coro, el verso…
  const parts = sheet?.sections.length > 1 ? [{ name: 'Toda', from: 0, to: chords.length }, ...sheet.sections] : [];
  const partsEl = parts.length ? h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Parte' }, parts.map((p, k) => h('button', {
    role: 'radio', 'aria-checked': k === 0, class: k === 0 ? 'on' : '',
    onclick: (e) => {
      if (met) return;
      ({ from, to } = p);
      [...partsEl.children].forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      paintInfo();
      showChord(0);
    },
  }, p.name))) : null;

  const stage = h('div', { class: 'stage' }, info, prog, lyrics, h('div', { class: 'pa-main' }, cur, nxt), beatsEl, patEl, toggles);
  const controls = h('div', { class: 'controls' }, startButton('Empezar', () => start()));
  const tips = [
    capo > 0 && h('p', { class: 'tip' }, icon('info', { size: 18 }), `Pon el capo en el traste ${capo}. Los acordes que ves son los que tocas con él.`),
    h('p', { class: 'muted small' }, 'Rasguea con el patrón mostrado. Si te pierdes, no pares: entra en el siguiente acorde.'),
  ];
  root.append(header(def, tips), partsEl, stage, controls);

  /** Línea de letra que sigue a la línea `li` (para leer por adelantado). */
  const nextLine = (li) => sheet.lines.slice(li + 1).find((l) => l.t === 'chords' || l.t === 'text');

  function showChord(i) {
    const s = seq();
    cur.replaceChildren(chordCard(s[i % s.length], 'big', { easy }));
    nxt.replaceChildren('Siguiente: ', h('b', null, chordName(s[(i + 1) % s.length])));
    if (prog) [...prog.children].forEach((el, k) => el.classList.toggle('on', k === i % chords.length));
    if (lyrics) {
      const bar = sheet.bars[from + (i % s.length)];
      const after = nextLine(bar.line);
      lyrics.replaceChildren(
        lyricLine(sheet.lines[bar.line], bar.seg),
        after && (after.t === 'chords' ? lyricLine(after, -1, 'next') : h('div', { class: 'lyric next' }, after.text)));
    }
  }
  showChord(0);

  function start() {
    controls.replaceChildren(h('button', { class: 'btn block', onclick: () => stop(true) }, icon('stop', { size: 16 }), 'Parar'));
    const s = seq();
    const totalBeats = s.length * beatsPerChord * (sheet ? 1 : cycles);
    const beat = 60 / bpm;
    met = new Metronome({
      bpm,
      volume: clickOn ? state.settings.clickVol : 0,
      onTick: (b, t) => {
        const songBeat = b - 4; // 1 compás de cuenta
        if (songBeat >= totalBeats) {
          timeouts.push(atAudioTime(t, () => stop(false)));
          met.stop();
          return;
        }
        const chordIdx = songBeat < 0 ? 0 : Math.floor(songBeat / beatsPerChord);
        const sym = s[chordIdx % s.length];
        if (songBeat >= 0 && backing) {
          const inBar = songBeat % 4;
          pat.hits.forEach((p, k) => {
            if (Math.floor(p) === inBar) strum(sym, t + (p - inBar) * beat, { up: pat.strokes[k] === '↑', vol: 0.3 * state.settings.backingVol, easy, capo });
          });
        }
        timeouts.push(atAudioTime(t, () => {
          if (songBeat < 0) { info.textContent = `Cuenta: ${b + 1}`; return; }
          info.textContent = sheet
            ? `Compás ${chordIdx + 1} de ${s.length}`
            : `Vuelta ${Math.floor(songBeat / (s.length * beatsPerChord)) + 1} de ${cycles}`;
          if (songBeat % beatsPerChord === 0) showChord(chordIdx);
          [...beatsEl.children].forEach((el, k) => el.classList.toggle('on', k === songBeat % beatsPerChord));
        }));
      },
    });
    met.start(audioCtx().currentTime + 0.3);
  }

  function stop(early) {
    met?.stop();
    met = null;
    timeouts.forEach(clearTimeout);
    timeouts = [];
    [...beatsEl.children].forEach((el) => el.classList.remove('on'));
    info.textContent = early ? 'Parado. ¿Cómo fue hasta aquí?' : 'Fin. ¿Cómo fue?';
    const rate = (n, txt) => h('button', { class: 'btn option', onclick: () => onDone({ value: n }) }, stars(n, 18), txt);
    controls.replaceChildren(
      h('p', { class: 'muted small' }, 'Sé honesto contigo: con 3 estrellas el tempo sube la próxima vez.'),
      h('div', { class: 'rating' },
        rate(3, 'Sin parar y a tiempo en los cambios'),
        rate(2, 'Con algún tropiezo'),
        rate(1, 'Me perdí bastante')),
      h('button', { class: 'btn ghost block', onclick: () => { showChord(0); start(); } }, icon('refresh', { size: 18 }), 'Repetir antes de valorar'));
  }

  return () => {
    met?.stop();
    timeouts.forEach(clearTimeout);
  };
}
