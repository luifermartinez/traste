// Generador de la sesión del día. Cada bloque tiene un rol; la habilidad concreta se
// resuelve justo antes de empezarlo, así una lección completada en la misma sesión
// desbloquea su práctica inmediatamente.
import { SKILLS, SKILL_BY_ID, CATEGORY } from './curriculum.js';
import { state, isPassed, isAvailable, progress, reqsMet } from './store.js';

export const ROLE_LABEL = {
  lesson: 'Aprende', tuner: 'Afina', focus: 'Foco', focus2: 'Foco 2', review: 'Repaso', mind: 'Mente', music: 'Música',
};
export const ROLE_HINT = {
  lesson: 'Algo nuevo, a tu ritmo.',
  tuner: 'Una guitarra desafinada hace que todo suene mal, aunque lo hagas bien.',
  focus: 'Lo que más te acerca al siguiente paso.',
  focus2: 'Otra habilidad en construcción.',
  review: 'Mantener lo aprendido cuesta poco si lo repasas.',
  mind: 'Entender lo que tocas acelera todo lo demás.',
  music: 'Siempre terminas tocando música.',
};

// Plan de roles y segundos orientativos según los minutos disponibles.
// Condicionales: 'lesson?' solo si no hay técnica pendiente disponible; 'flex' (sesiones
// de 10 min) solo si hoy no hubo lección, y alterna Mente y Repaso (state.lastFlex).
export function planRoles(minutes) {
  const plans = {
    5: [['lesson?', 180], ['tuner', 45], ['focus', 180], ['music', 90]],
    10: [['lesson', 180], ['lesson?', 180], ['tuner', 60], ['focus', 240], ['flex', 120], ['music', 180]],
    15: [['lesson', 180], ['lesson?', 180], ['tuner', 60], ['focus', 300], ['review', 150], ['mind', 120], ['music', 240]],
    20: [['lesson', 180], ['lesson?', 180], ['tuner', 60], ['focus', 300], ['focus2', 240], ['review', 150], ['mind', 150], ['music', 300]],
  };
  return plans[minutes] || plans[10];
}

const lastAt = (d) => state.skills[d.id]?.lastAt || 0;
const stale = (a, b) => lastAt(a) - lastAt(b) || a.order - b.order;
const notMastered = (d) => !isPassed(d) || (d.ladder && !state.skills[d.id]?.mastered);

export function currentStage() {
  for (let n = 1; n <= state.unlockedStage; n++) {
    if (SKILLS.some((s) => s.stage === n && s.core !== false && !isPassed(s))) return n;
  }
  return state.unlockedStage;
}

const pendingLessons = () => SKILLS.filter((d) => d.type === 'lesson' && d.stage <= state.unlockedStage && !isPassed(d));

/** Elige de `cat`: primero no superadas de la etapa actual, luego sin dominar, luego la más olvidada. */
function choose(cat, used, { preferPassed = false, avoidType = null } = {}) {
  const stage = currentStage();
  const pool = SKILLS.filter((d) => CATEGORY[d.type] === cat && isAvailable(d) && !used.has(d.id));
  if (!pool.length) return null;
  const typed = avoidType ? pool.filter((d) => d.type !== avoidType) : pool;
  const base = typed.length ? typed : pool;
  if (preferPassed) {
    const passed = base.filter(isPassed).sort(stale);
    if (passed.length) return passed[0];
  }
  const tiers = [
    base.filter((d) => !isPassed(d) && d.stage === stage),
    base.filter((d) => !isPassed(d)),
    base.filter(notMastered),
  ];
  for (const t of tiers) if (t.length) return t.sort(stale)[0];
  return base.slice().sort((a, b) => progress(a) - progress(b) || stale(a, b))[0];
}

/** Resuelve un rol a {role, def}. Devuelve null si el bloque no aplica hoy. */
export function resolveRole(role, used, prev = []) {
  const focusType = prev.find((b) => b.role === 'focus')?.def.type;
  const as = (r, def) => (def ? { role: r, def } : null);
  switch (role) {
    case 'lesson':
    case 'lesson?': {
      if (role === 'lesson?' && SKILLS.some((d) => CATEGORY[d.type] === 'tecnica' && isAvailable(d) && !isPassed(d))) return null;
      return as('lesson', pendingLessons().find((d) => !used.has(d.id)));
    }
    case 'tuner': {
      const d = SKILL_BY_ID.afinar;
      return as('tuner', reqsMet(d) ? d : null);
    }
    case 'focus': return as('focus', choose('tecnica', used));
    case 'focus2': return as('focus2', choose('tecnica', used, { avoidType: focusType }));
    case 'review': return as('review', choose('tecnica', used, { preferPassed: true, avoidType: focusType }));
    case 'mind': return as('mind', choose('mente', used));
    case 'music': return as('music', choose('musica', used));
    case 'flex': {
      if (prev.some((b) => b.role === 'lesson')) return null;
      const order = state.lastFlex === 'mind' ? ['review', 'mind'] : ['mind', 'review'];
      for (const r of order) {
        const res = resolveRole(r, used, prev);
        if (res) return res;
      }
      return null;
    }
    default: return null;
  }
}

/** Vista previa (con el estado actual) de la sesión para mostrar en "Hoy". */
export function previewSession(minutes) {
  const used = new Set();
  const out = [];
  for (const [role, sec] of planRoles(minutes)) {
    const res = resolveRole(role, used, out);
    if (!res) continue;
    used.add(res.def.id);
    out.push({ ...res, sec });
  }
  return out;
}
