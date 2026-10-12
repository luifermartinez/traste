// Melodía en modo espera: la app avanza cuando detecta la nota correcta.
import { h, svgNode, tabSvg } from '../ui.js';
import { icon } from '../icons.js';
import { parseTab, pcName } from '../music.js';
import { NoteListener, playNote, now } from '../audio.js';
import { header, errorBox, roundButtons, vibrate, startButton, setFeedback } from './common.js';

const matches = (played, target) => played === target || Math.abs(played - target) === 12;

export function mount(root, { def, onDone }) {
  const notes = parseTab(def.config.tab);
  const results = [];
  let listener = null;
  let idx = 0;
  let mistakes = 0;
  let t0 = null;

  const tabWrap = h('div', { class: 'tab-wrap' });
  const big = h('div', { class: 'prompt' }, 'Escúchala primero si no la conoces');
  const sub = h('div', { class: 'prompt-sub' });
  const feedback = h('div', { class: 'feedback' });
  const listenBtn = h('button', { class: 'btn ghost block', onclick: () => demo() }, icon('headphones', { size: 18 }), 'Escuchar la melodía');
  const stage = h('div', { class: 'stage' }, tabWrap, big, sub, feedback);
  const controls = h('div', { class: 'controls' }, startButton('Empezar', () => startRound()), listenBtn);
  root.append(header(def), stage, controls);

  function draw() {
    tabWrap.replaceChildren(svgNode(tabSvg(notes, idx)));
    const cur = tabWrap.querySelector('.tab-bg.cur');
    if (cur) {
      const x = cur.getBBox().x;
      tabWrap.scrollTo({ left: Math.max(0, x - tabWrap.clientWidth / 3), behavior: 'smooth' });
    }
    if (idx < notes.length) {
      const n = notes[idx];
      big.textContent = `Cuerda ${n.s} · traste ${n.f}`;
      sub.textContent = `${pcName(n.midi)} · nota ${idx + 1} de ${notes.length}`;
    }
  }
  draw();

  function demo() {
    const beat = 60 / (def.config.bpm || 90);
    let t = now() + 0.1;
    for (const n of notes) {
      playNote(n.midi, t, 0.55, Math.max(0.3, n.d * beat));
      t += n.d * beat;
    }
    listener?.mute(t - now() + 0.6);
  }

  function onNote(midi) {
    if (idx >= notes.length) return;
    const target = notes[idx].midi;
    if (matches(midi, target)) {
      t0 ??= performance.now();
      idx++;
      setFeedback(feedback, '', '');
      draw();
      if (idx === notes.length) endRound();
      return;
    }
    mistakes++;
    vibrate(20);
    setFeedback(feedback, 'bad', `Sonó ${pcName(midi)}: la correcta es más ${midi < target ? 'aguda' : 'grave'}`);
  }

  async function startRound() {
    controls.replaceChildren(listenBtn);
    idx = 0;
    mistakes = 0;
    t0 = null;
    setFeedback(feedback, '', 'Tócala a tu ritmo; el tiempo empieza con la primera nota.');
    draw();
    try {
      listener = new NoteListener({ onNote });
      await listener.start();
    } catch (err) {
      stage.replaceWith(errorBox(err, () => onDone({ skipped: true })));
    }
  }

  function endRound() {
    listener?.stop();
    listener = null;
    const minutes = Math.max(1 / 60, (performance.now() - t0) / 60000);
    const n = notes.length;
    const value = Math.round(((n - 1) / minutes) * (n / (n + mistakes)) * 10) / 10;
    results.push({ value, mistakes });
    big.textContent = mistakes === 0 ? 'Sin un solo error' : `Completada con ${mistakes} error${mistakes === 1 ? '' : 'es'}`;
    sub.textContent = `Fluidez: ${value} notas/min (los errores la reducen)`;
    setFeedback(feedback, '', value < def.metric.target ? 'Repite: la segunda vez siempre sale más fluida.' : '');
    controls.replaceChildren(roundButtons(startRound, () => {
      const best = results.reduce((a, r) => (r.value > a.value ? r : a));
      onDone({ value: best.value, extra: { mistakes: best.mistakes } });
    }));
  }

  return () => listener?.stop();
}
