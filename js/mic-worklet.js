// Detector de ataques (onsets) en el hilo de audio. Publica dos bandas:
//
// 'full':  la señal tal cual. Precisa para notas sueltas, y la que oye los clics del
//          metrónomo (se usa para medir la latencia altavoz→micrófono).
// 'strum': la misma señal con filtros "notch" en 2400 y 3200 Hz, las frecuencias del clic
//          del metrónomo. El clic pierde ~35 dB y tu rasgueo casi nada, así que domina tu
//          golpe aunque coincidan (ver classifyStrums en audio.js).
//
// Un onset es un salto en la energía de la derivada (resalta el golpe de púa) frente a la
// media reciente y al ruido de fondo. Se publica ~21 ms después con la energía máxima de
// esa ventana. Los tiempos están en el reloj de AudioContext.currentTime.
const PEAK_BLOCKS = 8;

function notch(f0, q) {
  const w = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: 1 / a0, b1: (-2 * c) / a0, b2: 1 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function biquad(q, x) {
  const y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
  q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y;
  return y;
}

// refractory: segundos mínimos entre onsets. En 'strum' es corto para que un clic justo
// antes de tu golpe no lo tape.
class Band {
  constructor(name, refractory) {
    this.name = name;
    this.refractory = refractory;
    this.prev = 0;
    this.avg = 0;
    this.floor = 0;
    this.last = -1;
    this.pending = null;
    this.e = 0;
    this.first = -1;
    this.loud = 0;
  }

  begin() { this.e = 0; this.first = -1; this.loud = Math.sqrt(this.avg * 4); }

  sample(x, i) {
    const d = x - this.prev;
    this.prev = x;
    this.e += d * d;
    if (this.first < 0 && Math.abs(d) > this.loud) this.first = i;
  }

  end(n, now, warm, sens, post) {
    const e = this.e / n;
    if (this.pending) {
      const p = this.pending;
      p.energy = Math.max(p.energy, e);
      if (--p.left <= 0) {
        post({ type: 'onset', band: this.name, time: p.time, energy: p.energy });
        this.pending = null;
      }
    }
    if (warm) {
      this.avg = this.avg * 0.88 + e * 0.12;
      this.floor = this.avg;
      return e;
    }
    if (!this.pending && e > 3e-6 / (sens * sens) && e > this.avg * (5 / sens) && e > (this.floor * 30) / sens && now - this.last > this.refractory) {
      this.last = now;
      this.pending = { time: now + Math.max(0, this.first) / sampleRate, energy: e, left: PEAK_BLOCKS };
    }
    // Media rápida (~25 ms) y suelo de ruido lento que solo aprende en silencio.
    this.avg = this.avg * 0.88 + e * 0.12;
    if (e < this.floor * 3) this.floor = this.floor * 0.995 + e * 0.005;
    else this.floor *= 1.0005;
    return e;
  }
}

class OnsetDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.full = new Band('full', 0.07);
    this.strum = new Band('strum', 0.03);
    this.notches = [notch(2400, 2), notch(3200, 2)];
    this.t0 = null;
    this.sens = 1;
    this.peak = 0;
    this.levelBlocks = 0;
    this.post = (m) => this.port.postMessage(m);
    this.port.onmessage = (e) => {
      if (e.data.sensitivity != null) this.sens = e.data.sensitivity;
    };
  }

  process(inputs, outputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const [n1, n2] = this.notches;
    this.full.begin();
    this.strum.begin();
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      this.full.sample(x, i);
      this.strum.sample(biquad(n2, biquad(n1, x)), i);
    }
    const now = currentTime;
    this.t0 ??= now;
    const warm = now - this.t0 < 0.3;
    const e = this.full.end(ch.length, now, warm, this.sens, this.post);
    this.strum.end(ch.length, now, warm, this.sens, this.post);

    this.peak = Math.max(this.peak, e);
    if (++this.levelBlocks >= 16) {
      this.post({ type: 'level', energy: this.peak });
      this.peak = 0;
      this.levelBlocks = 0;
    }
    const out = outputs[0] && outputs[0][0];
    if (out) out.fill(0);
    return true;
  }
}

registerProcessor('onset-detector', OnsetDetector);
