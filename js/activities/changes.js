// Cambios de un minuto: un rasgueo por acorde, la app cuenta los ataques por micrófono.
import { h, chordCard } from '../ui.js';
import { icon } from '../icons.js';
import { chordName } from '../music.js';
import { acquireMic, releaseMic, onMicEvent, click, now } from '../audio.js';
import { header, roundButtons, countdown, vibrate, startButton } from './common.js';

const ROUND_SEC = 60;
const MIN_GAP = 0.3; // s entre cambios contados

export function mount(root, { def, onDone }) {
  const { a, b, easy = false } = def.config;
  const results = [];
  let count = 0;
  let running = false;
  let useMic = true;
  let micHeld = false;
  let offMic = null;
  let lastOnset = 0;
  let timer = null;

  const cardA = chordCard(a, '', { easy });
  const cardB = chordCard(b, '', { easy });
  const counter = h('div', { class: 'big-count' }, '0');
  const clock = h('div', { class: 'clock' }, `${ROUND_SEC} s`);
  const msg = h('div', { class: 'prompt-sub' }, 'Un rasgueo por acorde. No importa que suene perfecto: importa cambiar.');
  const modeBtn = h('button', { class: 'btn small ghost block', onclick: () => setMode(!useMic) });
  const tap = h('button', { class: 'btn', onclick: () => { if (running) bump(1); } });
  const minus = h('button', { class: 'btn', style: { flex: '0 0 64px' }, onclick: () => { if (count > 0) bump(-1); } }, icon('minus', { size: 18 }));

  const stage = h('div', { class: 'stage' },
    h('div', { class: 'chord-row' }, cardA, h('div', { class: 'swap' }, icon('swap', { size: 22 })), cardB),
    h('div', { class: 'col center', style: { alignItems: 'center', gap: '4px', margin: '18px 0 6px' } },
      clock, counter, h('div', { class: 'unit' }, 'cambios')),
    msg,
    h('div', { class: 'btn-row', style: { marginTop: '16px' } }, minus, tap),
    modeBtn);
  const startBtn = startButton('Empezar minuto', () => startRound());
  const controls = h('div', { class: 'controls' }, startBtn);
  root.append(header(def), stage, controls);

  function setMode(mic) {
    useMic = mic;
    modeBtn.replaceChildren(icon(useMic ? 'mic' : 'plus', { size: 16 }), useMic ? 'Cuenta el micrófono · pasar a manual' : 'Cuentas tú · pasar a micrófono');
    tap.replaceChildren(icon('plus', { size: 18 }), useMic ? 'Sumar uno' : 'Cambio');
  }
  setMode(true);

  function highlight() {
    const onA = count % 2 === 0;
    cardA.classList.toggle('active', onA);
    cardB.classList.toggle('active', !onA);
  }
  highlight();

  function bump(d) {
    count += d;
    counter.textContent = count;
    counter.classList.remove('bump');
    void counter.offsetWidth;
    counter.classList.add('bump');
    highlight();
  }

  async function startRound() {
    controls.replaceChildren();
    count = 0;
    counter.textContent = '0';
    highlight();
    if (useMic && !micHeld) {
      try {
        await acquireMic();
        micHeld = true;
        offMic = onMicEvent((e) => {
          if (!running || !useMic || e.type !== 'onset' || e.band !== 'strum') return;
          if (e.time - lastOnset < MIN_GAP) return;
          lastOnset = e.time;
          bump(1);
        });
      } catch (err) {
        setMode(false);
        msg.textContent = `${err.message} Cuenta a mano tocando el botón.`;
      }
    }
    msg.textContent = `Empieza en ${chordName(a)}.`;
    await countdown(clock, 3);
    lastOnset = now() + 0.2;
    running = true;
    click(now(), true, 0.6);
    const end = performance.now() + ROUND_SEC * 1000;
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      clock.textContent = `${left} s`;
      if (left <= 0) endRound();
    }, 200);
  }

  function endRound() {
    clearInterval(timer);
    running = false;
    click(now(), true, 0.6);
    vibrate(120);
    results.push(count);
    msg.textContent = `${count} cambios en un minuto. ${count < def.metric.target ? `Objetivo: ${def.metric.target}.` : 'Objetivo cumplido.'}`;
    controls.replaceChildren(roundButtons(startRound, () => onDone({ value: Math.max(...results) })));
  }

  return () => {
    clearInterval(timer);
    offMic?.();
    if (micHeld) releaseMic();
  };
}
