// Piezas comunes a todas las actividades.
import { h, metricText } from '../ui.js';
import { TYPE_LABEL } from '../curriculum.js';
import { state, bestFor, currentParam } from '../store.js';
import { MicError } from '../audio.js';

export function header(def, extra = null) {
  const param = currentParam(def);
  const best = def.metric ? bestFor(def, param) : null;
  return h('div', { class: 'act-head' },
    h('div', { class: 'act-type' }, TYPE_LABEL[def.type], param ? ` · ${param} BPM` : ''),
    h('h2', null, def.title),
    def.desc && h('p', { class: 'muted' }, def.desc),
    def.metric && h('div', { class: 'act-goal' },
      h('span', null, `🎯 Objetivo: ${def.metric.lower ? '≤ ' : ''}${metricText(def, def.metric.target)}`),
      best != null && h('span', null, `🏆 Tu récord: ${metricText(def, best)}`)),
    extra);
}

export function errorBox(err, onSkip) {
  const msg = err instanceof MicError ? err.message : `Algo falló: ${err.message || err}`;
  return h('div', { class: 'card error' },
    h('p', null, '🎙️ ', msg),
    h('p', { class: 'muted small' }, 'El micrófono necesita que la app esté abierta por https (o localhost) y que des permiso.'),
    onSkip && h('button', { class: 'btn', onclick: onSkip }, 'Saltar este bloque'));
}

/** Botones tras cada ronda: repetir o terminar. */
export function roundButtons(onAgain, onFinish, finishLabel = 'Guardar y seguir') {
  return h('div', { class: 'row gap' },
    h('button', { class: 'btn', onclick: onAgain }, '↻ Otra ronda'),
    h('button', { class: 'btn primary', onclick: onFinish }, finishLabel));
}

export const latency = () => state.settings.latency ?? 0.09;
export const vibrate = (ms) => navigator.vibrate?.(ms);

export function countdown(el, n = 3) {
  return new Promise((resolve) => {
    let i = n;
    el.textContent = i;
    el.classList.add('pulse');
    const iv = setInterval(() => {
      i--;
      if (i <= 0) { clearInterval(iv); el.textContent = '¡Ya!'; resolve(); return; }
      el.textContent = i;
    }, 800);
  });
}
