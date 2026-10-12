// Oído: la app toca una nota y tienes que encontrarla en la guitarra.
import { h, svgNode, fretboardSvg } from '../ui.js';
import { icon } from '../icons.js';
import { pcName, pcShort, positionsOf, mod12, pick } from '../music.js';
import { NoteListener, playNote, now } from '../audio.js';
import { header, errorBox, roundButtons, vibrate, startButton, setFeedback } from './common.js';

const ROUNDS = 8;

export function mount(root, { def, onDone }) {
  const { pool, hint } = def.config;
  const results = [];
  let listener = null;
  let target = null;
  let round = 0;
  let attempts = 0;
  let firstTry = 0;
  let busy = false;

  const prompt = h('div', { class: 'prompt' }, 'Escucha y encuéntrala');
  const sub = h('div', { class: 'prompt-sub' }, `Pista: ${hint}. Vale cualquier octava.`);
  const feedback = h('div', { class: 'feedback' });
  const fbEl = h('div', { class: 'fb-wrap' });
  const progressEl = h('div', { class: 'eyebrow center', style: { display: 'block' } });
  const replay = h('button', { class: 'btn', onclick: () => play() }, icon('refresh', { size: 18 }), 'Repetir sonido');
  const giveUp = h('button', { class: 'btn ghost', onclick: () => reveal() }, 'Me rindo');
  const stage = h('div', { class: 'stage' }, progressEl, prompt, sub, h('div', { class: 'btn-row', style: { marginTop: '16px' } }, replay, giveUp), feedback, fbEl);
  const controls = h('div', { class: 'controls' }, startButton('Empezar', () => startRound()));
  root.append(header(def), stage, controls);

  const maxFret = 9;

  function play() {
    if (!target) return;
    playNote(target, now() + 0.05, 0.6, 1.4);
    listener?.mute(1.7);
  }

  function showPositions(cls) {
    const marks = positionsOf(target, maxFret).map((p) => ({ ...p, cls, label: pcShort(target) }));
    fbEl.replaceChildren(svgNode(fretboardSvg({ from: 0, to: maxFret, marks })));
  }

  function next() {
    if (round >= ROUNDS) { endRound(); return; }
    round++;
    attempts = 0;
    busy = false;
    let t;
    do { t = pick(pool); } while (pool.length > 1 && t === target);
    target = t;
    progressEl.textContent = `Nota ${round} de ${ROUNDS} · ${firstTry} a la primera`;
    setFeedback(feedback, '', '');
    fbEl.replaceChildren();
    play();
  }

  function reveal() {
    if (!target || busy) return;
    busy = true;
    setFeedback(feedback, 'bad', `Era ${pcName(target)}`);
    showPositions('ok');
    play();
    setTimeout(next, 2600);
  }

  function onNote(midi) {
    if (!target || busy) return;
    if (mod12(midi) === mod12(target)) {
      busy = true;
      if (attempts === 0) firstTry++;
      vibrate(30);
      setFeedback(feedback, 'ok', `${pcName(target)}${attempts === 0 ? ', a la primera' : ''}`);
      showPositions('ok');
      setTimeout(next, 1500);
      return;
    }
    attempts++;
    const diff = midi - target;
    const dir = Math.abs(diff) < 12 ? (diff > 0 ? 'más grave' : 'más aguda') : 'en otra octava';
    setFeedback(feedback, 'bad', `Sonó ${pcName(midi)}. La buscada es ${dir}`);
    if (attempts >= 4) reveal();
  }

  async function startRound() {
    controls.replaceChildren();
    round = 0;
    firstTry = 0;
    target = null;
    try {
      listener = new NoteListener({ onNote });
      await listener.start();
    } catch (err) {
      stage.replaceWith(errorBox(err, () => onDone({ skipped: true })));
      return;
    }
    next();
  }

  function endRound() {
    listener?.stop();
    listener = null;
    target = null;
    const value = Math.round((firstTry / ROUNDS) * 100);
    results.push(value);
    prompt.textContent = `${value}% al primer intento`;
    setFeedback(feedback, '', value >= 70 ? 'Tu oído está conectando con el mástil.' : 'Canta la nota antes de buscarla: si la puedes cantar, la encuentras antes.');
    controls.replaceChildren(roundButtons(startRound, () => onDone({ value: Math.max(...results) })));
  }

  return () => listener?.stop();
}
