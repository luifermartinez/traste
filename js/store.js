// Estado persistente (localStorage): progreso por habilidad, XP, sesiones, rachas e insignias.
import { SKILLS, SKILL_BY_ID, STAGES } from './curriculum.js';

const KEY = 'traste.v1';
const DAY = 86400000;

const defaults = () => ({
  version: 1,
  createdAt: Date.now(),
  settings: { notation: 'both', weeklyGoal: 3, latency: null, autoCalibrationFailed: false, sensitivity: 1, clickVol: 0.5, backingVol: 0.6, minutes: 10 },
  xp: 0,
  prCount: 0,
  capsules: 0,
  lastCapsuleAt: null,
  lastFlex: null,
  unlockedStage: 1,
  skills: {},
  sessions: [],
  badges: {},
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
    }
  } catch { /* estado corrupto: empezar de cero */ }
  return defaults();
}

export let state = load();
export const save = () => localStorage.setItem(KEY, JSON.stringify(state));

export function replaceState(obj) {
  if (!obj || typeof obj !== 'object' || !obj.skills || !Array.isArray(obj.sessions)) throw new Error('El archivo no parece una copia de Traste.');
  const d = defaults();
  state = { ...d, ...obj, settings: { ...d.settings, ...obj.settings } };
  save();
}
export function resetState() {
  state = defaults();
  save();
}

// ─────────────── Habilidades ───────────────

const sk = (id) => (state.skills[id] ??= { history: [] });
export const skillState = (id) => state.skills[id] || { history: [] };

export const reqsMet = (def) => (def.req || []).every((r) => state.skills[r]?.done);
export const isPassed = (def) => (def.type === 'lesson' ? !!state.skills[def.id]?.done : !!state.skills[def.id]?.passed);
export const isAvailable = (def) => def.stage <= state.unlockedStage && reqsMet(def);

/** Parámetro actual (BPM) para habilidades con escalera de tempo. */
export function currentParam(def) {
  if (!def.ladder) return null;
  const step = state.skills[def.id]?.step || 0;
  return def.ladder[Math.min(step, def.ladder.length - 1)];
}

const better = (def, a, b) => b == null || (def.metric.lower ? a < b : a > b);

/** Mejor marca (opcionalmente solo con un parámetro concreto). */
export function bestFor(def, param) {
  let best = null;
  for (const h of skillState(def.id).history) {
    if (param != null && h.p !== param) continue;
    if (better(def, h.v, best)) best = h.v;
  }
  return best;
}

const ratio = (def, v) => (v == null ? 0 : Math.min(1, def.metric.lower ? def.metric.target / Math.max(v, 1e-9) : v / def.metric.target));

/** Progreso visual 0..1 hacia el dominio de la habilidad. */
export function progress(def) {
  if (def.type === 'lesson') return isPassed(def) ? 1 : 0;
  const st = skillState(def.id);
  if (def.ladder) {
    if (st.mastered) return 1;
    const step = st.step || 0;
    return (step + ratio(def, bestFor(def, def.ladder[step]))) / def.ladder.length;
  }
  return ratio(def, bestFor(def));
}

export const stageSkills = (n) => SKILLS.filter((s) => s.stage === n);

/** Fracción de habilidades principales superadas en una etapa. */
export function stageProgress(n) {
  const core = stageSkills(n).filter((s) => s.core !== false);
  return core.filter(isPassed).length / core.length;
}

function maybeUnlockStage() {
  const n = state.unlockedStage;
  if (n >= STAGES.length) return false;
  const lessonsDone = stageSkills(n).filter((s) => s.type === 'lesson').every(isPassed);
  if (lessonsDone && stageProgress(n) >= 0.8) {
    state.unlockedStage = n + 1;
    state.xp += 200;
    return true;
  }
  return false;
}

export function unlockStage(n) {
  state.unlockedStage = Math.max(state.unlockedStage, n);
  save();
}

/**
 * Guarda un resultado y devuelve qué significó: récord, objetivo, subida de tempo, XP…
 * `extra` se guarda en el historial (debe ser pequeño).
 */
export function recordResult(def, value, extra = {}) {
  const st = sk(def.id);
  const param = currentParam(def);
  const prevBest = bestFor(def, param);
  st.history.push({ t: Date.now(), v: value, p: param, ...extra });
  if (st.history.length > 300) st.history.splice(0, st.history.length - 300);
  st.lastAt = Date.now();

  const met = def.metric.lower ? value <= def.metric.target : value >= def.metric.target;
  const isPR = prevBest != null && better(def, value, prevBest);
  let passedNow = false;
  let stepUp = false;
  if (met && !st.passed) { st.passed = true; passedNow = true; }
  if (met && def.ladder) {
    if ((st.step || 0) < def.ladder.length - 1) { st.step = (st.step || 0) + 1; stepUp = true; } else st.mastered = true;
  }
  if (isPR) state.prCount++;
  const xp = 10 + (met ? 5 : 0) + (isPR ? 15 : 0) + (passedNow ? 50 : 0) + (stepUp ? 25 : 0);
  state.xp += xp;
  const stageUp = maybeUnlockStage();
  save();
  return { value, prevBest, isPR, met, passedNow, stepUp, newParam: stepUp ? currentParam(def) : null, param, xp, stageUp };
}

export function completeLesson(def) {
  const st = sk(def.id);
  const first = !st.done;
  st.done = true;
  st.lastAt = Date.now();
  const xp = first ? 20 : 0;
  state.xp += xp;
  const stageUp = maybeUnlockStage();
  save();
  return { xp, stageUp, first };
}

// ─────────────── Sesiones y rachas ───────────────

export function weekStart(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const prevWeek = (ws) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d.getTime(); };
const sessionsInWeek = (ws) => state.sessions.filter((s) => weekStart(s.t) === ws).length;

export const sessionsThisWeek = () => sessionsInWeek(weekStart());

/** Semanas seguidas cumpliendo el objetivo (la semana actual cuenta solo si ya se cumplió). */
export function streakWeeks() {
  const goal = state.settings.weeklyGoal;
  let ws = weekStart();
  let n = 0;
  if (sessionsInWeek(ws) >= goal) n++;
  ws = prevWeek(ws);
  while (sessionsInWeek(ws) >= goal) { n++; ws = prevWeek(ws); }
  return n;
}

export function logSession({ seconds, blocks, xp }) {
  state.sessions.push({ t: Date.now(), seconds, blocks, xp });
  let bonus = 20;
  const weekGoal = sessionsThisWeek() === state.settings.weeklyGoal;
  if (weekGoal) bonus += 50;
  state.xp += bonus;
  save();
  return { bonus, weekGoal };
}

export const totalMinutes = () => Math.round(state.sessions.reduce((a, s) => a + (s.seconds || 0), 0) / 60);
export const daysSinceLastSession = () => (state.sessions.length ? Math.floor((Date.now() - state.sessions.at(-1).t) / DAY) : null);

// ─────────────── Niveles ───────────────

const TITLES = ['Primeros trastes', 'Rasgueador/a', 'Acompañante', 'Juglar', 'Bluesero/a', 'Rockero/a', 'Trovador/a', 'Guitarrista de fogata', 'Músico de banda', 'Virtuoso/a en camino'];

/** Nivel n requiere 100·n·(n−1)/2 XP. */
export function levelInfo(xp = state.xp) {
  let level = 1;
  while (100 * (level * (level + 1)) / 2 <= xp) level++;
  const base = 100 * (level * (level - 1)) / 2;
  const next = 100 * (level * (level + 1)) / 2;
  return { level, title: TITLES[Math.min(level - 1, TITLES.length - 1)], into: xp - base, need: next - base };
}

// ─────────────── Insignias ───────────────

const maxOfType = (type) => Math.max(0, ...SKILLS.filter((s) => s.type === type).map((s) => bestFor(s) ?? 0));
const anyHistory = (type, pred) => SKILLS.some((s) => s.type === type && skillState(s.id).history.some(pred));

// `icon`: nombre de icono de icons.js.
export const BADGES = [
  { id: 'primera', icon: 'pick', name: 'Primera sesión', desc: 'Completaste tu primera sesión.', check: () => state.sessions.length >= 1 },
  { id: 'semana', icon: 'calendar', name: 'Semana cumplida', desc: 'Cumpliste tu objetivo semanal.', check: () => streakWeeks() >= 1 },
  { id: 'racha4', icon: 'flame', name: 'Un mes constante', desc: '4 semanas seguidas cumpliendo el objetivo.', check: () => streakWeeks() >= 4 },
  { id: 'racha12', icon: 'flame', name: 'Hábito de hierro', desc: '12 semanas seguidas.', check: () => streakWeeks() >= 12 },
  { id: 'horas5', icon: 'clock', name: '5 horas tocando', desc: '300 minutos de práctica acumulada.', check: () => totalMinutes() >= 300 },
  { id: 'records10', icon: 'trophy', name: 'Coleccionista de récords', desc: '10 récords personales.', check: () => state.prCount >= 10 },
  { id: 'cambios30', icon: 'swap', name: 'Manos rápidas', desc: '30 cambios de acorde en un minuto.', check: () => maxOfType('changes') >= 30 },
  { id: 'cambios60', icon: 'zap', name: 'Cambios relámpago', desc: '60 cambios en un minuto.', check: () => maxOfType('changes') >= 60 },
  { id: 'afinador', icon: 'fork', name: 'Oído de afinador', desc: 'Afinaste las 6 cuerdas en menos de 45 s.', check: () => { const b = bestFor(SKILL_BY_ID.afinar); return b != null && b <= 45; } },
  { id: 'oido90', icon: 'ear', name: 'Oído fino', desc: '90% o más en un reto de oído.', check: () => maxOfType('ear') >= 90 },
  { id: 'perfecta', icon: 'sparkle', name: 'Melodía perfecta', desc: 'Una melodía completa sin errores.', check: () => anyHistory('melody', (h) => h.mistakes === 0) },
  { id: 'metronomo', icon: 'metronome', name: 'Reloj humano', desc: '95% a tiempo en un reto de ritmo.', check: () => maxOfType('rhythm') >= 95 },
  { id: 'capsula', icon: 'tape', name: 'Cápsula del tiempo', desc: 'Grabaste tu primera cápsula.', check: () => state.capsules >= 1 },
  ...STAGES.map((st) => ({
    id: `etapa${st.n}`, icon: 'award', name: `Etapa ${st.n} superada`, desc: st.title,
    check: () => stageProgress(st.n) >= 0.8,
  })),
];

/** Revisa insignias y devuelve las recién ganadas. */
export function checkBadges() {
  const fresh = [];
  for (const b of BADGES) {
    if (!state.badges[b.id] && b.check()) {
      state.badges[b.id] = Date.now();
      state.xp += 30;
      fresh.push(b);
    }
  }
  if (fresh.length) save();
  return fresh;
}
