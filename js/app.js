// Aplicación: rutas, vistas y el ejecutor de la sesión diaria.
import { h, progressBar, steps, status, sparkSvg, svgNode, chordCard, metricText, metricParts, toast, pick } from './ui.js';
import { icon, TYPE_ICON } from './icons.js';
import { STAGES, SKILLS, SKILL_BY_ID, TYPE_LABEL } from './curriculum.js';
import {
  state, save, replaceState, resetState, levelInfo, sessionsThisWeek, streakWeeks, logSession, checkBadges, BADGES,
  progress, isPassed, isAvailable, stageProgress, stageSkills, currentParam, bestFor, skillState, unlockStage,
  totalMinutes, daysSinceLastSession, weekStart,
} from './store.js';
import { planRoles, resolveRole, previewSession, ROLE_LABEL, currentStage } from './session.js';
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
  back && h('a', { href: back, class: 'icon-btn', 'aria-label': 'Volver' }, icon('back', { size: 22 })),
  h('h1', { style: back ? null : { paddingLeft: '8px' } }, title),
  settings && h('a', { href: '#/ajustes', class: 'icon-btn', 'aria-label': 'Ajustes' }, icon('sliders', { size: 21 })));

function render() {
  cleanup?.();
  cleanup = null;
  const [name = 'hoy', arg] = location.hash.replace(/^#\/?/, '').split('/');
  // El calibre de la etapa actual tiñe toda la app.
  document.documentElement.dataset.gauge = currentStage();
  app.replaceChildren();
  window.scrollTo(0, 0);
  const view = VIEWS[name] || VIEWS.hoy;
  cleanup = view(app, arg ? decodeURIComponent(arg) : undefined) || null;
  tabsEl.hidden = name === 'sesion' || name === 'practicar';
  const active = name === 'tool' || name === 'ajustes' ? 'herramientas' : name;
  tabsEl.replaceChildren(...TABS.map(([id, ic, label]) => h('a', { href: `#/${id}`, class: id === active ? 'on' : '', 'aria-current': id === active ? 'page' : null }, icon(ic, { size: 22 }), label)));
  const css = getComputedStyle(document.documentElement);
  document.querySelector('meta[name="theme-color"]').content = (VIEWS[name] === viewToday || !VIEWS[name] ? css.getPropertyValue('--g') : css.getPropertyValue('--ground')).trim();
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

  if (!items.length && !tips.length) return [];
  return [
    h('div', { class: 'section' }, h('h2', null, items.length ? title : 'Para hoy')),
    h('div', { class: 'list' },
      items.slice(0, 3).map((x) => h('div', { class: 'gain' }, h('span', null, x.title), h('b', null, x.change))),
      tips.map(([ic, t]) => h('div', { class: 'insight' }, icon(ic, { size: 18 }), h('span', null, t)))),
  ];
}

/** Lo que ya se tocó hoy: queda a la vista, marcado como hecho. */
function doneToday() {
  const today = new Date().toDateString();
  const rows = state.sessions.filter((s) => new Date(s.t).toDateString() === today).flatMap((s) => s.blocks || []);
  if (!rows.length) return [];
  return [
    h('div', { class: 'section' }, h('h2', null, 'Hecho hoy')),
    h('div', { class: 'list' }, rows.map((b) => {
      const def = SKILL_BY_ID[b.id];
      if (!def) return null;
      return h('div', { class: 'item' },
        h('span', { class: 'n done' }, icon('check', { size: 16 })),
        h('div', { class: 'body' }, h('b', null, def.title)),
        h('span', { class: 'end' }, b.v == null || !def.metric ? 'lección' : metricText(def, b.v)));
    })),
  ];
}

function viewToday(root) {
  const goal = state.settings.weeklyGoal;
  const done = sessionsThisWeek();
  const streak = streakWeeks();
  const since = daysSinceLastSession();
  const note = since == null ? 'Tu primera sesión empieza por lo básico, sin prisa.'
    : since >= 7 ? 'Hoy basta con una sesión corta: lo importante es volver.'
      : done >= goal ? 'Objetivo semanal cumplido. Lo que sumes ahora es extra.' : null;

  let minutes = state.settings.minutes;
  const OPTIONS = [[5, 'exprés'], [10, ''], [15, ''], [20, '']];
  if (!OPTIONS.some(([m]) => m === minutes)) minutes = 10;
  const plan = h('div', { class: 'list' });
  const lessonNote = h('div');
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Duración' }, OPTIONS.map(([m, sub]) => h('button', {
    role: 'radio',
    onclick: () => { minutes = m; state.settings.minutes = m; save(); paint(); },
  }, `${m} min`, sub && h('small', null, sub))));
  function paint() {
    [...seg.children].forEach((c, i) => { const on = OPTIONS[i][0] === minutes; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
    const blocks = previewSession(minutes);
    plan.replaceChildren(...blocks.map((b, k) => h('div', { class: 'item' },
      h('span', { class: `n ${k === 0 ? 'next' : ''}` }, k + 1),
      h('div', { class: 'body' }, h('b', null, b.def.title), h('span', null, `${ROLE_LABEL[b.role]} · ${TYPE_LABEL[b.def.type]}`)),
      h('span', { class: 'end' }, `${Math.max(1, Math.round(b.sec / 60))} min`))));
    lessonNote.replaceChildren(...(blocks.some((b) => b.role === 'lesson')
      ? [h('div', { class: 'note' }, icon('info', { size: 16 }), 'Después de cada lección, la sesión sigue con la práctica que esa lección desbloquea.')] : []));
  }
  paint();

  const stage = STAGES[currentStage() - 1];
  const sp = stageProgress(stage.n);
  const cap = state.lastCapsuleAt ? (Date.now() - state.lastCapsuleAt) / 86400000 : null;
  const capsuleDue = state.sessions.length >= 2 && (cap == null || cap > 28);
  const dateLabel = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  root.append(...[
    h('section', { class: 'field' }, h('div', { class: 'field-inner' },
      h('header', { class: 'top' },
        h('span', { class: 'wordmark' }, 'Traste'),
        h('a', { href: '#/ajustes', class: 'icon-btn', 'aria-label': 'Ajustes' }, icon('sliders', { size: 21 }))),
      pick(stage.gauge),
      h('div', { class: 'field-stage' },
        h('h1', null, `Etapa ${stage.n}`),
        h('p', null, `${stage.title} · ${Math.round(sp * 100)}% superado`),
        h('a', { href: '#/ruta' }, 'Ver la ruta', icon('chevron', { size: 16 }))),
      h('div', { class: 'week' },
        h('div', { class: 'marks', 'aria-hidden': 'true' }, Array.from({ length: goal }, (_, k) => h('i', { class: k < done ? 'on' : '' }))),
        h('span', null, `${Math.min(done, goal)} de ${goal} sesiones esta semana`),
        streak > 0 && h('span', { class: 'streak' }, icon('flame', { size: 15 }), `${plural(streak, 'semana')} de racha`)))),
    h('div', { class: 'section' }, h('h2', null, 'Sesión de hoy'), h('span', { class: 'muted small' }, dateLabel)),
    note && h('p', { class: 'muted', style: { marginTop: 0 } }, note),
    seg,
    plan,
    lessonNote,
    h('button', { class: 'btn primary big', onclick: () => startSession(minutes) }, icon('play', { size: 18 }), 'Empezar sesión'),
    ...doneToday(),
    ...insights(),
    capsuleDue && h('div', { class: 'list', style: { marginTop: '24px' } },
      h('a', { class: 'item', href: '#/tool/capsula' },
        h('span', { class: 'tool-icon' }, icon('tape', { size: 20 })),
        h('div', { class: 'body' }, h('b', null, 'Graba tu cápsula del tiempo'), h('span', null, '30 segundos. En un mes oirás la diferencia que no notas día a día.')),
        icon('chevron', { size: 18 }))),
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
  const timeEl = h('span', { class: 'clock', style: { minWidth: '64px', justifyContent: 'flex-end', paddingRight: '8px' } });
  const blockEl = h('span', { class: 'title' });
  const bar = progressBar(0, 'thin');
  const body = h('div', { class: 'session-body' });
  const quitBtn = h('button', { class: 'icon-btn', 'aria-label': 'Terminar sesión', onclick: quit }, icon('close', { size: 22 }));
  root.append(h('div', { class: 'session-top' },
    h('div', { class: 'row between' }, quitBtn, blockEl, timeEl), h('div', { style: { padding: '0 8px' } }, bar)), body);
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
      blockEl.textContent = `${ROLE_LABEL[r]} · bloque ${session.blocks.length + 1}`;
      bar.firstChild.style.width = `${Math.round((session.idx / session.roles.length) * 100)}%`;
      const holder = h('div');
      body.replaceChildren(holder);
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
      h('div', { class: 'res-title' }, counts ? 'Sesión completada' : 'Sesión corta'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, `${mmss(seconds)} de práctica · ${plural(done.length, 'bloque')}`),
      counts
        ? h('div', { style: { margin: '14px 0 4px' } },
          h('div', { class: 'row between small', style: { marginBottom: '8px' } },
            h('span', null, r.weekGoal ? 'Objetivo semanal cumplido' : 'Esta semana'),
            h('span', { class: 'muted num' }, `${weekDone} de ${goal}`)),
          steps(weekDone, goal))
        : h('p', { class: 'muted' }, 'Lo que practicaste quedó guardado, pero para contar en tu semana la sesión debe durar al menos 2 minutos.'),
      h('ul', { class: 'summary' }, s.blocks.map((b) => h('li', null,
        h('span', { class: b.summary.skipped ? 'skip' : null }, b.def.title),
        h('span', null,
          b.summary.skipped ? 'saltado' : b.summary.lesson ? 'lección' : metricText(b.def, b.summary.value),
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
  root.append(h('header', { class: 'top' }, h('a', { href: '#/ruta', class: 'btn small ghost' }, icon('back', { size: 18 }), 'Ruta')));
  if (!isAvailable(def)) {
    const req = (def.req || []).map((r) => SKILL_BY_ID[r]);
    root.append(h('h2', null, def.title), h('p', { class: 'muted' }, 'Bloqueada. Primero completa:'),
      h('div', { class: 'list' }, req.map((r) => h('a', { class: 'item', href: `#/practicar/${r.id}` },
        h('span', { class: 'tool-icon' }, icon(TYPE_ICON[r.type], { size: 18 })), h('div', { class: 'body' }, h('b', null, r.title)), icon('chevron', { size: 18 })))));
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

/** Las seis púas de la ruta, unidas por la línea del recorrido hasta la etapa actual. */
function gaugeRow(cur) {
  const span = 86; // % del ancho entre la primera y la última púa (7% de margen a cada lado)
  return h('div', { class: 'gauges', role: 'list' },
    h('i', { class: 'course', style: { width: `${((cur - 1) / (STAGES.length - 1)) * span}%` } }),
    STAGES.map((st) => h('a', {
      href: `#stage-${st.n}`, role: 'listitem',
      class: `${st.n === cur ? 'current' : ''} ${st.n > state.unlockedStage ? 'locked' : ''}`,
      'aria-label': `Etapa ${st.n}, calibre ${st.gauge}`,
      onclick: (e) => { e.preventDefault(); const d = document.getElementById(`stage-${st.n}`); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    }, pick(st.gauge, { stage: st.n, size: st.n === cur ? 52 : 42 }), `Etapa ${st.n}`)));
}

function viewPath(root) {
  const cur = currentStage();
  root.append(topBar('Ruta'),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Seis etapas, seis calibres de púa: de la .50 a la 1.14. Al superar el 80% de una etapa pasas a la púa siguiente.'),
    gaugeRow(cur));
  for (const st of STAGES) {
    const unlocked = st.n <= state.unlockedStage;
    const p = stageProgress(st.n);
    const card = h('details', { id: `stage-${st.n}`, class: `stage-card ${unlocked ? '' : 'locked'}`, open: st.n === cur },
      h('summary', null,
        h('div', { class: 'stage-head' },
          pick(st.gauge, { stage: st.n, size: 40 }),
          h('div', { class: 'body' },
            h('h2', null, `${st.n}. ${st.title}`),
            h('p', null, st.goal),
            unlocked && h('div', { class: `bar g${st.n}` }, h('div', { style: { width: `${Math.round(p * 100)}%` } }))),
          h('span', { class: 'pct' }, unlocked ? `${Math.round(p * 100)}%` : icon('lock', { size: 16 })))));
    if (unlocked) card.append(h('div', { class: 'skills' }, stageSkills(st.n).map(skillRow)));
    else {
      card.append(h('button', {
        class: 'btn small block unlock',
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
  return h('div', { class: 'weeks', role: 'img', 'aria-label': `Sesiones de las últimas 8 semanas: ${weeks.map((w) => w.n).join(', ')}` },
    weeks.map((w) => h('div', { class: `wk ${w.n >= goal ? 'ok' : w.n === 0 ? 'empty' : ''}` },
      h('b', null, w.n || ''),
      h('div', { class: 'wk-bar', style: { height: `${(w.n / max) * 78}%` } }),
      h('small', null, new Date(w.ws).toLocaleDateString('es', { day: 'numeric', month: 'short' })))));
}

function viewProgress(root) {
  const lv = levelInfo();
  const earned = BADGES.filter((b) => state.badges[b.id]);
  const pending = BADGES.filter((b) => !state.badges[b.id]);
  const fact = (label, value) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('b', null, label)), h('span', { class: 'end', style: { color: 'var(--fg)', fontWeight: 600, fontSize: '1.05rem' } }, value));
  root.append(topBar('Progreso'),
    h('div', { class: 'list' },
      fact('Sesiones', state.sessions.length),
      fact('Minutos tocando', totalMinutes()),
      fact('Récords personales', state.prCount),
      fact(`Nivel ${lv.level} · ${lv.title}`, `${lv.into}/${lv.need} XP`)),
    h('div', { class: 'section' }, h('h2', null, 'Sesiones por semana'), h('span', { class: 'muted small' }, `objetivo ${state.settings.weeklyGoal}`)),
    h('div', { class: 'card' }, weeksChart()),
    h('div', { class: 'section' }, h('h2', null, 'Insignias'), h('span', { class: 'muted small num' }, `${earned.length} de ${BADGES.length}`)),
    h('div', { class: 'list' },
      earned.length
        ? earned.map((b) => h('div', { class: 'item badge-row' }, h('span', { class: 'medal' }, icon(b.icon, { size: 20 })),
          h('div', { class: 'body' }, h('b', null, b.name), h('span', null, b.desc)),
          h('span', { class: 'end' }, new Date(state.badges[b.id]).toLocaleDateString('es', { day: 'numeric', month: 'short' }))))
        : h('div', { class: 'item' }, h('div', { class: 'body' }, h('span', null, 'Completa tu primera sesión para ganar la primera.'))),
      pending.length > 0 && h('details', null,
        h('summary', { class: 'item', style: { cursor: 'pointer', color: 'var(--muted)' } }, `Por ganar (${pending.length})`),
        pending.map((b) => h('div', { class: 'item', style: { opacity: 0.65 } }, h('span', { class: 'n' }, icon(b.icon, { size: 16 })),
          h('div', { class: 'body' }, h('b', null, b.name), h('span', null, b.desc)))))));

  const charts = SKILLS.filter((d) => d.metric && skillState(d.id).history.length);
  root.append(h('div', { class: 'section' }, h('h2', null, 'Evolución por habilidad')));
  if (!charts.length) root.append(h('p', { class: 'muted' }, 'Tus gráficas aparecerán cuando completes tu primera sesión.'));
  for (const d of charts) {
    const all = skillState(d.id).history;
    const best = bestFor(d);
    const [bestValue, unit] = metricParts(d, best);
    root.append(h('div', { class: 'card' },
      h('div', { class: 'card-head', style: { marginBottom: 0 } }, h('b', { style: { fontWeight: 600 } }, d.title), h('span', { class: 'muted small' }, plural(all.length, 'intento'))),
      h('div', { class: 'res-value chart-best' }, h('b', null, bestValue), h('span', null, `${unit} · tu mejor marca`)),
      svgNode(sparkSvg(all.slice(-24).map((x) => x.v), { target: d.metric.target, lower: d.metric.lower })),
      h('div', { class: 'chart-values' },
        h('span', null, 'Primera ', h('b', null, metricText(d, all[0].v))),
        h('span', { style: { color: 'var(--ok)' } }, `Objetivo ${metricText(d, d.metric.target)}`))));
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

const toolRow = (href, ic, name, desc) => h('a', { class: 'item', href },
  h('span', { class: 'tool-icon' }, icon(ic, { size: 20 })),
  h('div', { class: 'body' }, h('b', null, name), h('span', null, desc)),
  icon('chevron', { size: 18 }));

function viewTools(root) {
  root.append(topBar('Herramientas'),
    h('div', { class: 'list' }, TOOLS.map(([id, ic, name, desc]) => toolRow(`#/tool/${id}`, ic, name, desc))),
    h('div', { class: 'list', style: { marginTop: '18px' } }, toolRow('#/ajustes', 'sliders', 'Ajustes', 'Notación, objetivo semanal, volumen, copia de seguridad.')));
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
    bpmEl,
    h('div', { class: 'unit' }, 'pulsos por minuto'),
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
      h('div', { class: 'card-head' }, h('h2', { style: { margin: 0, fontSize: '1.25rem' } }, 'Latencia'), latEl),
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
      h('h2', { style: { fontSize: '1.25rem' } }, 'Sensibilidad'),
      h('p', { class: 'muted small' }, 'Rasguea: el círculo debe encenderse con cada golpe pero no con voces o ruidos. Si no se enciende, sube la sensibilidad; si salta solo, bájala.'),
      listen,
      h('div', { style: { marginTop: '16px' } }, levelBar),
      onsetDot,
      h('div', { class: 'field-row' }, h('span', null, 'Menos', h('span', null, 'Más')), sens)));
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
    h('div', { class: 'section' }, h('h2', null, 'Tus cápsulas')),
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
  const radios = (name, opts, current, onChange) => h('div', { class: 'list radio-list' }, opts.map(([value, label]) => h('label', null,
    h('span', null, label),
    h('input', { type: 'radio', name, checked: current === value, onchange: () => onChange(value) }))));
  const slider = (label, key, min, max, step, onInput) => h('label', { class: 'field-row' },
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
    h('div', { class: 'section', style: { marginTop: '8px' } }, h('h2', null, 'Nombres de las notas')),
    radios('nota', [['es', 'Do Re Mi'], ['en', 'C D E'], ['both', 'Ambos: Do (C)']], s.notation, (v) => { set('notation', v); setNotation(v); }),
    h('div', { class: 'section' }, h('h2', null, 'Objetivo semanal')),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Sesiones por semana. La racha cuenta semanas, no días: saltarte un día no rompe nada.'),
    goalSeg,
    h('div', { class: 'section' }, h('h2', null, 'Sonido y micrófono')),
    h('div', { class: 'card' },
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
