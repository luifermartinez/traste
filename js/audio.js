// Motor de audio: contexto, micrófono, detección de tono (YIN), onsets, metrónomo,
// síntesis de cuerda pulsada (Karplus-Strong) y calibración de latencia.
import { midiToFreq, freqToMidi, chordMidis } from './music.js';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const now = () => audioCtx().currentTime;

/** Reactiva el audio si el navegador lo suspendió (exige un gesto del usuario). */
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export const audioRunning = () => !!ctx && ctx.state === 'running';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ejecuta fn cuando el audio programado para `time` suena por el altavoz. */
export function atAudioTime(time, fn) {
  const ac = audioCtx();
  const lat = (ac.outputLatency || ac.baseLatency || 0);
  return setTimeout(fn, Math.max(0, (time - ac.currentTime + lat) * 1000));
}

// ─────────────── Detección de tono ───────────────

/** YIN: devuelve {freq, clarity} o null. buf en [-1, 1]. */
export function yin(buf, sampleRate, threshold = 0.15, minF = 70, maxF = 1100) {
  const half = buf.length >> 1;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxF));
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minF));
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    d[tau] = running ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const x0 = d[tau - 1];
  const x2 = d[tau + 1];
  const denom = x0 + x2 - 2 * d[tau];
  const better = denom > 0 ? tau + (x0 - x2) / (2 * denom) : tau;
  return { freq: sampleRate / better, clarity: 1 - d[tau] };
}

// ─────────────── Micrófono ───────────────

let mic = null;
let micPromise = null;
let micUsers = 0;
let micStopTimer = null;
const micListeners = new Set();
let sensitivity = 1;

export class MicError extends Error {}

async function openMic() {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicError('Este navegador no permite usar el micrófono (¿abriste la app por https?).');
  const ac = audioCtx();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    throw new MicError(err.name === 'NotAllowedError'
      ? 'Permiso de micrófono denegado. Actívalo en la configuración del navegador para esta página.'
      : `No se pudo abrir el micrófono (${err.name}).`);
  }
  const source = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  await ac.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
  const node = new AudioWorkletNode(ac, 'onset-detector', { numberOfInputs: 1, numberOfOutputs: 1 });
  const sink = ac.createGain();
  sink.gain.value = 0;
  source.connect(node);
  node.connect(sink).connect(ac.destination);
  node.port.onmessage = (e) => { for (const fn of micListeners) fn(e.data); };
  node.port.postMessage({ sensitivity });
  return { stream, source, analyser, node, sink, buf: new Float32Array(analyser.fftSize), sampleRate: ac.sampleRate };
}

/** Pide el micrófono (compartido). Cada acquire debe tener su release. */
export async function acquireMic() {
  clearTimeout(micStopTimer);
  micUsers++;
  if (mic) return mic;
  if (!micPromise) micPromise = openMic();
  try {
    mic = await micPromise;
  } catch (err) {
    micUsers--;
    micPromise = null;
    throw err;
  }
  return mic;
}

/** Libera el micrófono; se cierra unos segundos después si nadie más lo usa. */
export function releaseMic() {
  micUsers = Math.max(0, micUsers - 1);
  if (micUsers > 0) return;
  clearTimeout(micStopTimer);
  micStopTimer = setTimeout(() => {
    if (micUsers > 0 || !mic) return;
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.source.disconnect();
    mic.node.disconnect();
    mic.sink.disconnect();
    mic = null;
    micPromise = null;
  }, 4000);
}

/**
 * Escucha eventos del worklet:
 * {type:'onset', band:'full'|'strum', time, energy} | {type:'level', energy}.
 */
export function onMicEvent(fn) {
  micListeners.add(fn);
  return () => micListeners.delete(fn);
}

export function setSensitivity(s) {
  sensitivity = s;
  mic?.node.port.postMessage({ sensitivity: s });
}

/** Lee el tono actual del micrófono: {rms, freq?, clarity?, midi?, cents?}. */
export function readPitch(m) {
  m.analyser.getFloatTimeDomainData(m.buf);
  let sum = 0;
  for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
  const rms = Math.sqrt(sum / m.buf.length);
  if (rms < 0.004 / sensitivity) return { rms };
  const r = yin(m.buf, m.sampleRate);
  if (!r) return { rms };
  const mf = freqToMidi(r.freq);
  const midi = Math.round(mf);
  return { rms, freq: r.freq, clarity: r.clarity, midi, cents: (mf - midi) * 100 };
}

/**
 * Escucha notas "tocadas": un tono estable durante varios frames. Una nota igual a la
 * anterior solo se vuelve a reportar tras un nuevo ataque o un silencio.
 */
export class NoteListener {
  constructor({ onNote, onFrame, minClarity = 0.82, stableFrames = 3 } = {}) {
    Object.assign(this, { onNote, onFrame, minClarity, stableFrames });
    this.stable = null;
    this.count = 0;
    this.lastReported = null;
    this.armed = true;
    this.muteUntil = 0;
  }

  async start() {
    const m = await acquireMic();
    if (this.stopped) { releaseMic(); return; }
    this.mic = m;
    this.off = onMicEvent((e) => {
      if (e.type === 'onset' && e.band === 'full') { this.armed = true; this.count = 0; this.stable = null; }
    });
    this.timer = setInterval(() => this.tick(), 30);
  }

  tick() {
    if (audioCtx().currentTime < this.muteUntil) { this.count = 0; this.stable = null; this.armed = true; return; }
    const p = readPitch(this.mic);
    this.onFrame?.(p);
    if (!p.freq || p.clarity < this.minClarity) {
      this.count = 0;
      this.stable = null;
      if (p.rms < 0.006) this.armed = true;
      return;
    }
    if (p.midi === this.stable) this.count++;
    else { this.stable = p.midi; this.count = 1; }
    if (this.count === this.stableFrames && (this.armed || p.midi !== this.lastReported)) {
      this.armed = false;
      this.lastReported = p.midi;
      this.onNote?.(p.midi, p);
    }
  }

  /** Ignora el micrófono durante `sec` segundos (p.ej. mientras suena la app). */
  mute(sec) { this.muteUntil = audioCtx().currentTime + sec; }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.off?.();
    if (this.mic) releaseMic();
    this.mic = null;
  }
}

// ─────────────── Sonido ───────────────

let master = null;
function out() {
  const ac = audioCtx();
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);
  }
  return master;
}

export function click(time, accent = false, vol = 0.7) {
  if (vol <= 0) return;
  const ac = audioCtx();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = accent ? 3200 : 2400;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
  o.connect(g).connect(out());
  o.start(time);
  o.stop(time + 0.06);
}

const pluckCache = new Map();
function pluckBuffer(midi) {
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const ac = audioCtx();
  const sr = ac.sampleRate;
  const period = sr / midiToFreq(midi);
  const n = Math.max(2, Math.round(period));
  const len = Math.floor(sr * 2.2);
  const buffer = ac.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);
  const ring = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) { lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5; ring[i] = lp; }
  const decay = 0.9985 - Math.min(0.004, midi * 0.00002);
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const nxt = idx + 1 === n ? 0 : idx + 1;
    const v = ring[idx];
    data[i] = v;
    ring[idx] = decay * 0.5 * (v + ring[nxt]);
    idx = nxt;
    peak = Math.max(peak, Math.abs(v));
  }
  const fade = Math.floor(sr * 0.15);
  for (let i = 0; i < len; i++) {
    data[i] /= peak || 1;
    if (i > len - fade) data[i] *= (len - i) / fade;
  }
  pluckCache.set(midi, buffer);
  return buffer;
}

/** Toca una nota de guitarra sintetizada. Devuelve la duración audible aproximada. */
export function playNote(midi, time = now(), vol = 0.5, dur = 1.8) {
  const ac = audioCtx();
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.setTargetAtTime(0.0001, time + dur, 0.08);
  src.connect(g).connect(out());
  src.start(time);
  src.stop(time + dur + 0.5);
  return dur;
}

/** Rasgueo de un acorde (↓ de grave a agudo, ↑ al revés). */
export function strum(sym, time = now(), { up = false, vol = 0.28, dur = 1.2, spread = 0.014 } = {}) {
  const notes = chordMidis(sym);
  const order = up ? notes.slice().reverse() : notes;
  order.forEach((m, i) => playNote(m, time + i * spread, vol * (up ? 0.75 : 1), dur));
}

// ─────────────── Metrónomo ───────────────

export class Metronome {
  constructor({ bpm = 60, beatsPerBar = 4, volume = 0.7, onTick } = {}) {
    Object.assign(this, { bpm, beatsPerBar, volume, onTick });
    this.timer = null;
  }

  get beatDur() { return 60 / this.bpm; }

  /** Empieza a sonar; devuelve el tiempo de audio del primer pulso. */
  start(at) {
    this.stop();
    const ac = audioCtx();
    this.next = at ?? ac.currentTime + 0.2;
    this.startTime = this.next;
    this.beat = 0;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    return this.startTime;
  }

  schedule() {
    const ac = audioCtx();
    while (this.next < ac.currentTime + 0.15) {
      const accent = this.beat % this.beatsPerBar === 0;
      click(this.next, accent, this.volume);
      this.onTick?.(this.beat, this.next);
      if (!this.timer) break;
      this.beat++;
      this.next += this.beatDur;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

// ─────────────── Calibración de latencia ───────────────

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * Mide la latencia total (salida + entrada) haciendo que el micrófono escuche los clics
 * del propio altavoz. Devuelve segundos o null si no se oyeron (p.ej. con auriculares).
 */
export async function calibrateLoopback() {
  await acquireMic();
  const onsets = [];
  const off = onMicEvent((e) => { if (e.type === 'onset' && e.band === 'full') onsets.push(e.time); });
  try {
    const ac = audioCtx();
    const t0 = ac.currentTime + 0.4;
    const clicks = Array.from({ length: 8 }, (_, i) => t0 + i * 0.45);
    clicks.forEach((t) => click(t, true, 1));
    await sleep((clicks.at(-1) - ac.currentTime + 0.6) * 1000);
    const offsets = [];
    for (const t of clicks) {
      const hit = onsets.find((o) => o >= t && o <= t + 0.35);
      if (hit != null) offsets.push(hit - t);
    }
    return offsets.length >= 5 ? median(offsets) : null;
  } finally {
    off();
    releaseMic();
  }
}

/**
 * Separa tus golpes de los clics del metrónomo (banda 'strum').
 * `clicks`: tiempos programados de todos los clics; `countIn`: los de la cuenta (cuando aún
 * no tocas). La energía mínima de los clics oídos en la cuenta sirve de referencia: un
 * onset que coincide con un clic solo cuenta como golpe si es claramente más fuerte.
 */
export function classifyStrums(onsets, clicks, countIn, lat) {
  const nearAny = (t, arr) => arr.some((c) => Math.abs(t - c - lat) < 0.04);
  const heard = onsets.filter((o) => nearAny(o.time, countIn)).map((o) => o.energy);
  const clickE = heard.length ? Math.min(...heard) : 0;
  const after = countIn.at(-1) + lat + 0.06;
  return {
    clickHeard: heard.length > 0,
    strums: onsets.filter((o) => o.time > after && (!nearAny(o.time, clicks) || o.energy > 2 * clickE)).map((o) => o.time),
  };
}

/**
 * Calibración tocando (pensada para auriculares): 4 clics de cuenta y 8 para rasguear.
 * Si el micrófono oye los clics de la cuenta, mide la latencia con ellos directamente.
 */
export async function calibrateByPlaying(onBeat) {
  await acquireMic();
  const onsets = [];
  const full = [];
  const off = onMicEvent((e) => {
    if (e.type !== 'onset') return;
    (e.band === 'strum' ? onsets : full).push(e);
  });
  try {
    const met = new Metronome({ bpm: 80, volume: 0.8, onTick: (b, t) => atAudioTime(t, () => onBeat?.(b)) });
    const start = met.start();
    const beat = 60 / 80;
    await sleep((start - now() + beat * 12 + 0.4) * 1000);
    met.stop();
    const clicks = Array.from({ length: 12 }, (_, b) => start + b * beat);
    const countOffsets = clicks.slice(0, 4)
      .map((t) => full.find((o) => o.time >= t && o.time <= t + 0.35)?.time - t)
      .filter((x) => !Number.isNaN(x));
    if (countOffsets.length >= 3) return median(countOffsets);
    const offsets = [];
    for (const t of clicks.slice(4)) {
      const near = onsets.filter((o) => Math.abs(o.time - t - 0.08) < 0.25);
      if (near.length) offsets.push(near.reduce((a, o) => (Math.abs(o.time - t) < Math.abs(a.time - t) ? o : a)).time - t);
    }
    return offsets.length >= 5 ? median(offsets) : null;
  } finally {
    off();
    releaseMic();
  }
}

/** Graba del micrófono (cápsula del tiempo). Devuelve {stop(), done: Promise<Blob>}. */
export async function startRecording() {
  const m = await acquireMic();
  const rec = new MediaRecorder(m.stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      releaseMic();
      resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    };
  });
  rec.start();
  return { stop: () => { if (rec.state !== 'inactive') rec.stop(); }, done };
}
