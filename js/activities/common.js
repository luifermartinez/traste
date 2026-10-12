// Piezas comunes a todas las actividades.
import { h, metricText } from '../ui.js';
import { icon, TYPE_ICON } from '../icons.js';
import { TYPE_LABEL } from '../curriculum.js';
import { state, bestFor, currentParam } from '../store.js';
import { MicError } from '../audio.js';

export function header(def, extra = null) {
  const param = currentParam(def);
  const best = def.metric ? bestFor(def, param) : null;
  return h('div', { class: 'act-head' },
    h('div', { class: 'eyebrow accent' }, icon(TYPE_ICON[def.type], { size: 14 }), TYPE_LABEL[def.type], param ? ` · ${param} BPM` : ''),
    h('h2', null, def.title),
    def.desc && h('p', { class: 'muted' }, def.desc),
    def.metric && h('div', { class: 'act-goal' },
      h('span', null, icon('target', { size: 16 }), `Objetivo ${def.metric.lower ? '≤ ' : ''}${metricText(def, def.metric.target)}`),
      best != null && h('span', null, icon('trophy', { size: 16 }), `Récord ${metricText(def, best)}`)),
    extra);
}

export function errorBox(err, onSkip) {
  const msg = err instanceof MicError ? err.message : `Algo falló: ${err.message || err}`;
  return h('div', { class: 'card error' },
    h('div', { class: 'row' }, icon('mic', { size: 18 }), h('strong', null, 'Sin micrófono')),
    h('p', null, msg),
    h('p', { class: 'muted small' }, 'El micrófono necesita que la app esté abierta por https (o localhost) y que des permiso.'),
    onSkip && h('button', { class: 'btn', onclick: onSkip }, 'Saltar este bloque'));
}

/** Botón principal grande con icono de "play". */
export const startButton = (label, onclick) => h('button', { class: 'btn primary big', onclick }, icon('play', { size: 18 }), label);

/** Botones tras cada ronda: repetir o terminar. */
export function roundButtons(onAgain, onFinish, finishLabel = 'Guardar y seguir') {
  return h('div', { class: 'btn-row' },
    h('button', { class: 'btn', onclick: onAgain }, icon('refresh', { size: 18 }), 'Otra ronda'),
    h('button', { class: 'btn primary', onclick: onFinish }, finishLabel));
}

/** Escribe una línea de feedback con icono. tone: '' | 'ok' | 'bad'. */
export function setFeedback(el, tone, text, iconName = tone === 'ok' ? 'check' : tone === 'bad' ? 'close' : null) {
  el.className = `feedback ${tone}`;
  el.replaceChildren(...(text ? [iconName && icon(iconName, { size: 18 }), text].filter(Boolean) : []));
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
      if (i <= 0) {
        clearInterval(iv);
        el.classList.remove('pulse');
        el.textContent = '¡Ya!';
        resolve();
        return;
      }
      el.textContent = i;
    }, 800);
  });
}
