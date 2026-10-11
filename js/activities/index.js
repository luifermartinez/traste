// Monta una actividad, guarda su resultado y muestra qué significó.
import { h, metricText } from '../ui.js';
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
  const lines = [];
  const { def } = s;
  const unit = def.metric?.unit;
  if (s.lesson) {
    lines.push(h('div', { class: 'res-big' }, '📘 Lección completada'));
    const unlocked = SKILLS.filter((d) => d.req?.includes(def.id));
    if (unlocked.length) lines.push(h('p', null, 'Desbloquea: ', unlocked.map((d) => d.title).join(' · ')));
  } else {
    lines.push(h('div', { class: 'res-big' }, metricText(def, s.value)));
    if (s.prevBest == null) lines.push(h('p', null, '📍 Primera marca: ya tienes un punto de partida para medir tu progreso.'));
    else if (s.isPR) {
      const d = Math.round(Math.abs(s.value - s.prevBest) * 10) / 10;
      lines.push(h('p', { class: 'pr' }, `🏆 ¡Nuevo récord! Antes ${metricText(def, s.prevBest)} (${def.metric.lower ? '−' : '+'}${d})`));
    } else lines.push(h('p', { class: 'muted' }, `Tu récord${s.param ? ` a ${s.param} BPM` : ''}: ${metricText(def, s.prevBest)}. Los días flojos también construyen.`));
    if (s.met) lines.push(h('p', null, '🎯 Objetivo cumplido'));
    if (s.passedNow) lines.push(h('p', { class: 'pr' }, '✅ Habilidad superada'));
    if (s.stepUp) lines.push(h('p', null, `⏫ Siguiente reto: ${s.newParam} BPM`));
  }
  if (s.stageUp) lines.push(h('p', { class: 'pr' }, '🚀 ¡Nueva etapa desbloqueada!'));
  for (const b of s.badges || []) lines.push(h('p', { class: 'badge-new' }, `${b.icon} Insignia: ${b.name}`));
  if (s.xp) lines.push(h('div', { class: 'xp-pop' }, `+${s.xp} XP`));
  return h('div', { class: 'card result' }, h('div', { class: 'act-type' }, def.title), lines,
    h('button', { class: 'btn primary big', onclick: onContinue }, 'Continuar →'));
}
