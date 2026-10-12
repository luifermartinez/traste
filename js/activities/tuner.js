import { h, svgNode } from '../ui.js';
import { icon } from '../icons.js';
import { OPEN_MIDI, STRING_NUMS, midiToFreq, pcName, pcShort, freqToMidi } from '../music.js';
import { acquireMic, releaseMic, readPitch, playNote, audioRunning } from '../audio.js';
import { header, errorBox, vibrate } from './common.js';

const IN_TUNE = 5; // cents
const HOLD_MS = 600;
const REST = -56; // grados: la aguja reposa a la izquierda, como un vúmetro real

/** Vúmetro analógico: ±50 cents = ±50°. Devuelve {el, set(cents|null), ok(bool)}. */
function vuMeter() {
  const PX = 150;
  const PY = 182;
  const pt = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [(PX + r * Math.sin(a)).toFixed(1), (PY - r * Math.cos(a)).toFixed(1)];
  };
  const arc = (d0, d1, r) => `M${pt(d0, r).join(' ')} A${r} ${r} 0 0 1 ${pt(d1, r).join(' ')}`;
  let s = '<svg viewBox="0 0 300 150" aria-hidden="true"><defs>'
    + '<linearGradient id="vuFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e6bd"/><stop offset="1" stop-color="#d9bb7c"/></linearGradient>'
    + '<radialGradient id="vuGlow" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#ffc56a" stop-opacity=".6"/><stop offset="1" stop-color="#ffc56a" stop-opacity="0"/></radialGradient>'
    + '</defs><rect width="300" height="150" class="vu-face"/><rect width="300" height="150" class="vu-glow"/>';
  s += `<path d="${arc(-50, 50, 132)}" class="vu-arc"/>`;
  s += `<path d="${arc(-50, -30, 140)}" class="vu-red"/><path d="${arc(30, 50, 140)}" class="vu-red"/>`;
  s += `<path d="${arc(-5, 5, 139)}" class="vu-zone"/>`;
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    const [x0, y0] = pt(c, 132);
    const [x1, y1] = pt(c, major ? 119 : 125);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="vu-tick ${major ? 'major' : ''}"/>`;
    if (major) {
      const [tx, ty] = pt(c, 106);
      s += `<text x="${tx}" y="${Number(ty) + 3}" text-anchor="middle" class="vu-txt">${c > 0 ? '+' : ''}${c}</text>`;
    }
  }
  s += '<text x="150" y="104" text-anchor="middle" class="vu-brand">CENTS</text>';
  s += `<line x1="${PX}" y1="${PY}" x2="${PX}" y2="30" class="vu-needle"/>`;
  s += '<rect x="0" y="134" width="300" height="16" fill="#1b140d"/><rect x="0" y="134" width="300" height="1" fill="#000" opacity=".5"/></svg>';
  const lamp = h('span', { class: 'lamp' });
  const el = h('div', { class: 'vu' }, svgNode(s), lamp);
  const needle = el.querySelector('.vu-needle');
  return {
    el,
    set(cents) { needle.style.transform = `rotate(${cents == null ? REST : Math.max(-55, Math.min(55, cents))}deg)`; },
    ok(on) { lamp.classList.toggle('on', on); el.classList.toggle('ok', on); },
  };
}

/** Afinador. En sesión termina solo cuando las 6 cuerdas están afinadas. */
export function mount(root, { def, onDone, standalone = false }) {
  const tuned = new Set();
  const chips = {};
  const noteEl = h('div', { class: 'tuner-note' }, '—');
  const vu = vuMeter();
  vu.set(null);
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

  const meter = vu.el;
  const body = h('div', { class: 'tuner' }, noteEl, meter, centsEl, hintEl, strings,
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
      if (p.rms < 0.004) { inTuneSince = null; vu.ok(false); vu.set(null); }
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
    vu.set(cents);
    centsEl.textContent = `${cents > 0 ? '+' : ''}${Math.round(cents)} cents · ${freq.toFixed(1)} Hz`;
    Object.values(chips).forEach((el) => el.classList.remove('active'));
    chips[s].classList.add('active');

    if (Math.abs(cents) <= IN_TUNE) {
      vu.ok(true);
      hint('ok', 'check', 'Afinada');
      inTuneSince ??= { s, t: performance.now() };
      if (inTuneSince.s === s && performance.now() - inTuneSince.t > HOLD_MS && !tuned.has(s)) {
        tuned.add(s);
        chips[s].classList.add('done');
        vibrate(40);
        if (!standalone && tuned.size === 6) finish();
      }
    } else {
      vu.ok(false);
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
