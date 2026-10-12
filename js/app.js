// Aplicación: rutas, vistas y el ejecutor de la sesión diaria.
import { h, progressBar, steps, status, sparkSvg, svgNode, chordCard, metricText, metricParts, toast } from './ui.js';
import { icon, TYPE_ICON } from './icons.js';
import { STAGES, SKILLS, SKILL_BY_ID, TYPE_LABEL } from './curriculum.js';
import {
  state, save, replaceState, resetState, levelInfo, sessionsThisWeek, streakWeeks, logSession, checkBadges, BADGES,
  progress, isPassed, isAvailable, stageProgress, stageSkills, currentParam, bestFor, skillState, unlockStage,
  totalMinutes, daysSinceLastSession, weekStart,
} from './store.js';
import { planRoles, resolveRole, previewSession, ROLE_LABEL, ROLE_HINT, currentStage } from './session.js';
import { runSkill } from './activities/index.js';
import * as tunerActivity from './activities/tuner.js';
import { setNotation, CHORDS, chordName } from './music.js';
import {
  Metronome, strum, calibrateLoopback, calibrateByPlaying, acquireMic, releaseMic, onMicEvent, setSensitivity,
  startRecording, atAudioTime, MicError, resumeAudio,
} from './audio.js';
import { addCapsule, listCapsules, deleteCapsule } from './capsules.js';

setNotation(state.settings.notation);
setSensitivity(state.settings.sensitivity);

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
let cleanup = null;
let session = null;

const TABS = [['hoy', 'home', 'Hoy'], ['ruta', 'route', 'Ruta'], ['progreso', 'chart', 'Progreso'], ['herramientas', 'grid', 'Herramientas']];
const go = (hash) => { location.hash = hash; };
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const MIN_SESSION_SEC = 120;
const topBar = (title, back, { settings = true } = {}) => h('header', { class: 'top' },
  back && h('a', { href: back, class: 'icon-btn', 'aria-label': 'Volver', style: { marginLeft: '-10px' } }, icon('back', { size: 22 })),
  title ? h('h1', null, title) : h('div', { class: 'brand', style: { flex: 1 } }, icon('pick', { size: 22 }), 'Traste'),
  settings && h('a', { href: '#/ajustes', class: 'icon-btn', 'aria-label': 'Ajustes', style: { marginRight: '-10px' } }, icon('sliders', { size: 21 })));

function render() {
  cleanup?.();
  cleanup = null;
  const [name = 'hoy', arg] = location.hash.replace(/^#\/?/, '').split('/');
  app.replaceChildren();
  window.scrollTo(0, 0);
  const view = VIEWS[name] || VIEWS.hoy;
  cleanup = view(app, arg ? decodeURIComponent(arg) : undefined) || null;
  tabsEl.hidden = name === 'sesion' || name === 'practicar';
  const active = name === 'tool' || name === 'ajustes' ? 'herramientas' : name;
  tabsEl.replaceChildren(...TABS.map(([id, ic, label]) => h('a', { href: `#/${id}`, class: id === active ? 'on' : '' }, icon(ic, { size: 22 }), label)));
}

// ─────────────── Hoy ───────────────

/** "6 → 10.5 aciertos/min" */
function changeText(def, a, b) {
  const [va] = metricParts(def, a);
  const [vb, unit] = metricParts(def, b);
  return `${va} → ${vb} ${unit}`;
}

function insights() {
  const ws = weekStart();
  const items = [];
  for (const d of SKILLS) {
    if (!d.metric) continue;
    const hist = skillState(d.id).history;
    if (!hist.length) continue;
    const before = hist.filter((x) => x.t < ws);
    const week = hist.filter((x) => x.t >= ws);
    if (!before.length || !week.length) continue;
    if (d.ladder) {
      const maxBefore = Math.max(...before.map((x) => x.p));
      const maxNow = Math.max(...week.map((x) => x.p));
      if (maxNow > maxBefore) items.push({ gain: 1, title: d.title, change: `${maxBefore} → ${maxNow} BPM` });
      continue;
    }
    const best = (xs) => xs.reduce((a, x) => (d.metric.lower ? Math.min(a, x.v) : Math.max(a, x.v)), d.metric.lower ? Infinity : -Infinity);
    const b0 = best(before);
    const b1 = best(week);
    const gain = d.metric.lower ? (b0 - b1) / b0 : (b1 - b0) / Math.max(1, b0);
    if (gain > 0) items.push({ gain, title: d.title, change: changeText(d, b0, b1) });
  }
  let title = 'Esta semana mejoraste';
  if (!items.length) {
    title = 'Desde tu primer intento';
    for (const d of SKILLS) {
      const hist = skillState(d.id).history;
      if (!d.metric || hist.length < 2 || d.ladder) continue;
      const first = hist[0].v;
      const best = bestFor(d);
      const gain = d.metric.lower ? (first - best) / first : (best - first) / Math.max(1, first);
      if (gain > 0) items.push({ gain, title: d.title, change: changeText(d, first, best) });
    }
  }
  items.sort((a, b) => b.gain - a.gain);

  const tips = [];
  const lastRhythm = SKILLS.filter((d) => d.type === 'rhythm').flatMap((d) => skillState(d.id).history).sort((a, b) => b.t - a.t)[0];
  if (lastRhythm?.bias != null && Math.abs(lastRhythm.bias) >= 25) {
    tips.push(['metronome', lastRhythm.bias < 0
      ? `En tu último reto de ritmo ibas ${-lastRhythm.bias} ms adelantado. Hoy: escucha el clic y deja que suene antes de golpear.`
      : `En tu último reto de ritmo ibas ${lastRhythm.bias} ms atrasado. Hoy: prepara el movimiento antes del clic.`]);
  }
  const stuck = SKILLS.find((d) => {
    const hist = skillState(d.id).history;
    if (!d.metric || isPassed(d) || hist.length < 4) return false;
    const last = hist.slice(-3);
    const prev = hist.slice(0, -3);
    const bestPrev = prev.reduce((a, x) => Math.max(a, x.v), -Infinity);
    return !d.metric.lower && last.every((x) => x.v <= bestPrev);
  });
  if (stuck) tips.push(['info', `"${stuck.title}" lleva 3 intentos sin récord. Es normal: haz la versión lenta y limpia, y revisa la lección. El cerebro consolida entre sesiones.`]);

  if (!items.length && !tips.length) return null;
  return h('div', { class: 'card' },
    items.length > 0 && h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, title),
    items.slice(0, 3).map((x) => h('div', { class: 'gain' }, h('span', null, x.title), h('b', null, x.change))),
    tips.length > 0 && items.length > 0 && h('div', { class: 'divider' }),
    tips.map(([ic, t]) => h('div', { class: 'insight' }, icon(ic, { size: 18 }), h('span', { class: 'small' }, t))));
}

function viewToday(root) {
  const lv = levelInfo();
  const goal = state.settings.weeklyGoal;
  const done = sessionsThisWeek();
  const streak = streakWeeks();
  const since = daysSinceLastSession();
  const hour = new Date().getHours();
  let greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  if (since == null) greeting = 'Bienvenido';
  else if (since >= 7) greeting = 'Qué bueno verte de vuelta';
  const weekMsg = since == null ? 'Tu primera sesión te espera. Empieza por lo básico, sin prisa.'
    : done >= goal ? 'Objetivo semanal cumplido. Lo que sumes ahora es extra.'
      : since >= 7 ? 'Hoy basta con una sesión corta: lo importante es volver.'
        : `Te ${goal - done === 1 ? 'falta' : 'faltan'} ${plural(goal - done, 'sesión', 'sesiones')} para tu objetivo semanal.`;

  let minutes = state.settings.minutes;
  const options = [[5, 'exprés'], [10, ''], [15, ''], [20, '']];
  const planEl = h('ol', { class: 'plan' });
  const noteEl = h('div');
  const seg = h('div', { class: 'seg' }, options.map(([m, sub]) => h('button', {
    onclick: () => { minutes = m; state.settings.minutes = m; save(); paint(); },
  }, `${m} min`, sub && h('small', null, sub))));
  function paint() {
    [...seg.children].forEach((c, i) => c.classList.toggle('on', options[i][0] === minutes));
    const blocks = previewSession(minutes);
    planEl.replaceChildren(...blocks.map((b, i) => h('li', null,
      h('span', { class: 'n' }, i + 1),
      h('div', { class: 't' }, h('span', { class: 'eyebrow' }, ROLE_LABEL[b.role]), h('b', null, b.def.title)),
      icon(TYPE_ICON[b.def.type], { size: 18 }))));
    noteEl.replaceChildren(...(blocks.some((b) => b.role === 'lesson')
      ? [h('div', { class: 'note' }, icon('info', { size: 16 }), 'Después de cada lección, la sesión sigue con la práctica que esa lección desbloquea.')] : []));
  }
  paint();

  const stage = STAGES[currentStage() - 1];
  const sp = stageProgress(stage.n);
  const cap = state.lastCapsuleAt ? (Date.now() - state.lastCapsuleAt) / 86400000 : null;
  const capsuleDue = state.sessions.length >= 2 && (cap == null || cap > 28);

  root.append(...[
    topBar(),
    h('div', { style: { margin: '8px 0 18px' } }, h('h1', null, greeting), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, weekMsg)),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Esta semana'),
      h('div', { class: 'week-big num' }, `${done}`, h('small', null, `de ${goal} sesiones`)),
      h('div', { style: { marginTop: '14px' } }, steps(done, goal)),
      h('div', { class: 'meta-row' },
        h('span', { class: `row ${streak ? 'streak-on' : ''}` }, icon('flame', { size: 16 }), streak ? `${plural(streak, 'semana')} de racha` : 'Sin racha aún'),
        h('span', { class: 'num' }, `Nivel ${lv.level} · ${lv.into}/${lv.need} XP`))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', { style: { margin: 0 } }, 'Sesión de hoy'), h('span', { class: 'muted small' }, lv.title)),
      seg,
      planEl,
      noteEl,
      h('button', { class: 'btn primary big', onclick: () => startSession(minutes) }, icon('play', { size: 18 }), 'Empezar sesión')),
    insights(),
    capsuleDue && h('a', { class: 'card tool', href: '#/tool/capsula' },
      h('span', { class: 'tool-icon' }, icon('tape', { size: 22 })),
      h('div', { class: 'body' }, h('strong', null, 'Graba tu cápsula del tiempo'),
        h('p', { class: 'muted small' }, '30 segundos tocando lo que sepas. En un mes oirás la diferencia que no notas día a día.')),
      icon('chevron', { size: 18 })),
    h('a', { class: 'card', href: '#/ruta' },
      h('div', { class: 'card-head', style: { marginBottom: '4px' } }, h('span', { class: 'eyebrow' }, `Etapa ${stage.n} de ${STAGES.length}`), h('span', { class: 'muted small num' }, `${Math.round(sp * 100)}%`)),
      h('h3', null, stage.title),
      h('p', { class: 'muted small', style: { margin: '0 0 14px' } }, stage.goal),
      progressBar(sp)),
  ].filter(Boolean));
}

// ─────────────── Sesión ───────────────

function startSession(minutes) {
  session = { minutes, roles: planRoles(minutes), idx: 0, blocks: [], used: new Set(), t0: Date.now(), xp: 0 };
  go('#/sesion');
}

function viewSession(root) {
  if (!session) { go('#/hoy'); return null; }
  let stopAct = null;
  const timeEl = h('span', { class: 'clock' });
  const blockEl = h('span', { class: 'eyebrow' });
  const bar = progressBar(0, 'thin');
  const body = h('div', { class: 'session-body' });
  const quitBtn = h('button', { class: 'icon-btn', 'aria-label': 'Terminar sesión', onclick: quit }, icon('close', { size: 22 }));
  root.append(h('div', { class: 'session-top' },
    h('div', { class: 'row between' }, quitBtn, blockEl, timeEl), bar), body);
  const tick = () => { timeEl.replaceChildren(icon('clock', { size: 16 }), mmss(Math.floor((Date.now() - session.t0) / 1000))); };
  tick();
  const timer = setInterval(tick, 1000);

  function nextBlock() {
    stopAct?.();
    stopAct = null;
    while (session.idx < session.roles.length) {
      const [role, sec] = session.roles[session.idx];
      const res = resolveRole(role, session.used, session.blocks);
      if (!res) { session.idx++; continue; }
      const { def, role: r } = res;
      session.used.add(def.id);
      if (role === 'flex') { state.lastFlex = r; save(); }
      blockEl.textContent = `Bloque ${session.blocks.length + 1}`;
      bar.firstChild.style.width = `${Math.round((session.idx / session.roles.length) * 100)}%`;
      const holder = h('div');
      body.replaceChildren(
        h('div', { class: 'block-intro' }, h('span', { class: 'eyebrow accent' }, `${ROLE_LABEL[r]} · ~${Math.round(sec / 60)} min`), h('span', { class: 'muted small' }, ROLE_HINT[r])),
        holder);
      window.scrollTo(0, 0);
      stopAct = runSkill(holder, def, {
        budgetSec: sec,
        onFinish: (summary) => {
          session.blocks.push({ role: r, def, summary });
          session.xp += summary.xp || 0;
          session.idx++;
          nextBlock();
        },
      });
      return;
    }
    finish();
  }

  function finish() {
    clearInterval(timer);
    stopAct?.();
    stopAct = null;
    const s = session;
    session = null;
    const seconds = Math.round((Date.now() - s.t0) / 1000);
    const done = s.blocks.filter((b) => !b.summary.skipped);
    if (!done.length) { go('#/hoy'); return; }
    // Para la racha cuenta una sesión completa o de al menos 2 minutos (la exprés también).
    const counts = seconds >= MIN_SESSION_SEC || s.idx >= s.roles.length;
    const r = counts ? logSession({ seconds, blocks: done.map((b) => ({ id: b.def.id, v: b.summary.value ?? null })), xp: s.xp }) : { bonus: 0, weekGoal: false };
    const badges = checkBadges();
    const goal = state.settings.weeklyGoal;
    const next = previewSession(state.settings.minutes).find((b) => b.role === 'focus' || b.role === 'lesson');
    quitBtn.style.visibility = 'hidden';
    bar.firstChild.style.width = '100%';
    blockEl.textContent = '';
    const weekDone = sessionsThisWeek();
    body.replaceChildren(h('div', { class: 'card result' },
      h('div', { class: 'eyebrow' }, `${mmss(seconds)} de práctica · ${plural(done.length, 'bloque')}`),
      h('div', { class: 'res-title' }, counts ? 'Sesión completada' : 'Sesión corta'),
      counts
        ? h('div', { style: { margin: '14px 0 4px' } },
          h('div', { class: 'row between small', style: { marginBottom: '8px' } },
            h('span', null, r.weekGoal ? 'Objetivo semanal cumplido' : 'Esta semana'),
            h('span', { class: 'muted num' }, `${weekDone} de ${goal}`)),
          steps(weekDone, goal))
        : h('p', { class: 'muted' }, 'Lo que practicaste quedó guardado, pero para contar en tu semana la sesión debe durar al menos 2 minutos.'),
      h('ul', { class: 'summary' }, done.map((b) => h('li', null,
        h('span', null, b.def.title),
        h('span', null,
          b.summary.lesson ? 'lección' : metricText(b.def, b.summary.value),
          b.summary.isPR && icon('trophy', { size: 16, cls: 'pr-ic' }),
          b.summary.passedNow && icon('check', { size: 16, cls: 'ok-ic' }))))),
      badges.map((b) => status(b.icon, `Insignia: ${b.name}`, 'accent')),
      h('div', { class: 'xp' }, icon('sparkle', { size: 16 }), `+${s.xp + r.bonus} XP`),
      next && h('p', { class: 'muted small' }, `Próxima sesión: ${next.def.title}`),
      h('button', { class: 'btn primary big', onclick: () => go('#/hoy') }, 'Volver al inicio')));
  }

  function quit() {
    const any = session.blocks.some((b) => !b.summary.skipped);
    if (!confirm(any ? '¿Terminar la sesión ahora? Lo que ya hiciste queda guardado.' : '¿Salir de la sesión?')) return;
    finish();
  }

  nextBlock();
  return () => {
    clearInterval(timer);
    stopAct?.();
  };
}

// ─────────────── Práctica libre ───────────────

function viewPractice(root, id) {
  const def = SKILL_BY_ID[id];
  if (!def) { go('#/ruta'); return null; }
  root.append(h('div', { class: 'session-top' }, h('a', { class: 'btn small ghost', href: '#/ruta', style: { paddingLeft: '4px' } }, icon('back', { size: 18 }), 'Ruta')));
  if (!isAvailable(def)) {
    const req = (def.req || []).map((r) => SKILL_BY_ID[r]);
    root.append(h('div', { class: 'card' }, h('div', { class: 'row muted' }, icon('lock', { size: 18 }), 'Bloqueada'), h('h2', null, def.title), h('p', null, 'Primero completa:'),
      h('ul', null, req.map((r) => h('li', null, h('a', { href: `#/practicar/${r.id}`, style: { color: 'var(--accent)' } }, r.title))))));
    return null;
  }
  const holder = h('div');
  root.append(holder);
  return runSkill(holder, def, { budgetSec: 120, onFinish: () => go('#/ruta') });
}

// ─────────────── Ruta ───────────────

function skillRow(d) {
  const avail = isAvailable(d);
  const st = skillState(d.id);
  const passed = isPassed(d);
  let meta = '';
  if (!avail) meta = `Requiere: ${(d.req || []).map((r) => SKILL_BY_ID[r].title).join(', ') || 'abrir la etapa'}`;
  else if (d.type === 'lesson') meta = passed ? 'Lección hecha' : 'Lección nueva';
  else {
    const best = bestFor(d, currentParam(d));
    meta = [TYPE_LABEL[d.type], d.ladder && (st.mastered ? 'dominada' : `${currentParam(d)} BPM`), best != null ? `récord ${metricText(d, best)}` : 'sin intentos'].filter(Boolean).join(' · ');
  }
  return h(avail ? 'a' : 'div', { class: `skill ${avail ? '' : 'locked'} ${passed ? 'passed' : ''}`, href: avail ? `#/practicar/${d.id}` : null },
    h('span', { class: 'sk-icon' }, icon(!avail ? 'lock' : passed ? 'check' : TYPE_ICON[d.type], { size: 18 })),
    h('div', { class: 'sk-body' },
      h('div', { class: 'sk-title' }, d.title),
      h('div', { class: 'sk-meta' }, meta),
      avail && d.type !== 'lesson' && !passed && progressBar(progress(d), 'thin')),
    avail && icon('chevron', { size: 16 }));
}

function viewPath(root) {
  root.append(topBar('Ruta'),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Cada habilidad tiene un objetivo medible. Al superar el 80% de una etapa y sus lecciones se abre la siguiente. Toca una habilidad para practicarla cuando quieras.'));
  const cur = currentStage();
  for (const st of STAGES) {
    const unlocked = st.n <= state.unlockedStage;
    const p = stageProgress(st.n);
    const card = h('details', { class: `stage-card ${unlocked ? '' : 'locked'}`, open: st.n === cur },
      h('summary', null,
        h('div', { class: 'card-head', style: { marginBottom: '2px' } },
          h('span', { class: `eyebrow ${st.n === cur ? 'accent' : ''}` }, `Etapa ${st.n}`),
          h('span', { class: 'muted small num' }, unlocked ? `${Math.round(p * 100)}%` : icon('lock', { size: 16 }))),
        h('h3', { style: { margin: '2px 0 4px', fontSize: '1.08rem' } }, st.title),
        h('p', { class: 'muted small', style: { margin: 0 } }, st.goal),
        unlocked && progressBar(p)));
    if (unlocked) card.append(h('div', { class: 'skills' }, stageSkills(st.n).map(skillRow)));
    else {
      card.append(h('button', {
        class: 'btn small unlock',
        onclick: () => {
          if (confirm(`¿Ya dominas lo anterior? Se abrirán las etapas hasta la ${st.n}.`)) { unlockStage(st.n); render(); }
        },
      }, 'Ya sé esto: abrir etapa'));
    }
    root.append(card);
  }
}

// ─────────────── Progreso ───────────────

function weeksChart() {
  const goal = state.settings.weeklyGoal;
  const weeks = [];
  let ws = weekStart();
  for (let i = 0; i < 8; i++) {
    const n = state.sessions.filter((s) => weekStart(s.t) === ws).length;
    weeks.unshift({ ws, n });
    const d = new Date(ws);
    d.setDate(d.getDate() - 7);
    ws = d.getTime();
  }
  const max = Math.max(goal, ...weeks.map((w) => w.n));
  return h('div', { class: 'weeks' }, weeks.map((w) => h('div', { class: `wk ${w.n >= goal ? 'ok' : ''}` },
    h('div', { class: 'wk-bar', style: { height: `${(w.n / max) * 100}%` } }),
    h('small', null, new Date(w.ws).toLocaleDateString('es', { day: 'numeric', month: 'short' })))));
}

function viewProgress(root) {
  const lv = levelInfo();
  root.append(topBar('Progreso'),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, state.sessions.length), h('small', null, 'sesiones')),
      h('div', { class: 'stat' }, h('b', null, totalMinutes()), h('small', null, 'minutos')),
      h('div', { class: 'stat' }, h('b', null, state.prCount), h('small', null, 'récords')),
      h('div', { class: 'stat' }, h('b', null, lv.level), h('small', null, 'nivel'))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', { style: { margin: 0 } }, 'Sesiones por semana'), h('span', { class: 'muted small' }, `objetivo ${state.settings.weeklyGoal}`)),
      weeksChart()),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', { style: { margin: 0 } }, 'Insignias'), h('span', { class: 'muted small num' }, `${Object.keys(state.badges).length} de ${BADGES.length}`)),
      h('div', { class: 'badges' }, BADGES.map((b) => h('div', { class: `badge ${state.badges[b.id] ? 'on' : ''}`, title: b.desc },
        h('span', { class: 'medal' }, icon(b.icon, { size: 22 })), h('small', null, b.name))))));

  const charts = SKILLS.filter((d) => d.metric && skillState(d.id).history.length);
  root.append(h('div', { class: 'eyebrow section-title' }, 'Evolución por habilidad'));
  if (!charts.length) root.append(h('p', { class: 'muted' }, 'Tus gráficas aparecerán cuando completes tu primera sesión.'));
  for (const d of charts) {
    const all = skillState(d.id).history;
    const best = bestFor(d);
    root.append(h('div', { class: 'card' },
      h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('strong', null, d.title), h('span', { class: 'muted small' }, plural(all.length, 'intento'))),
      svgNode(sparkSvg(all.slice(-24).map((x) => x.v), { target: d.metric.target, lower: d.metric.lower })),
      h('div', { class: 'row between small' },
        h('span', { class: 'muted' }, `Primera ${metricText(d, all[0].v)}`),
        h('span', null, `Mejor ${metricText(d, best)}${d.ladder ? ` · ${currentParam(d)} BPM` : ''}`))));
  }
}

// ─────────────── Herramientas ───────────────

const TOOLS = [
  ['afinador', 'fork', 'Afinador', 'Afinación estándar con notas de referencia.'],
  ['metronomo', 'metronome', 'Metrónomo', 'Tap tempo y acento en el primer pulso.'],
  ['acordes', 'fretboard', 'Acordes', 'Todos los acordes de la ruta, con sonido.'],
  ['capsula', 'tape', 'Cápsula del tiempo', 'Grábate y compárate con tu yo de hace un mes.'],
  ['calibrar', 'mic', 'Calibrar micrófono', 'Latencia y sensibilidad de detección.'],
];

const toolRow = (href, ic, name, desc) => h('a', { class: 'card tool', href },
  h('span', { class: 'tool-icon' }, icon(ic, { size: 22 })),
  h('div', { class: 'body' }, h('strong', null, name), h('p', { class: 'muted small' }, desc)),
  icon('chevron', { size: 18 }));

function viewTools(root) {
  root.append(topBar('Herramientas'),
    ...TOOLS.map(([id, ic, name, desc]) => toolRow(`#/tool/${id}`, ic, name, desc)),
    toolRow('#/ajustes', 'sliders', 'Ajustes', 'Notación, objetivo semanal, volumen, copia de seguridad.'));
}

function toolMetronome(root) {
  let bpm = 80;
  let beats = 4;
  const lights = h('div', { class: 'beats big' });
  const paintLights = () => lights.replaceChildren(...Array.from({ length: beats }, (_, i) => h('span', { class: i === 0 ? 'accent' : '' })));
  paintLights();
  const met = new Metronome({
    bpm,
    beatsPerBar: beats,
    volume: state.settings.clickVol,
    onTick: (b, t) => atAudioTime(t, () => [...lights.children].forEach((el, i) => el.classList.toggle('on', i === b % beats))),
  });
  const bpmEl = h('div', { class: 'metro-bpm' });
  const slider = h('input', { type: 'range', min: 30, max: 220, value: bpm, oninput: (e) => setBpm(+e.target.value) });
  function setBpm(v) {
    bpm = Math.max(30, Math.min(220, Math.round(v)));
    met.bpm = bpm;
    bpmEl.textContent = bpm;
    slider.value = bpm;
  }
  setBpm(bpm);
  const taps = [];
  const paintToggle = () => toggle.replaceChildren(icon(met.timer ? 'stop' : 'play', { size: 18 }), met.timer ? 'Parar' : 'Empezar');
  const toggle = h('button', { class: 'btn primary big', onclick: () => { if (met.timer) met.stop(); else met.start(); paintToggle(); } });
  paintToggle();
  const seg = h('div', { class: 'seg' }, [2, 3, 4, 6].map((n) => h('button', {
    class: n === beats ? 'on' : '',
    onclick: (e) => {
      beats = n;
      met.beatsPerBar = n;
      [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      paintLights();
    },
  }, `${n}/4`)));
  root.append(topBar('Metrónomo', '#/herramientas'), h('div', { class: 'card' },
    h('div', { class: 'eyebrow center', style: { display: 'block' } }, 'BPM'),
    bpmEl,
    lights,
    slider,
    h('div', { class: 'btn-row' }, [-5, -1, 1, 5].map((d) => h('button', { class: 'btn', onclick: () => setBpm(bpm + d) }, d > 0 ? `+${d}` : `−${-d}`))),
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('div', { style: { flex: 2 } }, seg),
      h('button', {
        class: 'btn',
        onclick: () => {
          const t = performance.now();
          if (taps.length && t - taps.at(-1) > 2000) taps.length = 0;
          taps.push(t);
          if (taps.length > 5) taps.shift();
          if (taps.length >= 2) setBpm(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1)));
        },
      }, 'Tap')),
    toggle));
  return () => met.stop();
}

function toolChords(root) {
  root.append(topBar('Acordes', '#/herramientas'),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Toca un acorde para escucharlo. Números: dedos (1 índice … 4 meñique). ×: no tocar. ○: al aire.'),
    h('div', { class: 'chord-grid' }, Object.keys(CHORDS).map((sym) => {
      const card = chordCard(sym);
      card.addEventListener('click', () => strum(sym));
      return card;
    })));
}

function toolCalibrate(root) {
  const latEl = h('b', { class: 'num' });
  const paintLat = () => { latEl.textContent = state.settings.latency == null ? 'sin calibrar' : `${Math.round(state.settings.latency * 1000)} ms`; };
  paintLat();
  const statusEl = h('p', { class: 'muted small' });
  const beatDot = h('div', { class: 'onset-dot' });
  const run = async (fn, msg) => {
    statusEl.textContent = msg;
    try {
      const lat = await fn();
      if (lat == null) statusEl.textContent = 'No se detectó lo suficiente. Prueba el otro método o sube la sensibilidad.';
      else {
        state.settings.latency = lat;
        save();
        paintLat();
        statusEl.textContent = `Guardado: ${Math.round(lat * 1000)} ms.`;
      }
    } catch (err) {
      statusEl.textContent = err instanceof MicError ? err.message : String(err);
    }
  };

  const levelBar = progressBar(0);
  const onsetDot = h('div', { class: 'onset-dot' });
  const sens = h('input', {
    type: 'range', min: 0.5, max: 2.5, step: 0.1, value: state.settings.sensitivity,
    oninput: (e) => { state.settings.sensitivity = +e.target.value; setSensitivity(+e.target.value); save(); },
  });
  let off = null;
  let held = false;
  let disposed = false;
  const listen = h('button', {
    class: 'btn block',
    onclick: async () => {
      if (held) return;
      try {
        await acquireMic();
      } catch (err) { statusEl.textContent = err.message; return; }
      if (disposed) { releaseMic(); return; }
      held = true;
      listen.replaceChildren(icon('mic', { size: 18 }), 'Escuchando…');
      off = onMicEvent((e) => {
        if (e.type === 'level') levelBar.firstChild.style.width = `${Math.max(0, Math.min(100, (Math.log10(e.energy + 1e-9) + 8) * 16))}%`;
        if (e.type === 'onset' && e.band === 'strum') { onsetDot.classList.remove('on'); void onsetDot.offsetWidth; onsetDot.classList.add('on'); }
      });
    },
  }, icon('mic', { size: 18 }), 'Probar detección');

  root.append(topBar('Calibrar', '#/herramientas'),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', { style: { margin: 0 } }, 'Latencia'), latEl),
      h('p', { class: 'muted small' }, 'El móvil tarda unos milisegundos en sacar el sonido y en escuchar. Medirlo hace justa la evaluación de ritmo.'),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary', onclick: () => run(calibrateLoopback, 'Silencio: escuchando los clics del altavoz…') }, 'Automática'),
        h('button', {
          class: 'btn',
          onclick: () => run(() => calibrateByPlaying((b) => {
            beatDot.textContent = b < 4 ? 4 - b : '';
            beatDot.classList.remove('on'); void beatDot.offsetWidth; beatDot.classList.add('on');
          }), 'Con auriculares: 4 clics de cuenta y luego rasguea en cada clic (8 veces).'),
        }, icon('headphones', { size: 18 }), 'Tocando')),
      beatDot, statusEl),
    h('div', { class: 'card' },
      h('h3', null, 'Sensibilidad'),
      h('p', { class: 'muted small' }, 'Rasguea: el círculo debe encenderse con cada golpe pero no con voces o ruidos. Si no se enciende, sube la sensibilidad; si salta solo, bájala.'),
      listen,
      h('div', { style: { marginTop: '16px' } }, levelBar),
      onsetDot,
      h('div', { class: 'field' }, h('span', null, 'Menos', h('span', null, 'Más')), sens)));
  return () => {
    disposed = true;
    off?.();
    if (held) releaseMic();
  };
}

function toolCapsule(root) {
  const list = h('div');
  const urls = [];
  let rec = null;
  let iv = null;
  const statusEl = h('p', { class: 'muted small center' });
  const btn = h('button', { class: 'btn primary big', onclick: () => (rec ? stop() : record()) });
  const paintBtn = () => {
    btn.classList.toggle('rec', !!rec);
    btn.replaceChildren(icon(rec ? 'stop' : 'record', { size: 18 }), rec ? 'Detener' : 'Grabar (máx. 30 s)');
  };
  paintBtn();

  async function refresh() {
    urls.forEach(URL.revokeObjectURL);
    urls.length = 0;
    const clips = (await listCapsules()).sort((a, b) => b.t - a.t);
    if (!clips.length) { list.replaceChildren(h('p', { class: 'muted' }, 'Aún no hay cápsulas.')); return; }
    list.replaceChildren(...clips.map((c) => {
      const url = URL.createObjectURL(c.blob);
      urls.push(url);
      return h('div', { class: 'card capsule' },
        h('div', { class: 'card-head', style: { marginBottom: 0 } },
          h('strong', null, new Date(c.t).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })),
          h('span', { class: 'muted small' }, `Etapa ${c.stage} · ${c.seconds} s`)),
        h('audio', { controls: true, src: url, preload: 'metadata' }),
        h('button', { class: 'btn small ghost', onclick: async () => { if (confirm('¿Borrar esta cápsula?')) { await deleteCapsule(c.id); refresh(); } } }, icon('trash', { size: 16 }), 'Borrar'));
    }));
  }

  async function record() {
    try {
      rec = await startRecording();
    } catch (err) {
      statusEl.textContent = err.message;
      return;
    }
    const t0 = Date.now();
    rec.t0 = t0;
    paintBtn();
    iv = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      statusEl.textContent = `Grabando… ${s} / 30 s`;
      if (s >= 30) stop();
    }, 250);
  }

  async function stop() {
    clearInterval(iv);
    const r = rec;
    rec = null;
    paintBtn();
    r.stop();
    const blob = await r.done;
    const seconds = Math.round((Date.now() - r.t0) / 1000);
    await addCapsule({ t: Date.now(), stage: currentStage(), seconds, blob });
    state.capsules = (state.capsules || 0) + 1;
    state.lastCapsuleAt = Date.now();
    save();
    checkBadges().forEach((b) => toast(`Insignia: ${b.name}`, b.icon));
    statusEl.textContent = 'Guardada en este dispositivo.';
    refresh();
  }

  root.append(topBar('Cápsula del tiempo', '#/herramientas'),
    h('div', { class: 'card' },
      h('p', { style: { marginTop: 0 } }, 'Graba 30 segundos tocando lo mejor que sepas hoy. Toca siempre la progresión de tu etapa actual para poder comparar.'),
      h('p', { class: 'muted small' }, 'Las grabaciones se guardan solo en este dispositivo y no se incluyen en la copia de seguridad.'),
      btn, statusEl),
    h('div', { class: 'eyebrow section-title' }, 'Tus cápsulas'),
    list);
  refresh();
  return () => {
    clearInterval(iv);
    rec?.stop();
    urls.forEach(URL.revokeObjectURL);
  };
}

const TOOL_VIEWS = {
  afinador: (root) => {
    root.append(topBar('Afinador', '#/herramientas'));
    const holder = h('div');
    root.append(holder);
    return tunerActivity.mount(holder, { def: null, standalone: true, onDone: () => {} });
  },
  metronomo: toolMetronome,
  acordes: toolChords,
  calibrar: toolCalibrate,
  capsula: toolCapsule,
};

// ─────────────── Ajustes ───────────────

function viewSettings(root) {
  const s = state.settings;
  const set = (k, v) => { s[k] = v; save(); };
  const radios = (name, opts, current, onChange) => h('div', { class: 'radio-list' }, opts.map(([value, label]) => h('label', null,
    h('span', null, label),
    h('input', { type: 'radio', name, checked: current === value, onchange: () => onChange(value) }))));
  const slider = (label, key, min, max, step, onInput) => h('label', { class: 'field' },
    h('span', null, label),
    h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { set(key, +e.target.value); onInput?.(+e.target.value); } }));
  const fileIn = h('input', {
    type: 'file', accept: 'application/json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        replaceState(JSON.parse(await f.text()));
        toast('Progreso restaurado');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, 'info'); }
    },
  });
  const goalSeg = h('div', { class: 'seg' }, [2, 3, 4, 5].map((n) => h('button', {
    class: n === s.weeklyGoal ? 'on' : '',
    onclick: (e) => { set('weeklyGoal', n); [...goalSeg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); },
  }, String(n))));

  root.append(topBar('Ajustes', '#/herramientas', { settings: false }),
    h('div', { class: 'card' },
      h('h3', null, 'Nombres de las notas'),
      radios('nota', [['es', 'Do Re Mi'], ['en', 'C D E'], ['both', 'Ambos: Do (C)']], s.notation, (v) => { set('notation', v); setNotation(v); })),
    h('div', { class: 'card' },
      h('h3', null, 'Objetivo semanal'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Sesiones por semana. La racha cuenta semanas, no días: saltarte un día no rompe nada.'),
      goalSeg),
    h('div', { class: 'card' },
      h('h3', null, 'Sonido y micrófono'),
      slider('Volumen del clic', 'clickVol', 0, 1, 0.05),
      slider('Volumen de la guitarra de la app', 'backingVol', 0, 1, 0.05),
      slider('Sensibilidad del micrófono', 'sensitivity', 0.5, 2.5, 0.1, setSensitivity)),
    h('div', { class: 'card' },
      h('h3', null, 'Copia de seguridad'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Tu progreso vive en este navegador. Descarga una copia de vez en cuando, o para pasarlo a otro dispositivo.'),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', {
          class: 'btn',
          onclick: () => {
            const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `traste-progreso-${new Date().toISOString().slice(0, 10)}.json` });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
        }, icon('download', { size: 18 }), 'Exportar'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, icon('upload', { size: 18 }), 'Importar'), fileIn)),
    h('div', { class: 'card' },
      h('h3', null, 'Borrar todo'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Elimina sesiones, récords e insignias de este dispositivo.'),
      h('button', {
        class: 'btn danger',
        onclick: () => {
          if (confirm('¿Borrar TODO tu progreso? No se puede deshacer.') && confirm('¿Seguro? Exporta una copia antes si tienes dudas.')) {
            resetState();
            location.hash = '#/hoy';
            location.reload();
          }
        },
      }, icon('trash', { size: 18 }), 'Borrar progreso')));
}

const VIEWS = {
  hoy: viewToday,
  ruta: viewPath,
  progreso: viewProgress,
  herramientas: viewTools,
  ajustes: viewSettings,
  sesion: viewSession,
  practicar: viewPractice,
  tool: (root, id) => (TOOL_VIEWS[id] ? TOOL_VIEWS[id](root) : go('#/herramientas')),
};

window.addEventListener('hashchange', render);
// Los navegadores suspenden el audio hasta que el usuario toca la pantalla.
document.addEventListener('pointerdown', resumeAudio, { capture: true });
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
