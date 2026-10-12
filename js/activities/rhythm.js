// Ritmo: rasgueas un patrón con el metrónomo; la app mide cada golpe en milisegundos.
import { h, chordCard } from '../ui.js';
import { icon } from '../icons.js';
import { PATTERNS } from '../music.js';
import { acquireMic, releaseMic, onMicEvent, Metronome, calibrateLoopback, classifyStrums, audioCtx } from '../audio.js';
import { state, save, currentParam } from '../store.js';
import { header, errorBox, roundButtons, latency, startButton } from './common.js';

const BARS = 4;
const GOOD = 0.06;
const CLOSE = 0.12;
const WINDOW = 0.16;

/** Empareja golpes esperados con onsets detectados. Exportado para pruebas. */
export function evaluate(expected, onsets, lat) {
  const used = new Set();
  const hits = expected.map((t) => {
    let bestI = -1;
    let bestErr = Infinity;
    onsets.forEach((o, i) => {
      if (used.has(i)) return;
      const err = o - lat - t;
      if (Math.abs(err) < Math.abs(bestErr)) { bestErr = err; bestI = i; }
    });
    if (bestI >= 0 && Math.abs(bestErr) <= WINDOW) {
      used.add(bestI);
      return { t, err: bestErr, cls: Math.abs(bestErr) <= GOOD ? 'good' : Math.abs(bestErr) <= CLOSE ? 'close' : 'late' };
    }
    return { t, err: null, cls: 'miss' };
  });
  const good = hits.filter((x) => x.cls === 'good').length;
  const close = hits.filter((x) => x.cls === 'close').length;
  const matched = hits.filter((x) => x.err != null);
  const bias = matched.length ? matched.reduce((a, x) => a + x.err, 0) / matched.length : 0;
  return {
    hits,
    score: Math.round(((good + 0.5 * close) / expected.length) * 100),
    bias,
    extras: onsets.length - used.size,
  };
}

export function mount(root, { def, onDone }) {
  const pat = PATTERNS[def.config.pattern];
  const bpm = currentParam(def) || 60;
  const results = [];
  const slotsPerBeat = pat.grid;
  const slots = 4 * slotsPerBeat;
  const slotOf = (pos) => Math.round(pos * slotsPerBeat);
  let met = null;
  let raf = 0;
  let offMic = null;
  let micHeld = false;
  let disposed = false;

  const countLabels = slotsPerBeat === 3 ? ['1', 'y', 'a'] : ['1', 'y'];
  const cells = Array.from({ length: slots }, (_, i) => {
    const hitIdx = pat.hits.findIndex((p) => slotOf(p) === i);
    const lbl = i % slotsPerBeat === 0 ? String(i / slotsPerBeat + 1) : countLabels[i % slotsPerBeat];
    return h('div', { class: `slot ${hitIdx >= 0 ? 'hit' : ''}` },
      h('div', { class: 'stroke' }, hitIdx >= 0 ? pat.strokes[hitIdx] : '·'),
      h('div', { class: 'count' }, lbl));
  });
  const grid = h('div', { class: 'rhythm-grid', style: { gridTemplateColumns: `repeat(${slots}, 1fr)` } }, cells);
  const status = h('div', { class: 'prompt' }, `${pat.name} · ${bpm} BPM`);
  const sub = h('div', { class: 'prompt-sub' }, `Escucha 4 clics de cuenta sin tocar y luego ${BARS} compases rasgueando el acorde. Con auriculares la medición es aún más precisa.`);
  const dots = h('div', { class: 'hit-dots' });
  const legend = h('div', { class: 'legend', hidden: true },
    h('span', null, h('i', { class: 'dot good' }), 'justo'), h('span', null, h('i', { class: 'dot close' }), 'cerca'), h('span', null, h('i', { class: 'dot miss' }), 'perdido'));
  const insight = h('div');
  const stage = h('div', { class: 'stage' }, status, sub, grid, def.config.chord && h('div', { class: 'chord-row small' }, chordCard(def.config.chord)), dots, legend);
  const controls = h('div', { class: 'controls' }, startButton('Empezar', () => startRound()));
  root.append(header(def), stage, insight, controls);

  async function ensureMic() {
    if (micHeld) return;
    await acquireMic();
    if (disposed) { releaseMic(); throw new Error('cerrado'); }
    micHeld = true;
    if (state.settings.latency == null && !state.settings.autoCalibrationFailed) {
      status.textContent = 'Calibrando latencia…';
      sub.textContent = 'Silencio 4 segundos: la app escucha sus propios clics para medir el retardo de tu dispositivo.';
      const lat = await calibrateLoopback();
      if (lat != null) {
        state.settings.latency = lat;
        save();
        sub.textContent = `Latencia medida: ${Math.round(lat * 1000)} ms.`;
      } else {
        state.settings.autoCalibrationFailed = true;
        save();
        sub.textContent = 'No pude oír los clics (¿auriculares?). Uso un valor estándar; puedes calibrar tocando en Herramientas → Calibrar.';
      }
    }
  }

  async function startRound() {
    controls.replaceChildren();
    try {
      await ensureMic();
    } catch (err) {
      if (!disposed) stage.replaceWith(errorBox(err, () => onDone({ skipped: true })));
      return;
    }
    dots.replaceChildren();
    legend.hidden = true;
    insight.replaceChildren();
    const onsets = [];
    offMic = onMicEvent((e) => { if (e.type === 'onset' && e.band === 'strum') onsets.push(e); });
    const beat = 60 / bpm;
    met = new Metronome({ bpm, volume: state.settings.clickVol });
    const start = met.start(audioCtx().currentTime + 0.3);
    const first = start + 4 * beat;
    const expected = [];
    for (let bar = 0; bar < BARS; bar++) for (const p of pat.hits) expected.push(first + (bar * 4 + p) * beat);
    const end = first + BARS * 4 * beat;
    status.textContent = 'Cuenta: 1 · 2 · 3 · 4';

    const ac = audioCtx();
    const outLat = ac.outputLatency || ac.baseLatency || 0;
    const frame = () => {
      const t = ac.currentTime - outLat;
      if (t < first) {
        const b = Math.floor((t - start) / beat);
        if (b >= 0) status.textContent = `Cuenta: ${b + 1}…`;
      } else if (t < end) {
        const bar = Math.floor((t - first) / (4 * beat));
        status.textContent = `Compás ${bar + 1} de ${BARS}`;
        const slot = Math.floor(((t - first) % (4 * beat)) / beat * slotsPerBeat);
        cells.forEach((c, i) => c.classList.toggle('now', i === slot));
      } else if (t < end + 0.35) {
        // Espera a que lleguen los últimos golpes (latencia del micrófono).
        cells.forEach((c) => c.classList.remove('now'));
      } else {
        const clicks = Array.from({ length: 4 + BARS * 4 + 1 }, (_, b) => start + b * beat);
        const { strums, clickHeard } = classifyStrums(onsets, clicks, clicks.slice(0, 4), latency());
        finishRound(expected, strums.filter((o) => o > first - 0.3 && o < end + 0.3), clickHeard);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function finishRound(expected, onsets, clickHeard) {
    met.stop();
    offMic?.();
    offMic = null;
    const r = evaluate(expected, onsets, latency());
    results.push(r);
    status.textContent = `${r.score}% a tiempo`;
    sub.textContent = `${r.hits.filter((x) => x.cls === 'good').length} justos · ${r.hits.filter((x) => x.cls === 'close' || x.cls === 'late').length} cerca · ${r.hits.filter((x) => x.cls === 'miss').length} perdidos`;
    dots.replaceChildren(...r.hits.map((x) => h('span', { class: `dot ${x.cls}`, title: x.err == null ? 'sin golpe' : `${Math.round(x.err * 1000)} ms` })));
    legend.hidden = false;
    const tips = [];
    const ms = Math.round(r.bias * 1000);
    if (Math.abs(ms) >= 25) tips.push(ms < 0 ? `Tiendes a adelantarte unos ${-ms} ms. Escucha el clic y espera a que suene.` : `Tiendes a atrasarte unos ${ms} ms. Anticipa el movimiento de la mano.`);
    else if (r.score >= 50) tips.push('Tu pulso está centrado: ni adelantado ni atrasado.');
    if (r.extras > expected.length * 0.25) tips.push('Detecté golpes de más: en los huecos la mano se mueve pero no toca las cuerdas.');
    if (r.hits.filter((x) => x.cls === 'miss').length > expected.length / 2) {
      tips.push(clickHeard
        ? 'El micrófono oye mucho el clic: usa auriculares o baja el volumen del clic (Ajustes) y acerca el móvil a la guitarra.'
        : 'Si no te detecta, acerca el móvil a la guitarra o sube la sensibilidad en Ajustes.');
    }
    insight.replaceChildren(...tips.map((t) => h('div', { class: 'tip' }, icon('search', { size: 18 }), h('span', null, t))));
    controls.replaceChildren(roundButtons(startRound, () => {
      const best = results.reduce((a, x) => (x.score > a.score ? x : a));
      onDone({ value: best.score, extra: { bias: Math.round(best.bias * 1000) } });
    }));
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    met?.stop();
    offMic?.();
    if (micHeld) releaseMic();
  };
}
