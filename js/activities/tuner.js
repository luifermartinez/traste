import { h } from '../ui.js';
import { icon } from '../icons.js';
import { OPEN_MIDI, STRING_NUMS, midiToFreq, pcName, pcShort, freqToMidi } from '../music.js';
import { acquireMic, releaseMic, readPitch, playNote, audioRunning } from '../audio.js';
import { header, errorBox, vibrate } from './common.js';

const IN_TUNE = 5; // cents
const HOLD_MS = 600;

/** Medidor lineal: ±50 cents a lo ancho, zona verde de ±5. Devuelve {el, set(cents|null), ok(bool)}. */
function centsMeter() {
  const dot = h('div', { class: 'meter-dot idle' });
  const ticks = [-50, -25, 25, 50].map((c) => h('i', { class: 'meter-tick', style: { left: `${50 + c}%` } }));
  const el = h('div', null,
    h('div', { class: 'meter', role: 'img', 'aria-label': 'Desviación en cents' },
      h('div', { class: 'meter-zone' }), h('div', { class: 'meter-track' }), ticks, h('i', { class: 'meter-tick mid', style: { left: '50%' } }), dot),
    h('div', { class: 'meter-scale' }, h('span', null, '−50'), h('span', null, '0'), h('span', null, '+50')));
  return {
    el,
    set(cents) {
      dot.classList.toggle('idle', cents == null);
      dot.style.left = `${cents == null ? 50 : 50 + Math.max(-50, Math.min(50, cents))}%`;
    },
    ok(on) { dot.classList.toggle('ok', on); },
  };
}

/** Afinador. En sesión termina solo cuando las 6 cuerdas están afinadas. */
export function mount(root, { def, onDone, standalone = false }) {
  const tuned = new Set();
  const chips = {};
  const noteEl = h('div', { class: 'tuner-note' }, '—');
  const meter = centsMeter();
  const centsEl = h('div', { class: 'tuner-cents' }, 'Toca una cuerda al aire');
  const hintEl = h('div', { class: 'tuner-hint' });
  let mic = null;
  let timer = null;
  let t0 = null;
  let inTuneSince = null;
  let mutedUntil = 0;
  let asleep = false;
  const recent = [];

  const strings = h('div', { class: 'tuner-strings' }, STRING_NUMS.map((s) => {
    chips[s] = h('button', {
      class: 'string-chip',
      title: 'Escuchar nota de referencia',
      onclick: () => { playNote(OPEN_MIDI[s], undefined, 0.6, 2); mutedUntil = performance.now() + 2500; },
    }, h('small', null, `${s}ª`), pcShort(OPEN_MIDI[s]));
    return chips[s];
  }));

  const meterEl = meter.el;
  const body = h('div', { class: 'tuner' }, noteEl, meterEl, centsEl, hintEl, strings,
    h('p', { class: 'muted small center' }, 'Toca una cuerda de la lista para oír su nota de referencia.'));

  const skipBtn = !standalone && h('button', { class: 'btn ghost block', onclick: () => onDone({ skipped: true }) }, 'Ya está afinada, saltar');
  root.append(...[def && header(def), h('div', { class: 'stage' }, body), skipBtn].filter(Boolean));
  const hint = (tone, iconName, text) => {
    hintEl.className = `tuner-hint ${tone}`;
    hintEl.replaceChildren(icon(iconName, { size: 18 }), text);
  };

  function tick() {
    if (performance.now() < mutedUntil) return;
    if (!audioRunning()) { centsEl.textContent = 'Toca la pantalla para activar el micrófono'; asleep = true; return; }
    if (asleep) { centsEl.textContent = 'Toca una cuerda al aire'; asleep = false; }
    const p = readPitch(mic);
    if (!p.freq || p.clarity < 0.85 || p.freq < 70 || p.freq > 400) {
      if (p.rms < 0.004) { inTuneSince = null; meter.ok(false); meter.set(null); }
      return;
    }
    recent.push(p.freq);
    if (recent.length > 5) recent.shift();
    const freq = recent.slice().sort((a, b) => a - b)[recent.length >> 1];
    t0 ??= performance.now();

    let best = null;
    for (const s of STRING_NUMS) {
      const cents = 1200 * Math.log2(freq / midiToFreq(OPEN_MIDI[s]));
      if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { s, cents };
    }
    if (Math.abs(best.cents) > 350) {
      noteEl.textContent = pcName(Math.round(freqToMidi(freq)));
      centsEl.textContent = 'Muy lejos de cualquier cuerda: ¿es una cuerda al aire?';
      return;
    }
    const { s, cents } = best;
    noteEl.textContent = `${s}ª · ${pcName(OPEN_MIDI[s])}`;
    meter.set(cents);
    centsEl.textContent = `${cents > 0 ? '+' : ''}${Math.round(cents)} cents · ${freq.toFixed(1)} Hz`;
    Object.values(chips).forEach((el) => el.classList.remove('active'));
    chips[s].classList.add('active');

    if (Math.abs(cents) <= IN_TUNE) {
      meter.ok(true);
      hint('ok', 'check', 'Afinada');
      inTuneSince ??= { s, t: performance.now() };
      if (inTuneSince.s === s && performance.now() - inTuneSince.t > HOLD_MS && !tuned.has(s)) {
        tuned.add(s);
        chips[s].classList.add('done');
        vibrate(40);
        if (!standalone && tuned.size === 6) finish();
      }
    } else {
      meter.ok(false);
      inTuneSince = null;
      hint('', cents < 0 ? 'arrowUp' : 'arrowDown', cents < 0 ? 'Grave: tensa la cuerda' : 'Aguda: aflójala un poco y vuelve a subir');
    }
  }

  function finish() {
    clearInterval(timer);
    const secs = Math.round((performance.now() - t0) / 1000);
    hint('ok', 'check', `Las 6 cuerdas afinadas en ${secs} s`);
    setTimeout(() => onDone({ value: secs }), 900);
  }

  let disposed = false;
  (async () => {
    try {
      const m = await acquireMic();
      if (disposed) { releaseMic(); return; }
      mic = m;
      timer = setInterval(tick, 40);
    } catch (err) {
      if (skipBtn) skipBtn.remove();
      body.replaceWith(errorBox(err, standalone ? null : () => onDone({ skipped: true })));
    }
  })();

  return () => {
    disposed = true;
    clearInterval(timer);
    if (mic) releaseMic();
  };
}
