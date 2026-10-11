// Toca con la banda: progresión con guitarra de acompañamiento y metrónomo.
import { h, chordCard } from '../ui.js';
import { PATTERNS, chordName } from '../music.js';
import { Metronome, strum, atAudioTime, audioCtx } from '../audio.js';
import { state, currentParam } from '../store.js';
import { header } from './common.js';

export function mount(root, { def, onDone }) {
  const { chords, beatsPerChord, pattern, cycles } = def.config;
  const pat = PATTERNS[pattern];
  const bpm = currentParam(def) || 70;
  const totalBeats = chords.length * beatsPerChord * cycles;
  let met = null;
  let timeouts = [];
  let backing = true;
  let clickOn = true;

  const cur = h('div', { class: 'pa-current' });
  const nxt = h('div', { class: 'pa-next muted' });
  const beatsEl = h('div', { class: 'beats' }, Array.from({ length: beatsPerChord }, () => h('span')));
  const info = h('div', { class: 'prompt-sub muted' }, `${bpm} BPM · ${cycles} vueltas`);
  const patEl = h('div', { class: 'pa-pattern' }, h('span', { class: 'muted small' }, `Rasgueo: ${pat.name}`), h('b', null, pat.strokes.join(' ')));
  const prog = h('div', { class: 'pa-prog' }, chords.map((c) => h('span', null, chordName(c, 'es'))));
  const toggles = h('div', { class: 'row gap center' },
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { backing = e.target.checked; } }), 'Guitarra de la app'),
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { clickOn = e.target.checked; if (met) met.volume = clickOn ? state.settings.clickVol : 0; } }), 'Clic'));
  const stage = h('div', { class: 'stage' }, info, prog, h('div', { class: 'pa-main' }, cur, nxt), beatsEl, patEl, toggles);
  const controls = h('div', { class: 'controls' }, h('button', { class: 'btn primary big', onclick: () => start() }, '▶ Empezar'));
  root.append(header(def, h('p', { class: 'muted small' }, 'Rasguea con el patrón mostrado. Si te pierdes, no pares: entra en el siguiente acorde.')), stage, controls);

  const showChord = (i) => {
    cur.replaceChildren(chordCard(chords[i % chords.length], 'big'));
    nxt.replaceChildren('Siguiente: ', chordName(chords[(i + 1) % chords.length]));
    [...prog.children].forEach((el, k) => el.classList.toggle('on', k === i % chords.length));
  };
  showChord(0);

  function start() {
    controls.replaceChildren(h('button', { class: 'btn ghost', onclick: () => stop(true) }, '■ Parar'));
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
        const sym = chords[chordIdx % chords.length];
        if (songBeat >= 0 && backing) {
          const inBar = songBeat % 4;
          pat.hits.forEach((p, k) => {
            if (Math.floor(p) === inBar) strum(sym, t + (p - inBar) * beat, { up: pat.strokes[k] === '↑', vol: 0.3 * state.settings.backingVol });
          });
        }
        timeouts.push(atAudioTime(t, () => {
          if (songBeat < 0) { info.textContent = `Cuenta: ${b + 1}`; return; }
          info.textContent = `Vuelta ${Math.floor(songBeat / (chords.length * beatsPerChord)) + 1} de ${cycles}`;
          if (songBeat % beatsPerChord === 0) showChord(chordIdx);
          [...beatsEl.children].forEach((el, k) => el.classList.toggle('on', k === songBeat % beatsPerChord));
        }));
      },
    });
    met.start(audioCtx().currentTime + 0.3);
  }

  function stop(early) {
    met?.stop();
    timeouts.forEach(clearTimeout);
    timeouts = [];
    [...beatsEl.children].forEach((el) => el.classList.remove('on'));
    info.textContent = early ? 'Parado. ¿Cómo fue hasta aquí?' : '¡Fin! ¿Cómo fue?';
    const rate = (stars, txt) => h('button', { class: 'btn option', onclick: () => onDone({ value: stars }) }, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  ${txt}`);
    controls.replaceChildren(
      h('p', { class: 'muted small' }, 'Sé honesto/a: con 3 estrellas el tempo sube la próxima vez.'),
      h('div', { class: 'options' },
        rate(3, 'Sin parar y a tiempo en los cambios'),
        rate(2, 'Con algún tropiezo'),
        rate(1, 'Me perdí bastante')),
      h('button', { class: 'btn ghost', onclick: () => start() }, '↻ Repetir antes de valorar'));
  }

  return () => {
    met?.stop();
    timeouts.forEach(clearTimeout);
  };
}
