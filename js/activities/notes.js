// "Caza la nota": la app pide una nota/posición y escucha si la tocas.
import { h, svgNode, fretboardSvg } from '../ui.js';
import { icon } from '../icons.js';
import { OPEN_MIDI, pcName, pcShort, mod12, fretMidi } from '../music.js';
import { NoteListener } from '../audio.js';
import { header, errorBox, roundButtons, countdown, vibrate, startButton, setFeedback } from './common.js';

const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);
const matches = (played, target) => played === target || Math.abs(played - target) === 12;

function candidates({ strings, frets, naturals }) {
  const out = [];
  for (const s of strings) {
    for (let f = frets[0]; f <= frets[1]; f++) {
      const midi = fretMidi(s, f);
      if (!naturals || NATURAL.has(mod12(midi))) out.push({ s, f, midi });
    }
  }
  return out;
}

export function mount(root, { def, budgetSec = 90, onDone }) {
  const cfg = def.config;
  const roundSec = Math.max(45, Math.min(90, budgetSec));
  const pool = candidates(cfg);
  const to = Math.max(5, cfg.frets[1]);
  const results = [];
  let listener = null;
  let timer = null;
  let target = null;
  let attempts = 0;
  let correct = 0;
  let wrong = 0;
  let busy = false;
  let endAt = 0;

  const promptEl = h('div', { class: 'prompt' }, 'Prepárate');
  const subEl = h('div', { class: 'prompt-sub muted' });
  const fbEl = h('div', { class: 'fb-wrap' });
  const feedback = h('div', { class: 'feedback' });
  const clock = h('div', { class: 'clock' });
  const score = h('div', { class: 'score' });
  const stage = h('div', { class: 'stage' }, h('div', { class: 'row between' }, clock, score), promptEl, subEl, fbEl, feedback);
  const startBtn = startButton('Empezar ronda', () => startRound());
  const controls = h('div', { class: 'controls' }, startBtn);
  root.append(header(def), stage, controls);

  const drawBoard = (marks = [], active = null) => {
    fbEl.replaceChildren(svgNode(fretboardSvg({ from: 0, to, marks, activeStrings: active })));
  };
  drawBoard();

  function label(t) {
    if (cfg.mode === 'open') {
      const extra = t.s === 6 ? ' grave' : t.s === 1 ? ' agudo' : '';
      return [`Toca la cuerda ${pcName(t.midi)}${extra}`, 'al aire'];
    }
    if (cfg.mode === 'pos') return [`Cuerda ${t.s}, traste ${t.f}`, '¿Sabes qué nota es? Tócala y te lo digo.'];
    return [`Encuentra ${pcName(t.midi)}`, `en la cuerda ${t.s} (${pcShort(OPEN_MIDI[t.s])})`];
  }

  function next() {
    let t;
    do { t = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && target && t.midi === target.midi && t.s === target.s);
    target = t;
    attempts = 0;
    const [main, sub] = label(t);
    promptEl.textContent = main;
    subEl.textContent = sub;
    feedback.textContent = '';
    feedback.className = 'feedback';
    if (cfg.mode === 'pos') drawBoard([{ s: t.s, f: t.f, cls: 'target', label: '?' }], [t.s]);
    else if (cfg.mode === 'name') drawBoard([], [t.s]);
    else drawBoard([], null);
    busy = false;
  }

  function onNote(midi) {
    if (!target || busy) return;
    if (matches(midi, target.midi)) {
      correct++;
      busy = true;
      vibrate(30);
      setFeedback(feedback, 'ok', pcName(target.midi));
      drawBoard([{ s: target.s, f: target.f, cls: 'ok', label: pcShort(target.midi) }], [target.s]);
      updateScore();
      setTimeout(next, 650);
      return;
    }
    wrong++;
    attempts++;
    updateScore();
    const onString = midi - OPEN_MIDI[target.s];
    const marks = onString >= 0 && onString <= to ? [{ s: target.s, f: onString, cls: 'bad', label: pcShort(midi) }] : [];
    const dir = midi < target.midi ? 'más aguda: sube de traste' : 'más grave: baja de traste';
    if (attempts >= 3) {
      busy = true;
      setFeedback(feedback, 'bad', `Era aquí: cuerda ${target.s}, traste ${target.f}`);
      drawBoard([...marks, { s: target.s, f: target.f, cls: 'ok', label: pcShort(target.midi) }], [target.s]);
      setTimeout(next, 1800);
    } else {
      setFeedback(feedback, 'bad', `Sonó ${pcName(midi)}. ${cfg.mode === 'open' ? 'Prueba otra cuerda' : `La buscada es ${dir}`}`);
      if (cfg.mode !== 'open') drawBoard(cfg.mode === 'pos' ? [{ s: target.s, f: target.f, cls: 'target', label: '?' }, ...marks] : marks, [target.s]);
    }
  }

  function updateScore() {
    score.replaceChildren(
      h('span', { class: 'ok' }, icon('check', { size: 16 }), correct),
      h('span', { class: 'bad' }, icon('close', { size: 16 }), wrong));
  }

  async function startRound() {
    controls.replaceChildren();
    correct = 0;
    wrong = 0;
    updateScore();
    try {
      listener = new NoteListener({ onNote });
      await listener.start();
    } catch (err) {
      stage.replaceWith(errorBox(err, () => onDone({ skipped: true })));
      return;
    }
    await countdown(promptEl, 3);
    endAt = performance.now() + roundSec * 1000;
    next();
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      clock.replaceChildren(icon('clock', { size: 16 }), `${left} s`);
      if (left <= 0) endRound();
    }, 200);
  }

  function endRound() {
    clearInterval(timer);
    listener?.stop();
    listener = null;
    target = null;
    const value = Math.max(0, Math.round(((correct - 0.5 * wrong) / (roundSec / 60)) * 10) / 10);
    const acc = correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0;
    results.push({ value, acc });
    promptEl.textContent = `${value} aciertos/min`;
    subEl.textContent = `Precisión ${acc}% · ${correct} correctas, ${wrong} fallos`;
    setFeedback(feedback, '', acc < 80 ? 'Más vale lento y seguro: cada fallo resta medio punto.' : '');
    controls.replaceChildren(roundButtons(startRound, finish));
  }

  function finish() {
    const best = results.reduce((a, r) => (r.value > a.value ? r : a));
    onDone({ value: best.value, extra: { acc: best.acc } });
  }

  return () => {
    clearInterval(timer);
    listener?.stop();
  };
}
