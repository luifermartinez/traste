// Teoría: preguntas rápidas de opción múltiple con explicación inmediata.
import { h, steps } from '../ui.js';
import { icon } from '../icons.js';
import { makeQuiz } from '../theory.js';
import { header } from './common.js';

export function mount(root, { def, onDone }) {
  const qs = makeQuiz(def.config.deck, 8);
  let i = 0;
  let correct = 0;
  const box = h('div', { class: 'stage quiz' });
  root.append(header(def), box);

  function show() {
    const q = qs[i];
    const explain = h('div', { class: 'feedback' });
    const last = i === qs.length - 1;
    const nextBtn = h('button', {
      class: 'btn primary block',
      style: { visibility: 'hidden' },
      onclick: () => { i++; if (i < qs.length) show(); else end(); },
    }, last ? 'Ver resultado' : 'Siguiente', icon('arrowRight', { size: 18 }));
    const opts = q.options.map((o, k) => h('button', {
      class: 'btn option',
      onclick: () => {
        if (nextBtn.style.visibility === 'visible') return;
        const ok = k === q.answer;
        if (ok) correct++;
        opts[k].classList.add(ok ? 'ok' : 'bad');
        opts[q.answer].classList.add('ok');
        explain.className = `feedback ${ok ? 'ok' : 'bad'}`;
        explain.replaceChildren(icon(ok ? 'check' : 'close', { size: 18 }), h('span', null, h('b', null, ok ? 'Correcto. ' : 'No exactamente. '), q.explain));
        nextBtn.style.visibility = 'visible';
      },
    }, o));
    box.replaceChildren(
      h('div', { class: 'quiz-progress' }, steps(i + 1, qs.length), h('span', { class: 'muted small num' }, `${i + 1} de ${qs.length}`)),
      h('div', { class: 'prompt' }, q.q),
      h('div', { class: 'options' }, opts),
      explain,
      nextBtn);
  }

  function end() {
    const value = Math.round((correct / qs.length) * 100);
    box.replaceChildren(
      h('h3', null, 'Resultado'),
      h('div', { class: 'res-value' }, h('b', null, `${value}%`), h('span', null, 'correctas')),
      h('p', { class: 'muted' }, value >= def.metric.target ? 'Lo tienes. La próxima vez saldrán otras preguntas.' : 'Las preguntas cambian cada vez: repítelo en otra sesión.'),
      h('button', { class: 'btn primary big', onclick: () => onDone({ value }) }, 'Guardar y seguir'));
  }

  show();
  return () => {};
}
