// Monta una actividad, guarda su resultado y muestra qué significó.
import { h, metricText, metricParts, status } from '../ui.js';
import { icon } from '../icons.js';
import { SKILLS } from '../curriculum.js';
import { recordResult, completeLesson, checkBadges } from '../store.js';
import * as lesson from './lesson.js';
import * as tuner from './tuner.js';
import * as notes from './notes.js';
import * as changes from './changes.js';
import * as rhythm from './rhythm.js';
import * as melody from './melody.js';
import * as ear from './ear.js';
import * as quiz from './quiz.js';
import * as playalong from './playalong.js';

const MODULES = { lesson, tuner, notes, changes, rhythm, melody, ear, theory: quiz, playalong };

/**
 * Ejecuta la habilidad `def` dentro de `container`. Al terminar llama a
 * onFinish(summary). Devuelve una función de limpieza.
 */
export function runSkill(container, def, { budgetSec = 180, onFinish }) {
  container.replaceChildren();
  let cleanup = null;
  cleanup = MODULES[def.type].mount(container, {
    def,
    budgetSec,
    onDone: (res) => {
      cleanup?.();
      cleanup = null;
      let summary;
      if (res.skipped) {
        onFinish({ def, skipped: true });
        return;
      }
      if (res.lesson) summary = { def, lesson: true, ...completeLesson(def) };
      else summary = { def, ...recordResult(def, res.value, res.extra) };
      summary.badges = checkBadges();
      container.replaceChildren(resultCard(summary, () => onFinish(summary)));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
  return () => cleanup?.();
}

export function resultCard(s, onContinue) {
  const { def } = s;
  const lines = [];
  let hero;
  if (s.lesson) {
    hero = h('div', { class: 'res-title' }, 'Lección completada');
    const unlocked = SKILLS.filter((d) => d.req?.includes(def.id));
    if (unlocked.length) lines.push(status('arrowRight', `Desbloquea: ${unlocked.map((d) => d.title).join(' · ')}`, 'accent'));
  } else {
    const [value, unit] = metricParts(def, s.value);
    hero = h('div', { class: 'res-value' }, h('b', null, value), h('span', null, unit));
    if (s.prevBest == null) lines.push(status('info', 'Primera marca: ya tienes un punto de partida para medir tu progreso.', 'muted'));
    else if (s.isPR) {
      const d = Math.round(Math.abs(s.value - s.prevBest) * 10) / 10;
      lines.push(status('trophy', `Nuevo récord. Antes ${metricText(def, s.prevBest)} (${def.metric.lower ? '−' : '+'}${d})`, 'accent'));
    } else lines.push(status('trophy', `Tu récord${s.param ? ` a ${s.param} BPM` : ''}: ${metricText(def, s.prevBest)}. Los días flojos también construyen.`, 'muted'));
    if (s.met) lines.push(status('target', 'Objetivo cumplido', 'ok'));
    if (s.passedNow) lines.push(status('check', 'Habilidad superada', 'ok'));
    if (s.stepUp) lines.push(status('arrowUp', `Siguiente reto: ${s.newParam} BPM`, 'accent'));
  }
  if (s.stageUp) lines.push(status('route', 'Nueva etapa desbloqueada', 'ok'));
  for (const b of s.badges || []) lines.push(status(b.icon, `Insignia: ${b.name}`, 'accent'));
  return h('div', { class: 'card result' },
    h('h2', null, def.title),
    hero,
    lines,
    s.xp ? h('div', { class: 'xp' }, icon('sparkle', { size: 16 }), `+${s.xp} XP`) : null,
    h('button', { class: 'btn primary big', onclick: onContinue }, 'Continuar', icon('arrowRight', { size: 18 })));
}
