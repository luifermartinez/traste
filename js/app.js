// Aplicación: rutas, vistas y el ejecutor de la sesión diaria.
import { h, ring, progressBar, sparkSvg, svgNode, chordCard, metricText, toast } from './ui.js';
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

const TABS = [['hoy', '🏠', 'Hoy'], ['ruta', '🗺️', 'Ruta'], ['progreso', '📈', 'Progreso'], ['herramientas', '🧰', 'Herramientas']];
const go = (hash) => { location.hash = hash; };
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const MIN_SESSION_SEC = 120;
const topBar = (title, back) => h('header', { class: 'top' },
  back ? h('a', { href: back, class: 'icon-btn' }, '←') : h('div', { class: 'brand' }, '🎸 Traste'),
  title && h('h1', null, title),
  h('a', { href: '#/ajustes', class: 'icon-btn', title: 'Ajustes' }, '⚙️'));

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
  tabsEl.replaceChildren(...TABS.map(([id, icon, label]) => h('a', { href: `#/${id}`, class: id === active ? 'on' : '' }, h('span', null, icon), h('small', null, label))));
}

// ─────────────── Hoy ───────────────

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
      if (maxNow > maxBefore) items.push({ gain: 1, text: `${d.title}: de ${maxBefore} a ${maxNow} BPM` });
      continue;
    }
    const best = (xs) => xs.reduce((a, x) => (d.metric.lower ? Math.min(a, x.v) : Math.max(a, x.v)), d.metric.lower ? Infinity : -Infinity);
    const b0 = best(before);
    const b1 = best(week);
    const gain = d.metric.lower ? (b0 - b1) / b0 : (b1 - b0) / Math.max(1, b0);
    if (gain > 0) items.push({ gain, text: `${d.title}: ${metricText(d, b0)} → ${metricText(d, b1)}` });
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
      if (gain > 0) items.push({ gain, text: `${d.title}: ${metricText(d, first)} → ${metricText(d, best)}` });
    }
  }
  items.sort((a, b) => b.gain - a.gain);

  const tips = [];
  const lastRhythm = SKILLS.filter((d) => d.type === 'rhythm').flatMap((d) => skillState(d.id).history).sort((a, b) => b.t - a.t)[0];
  if (lastRhythm?.bias != null && Math.abs(lastRhythm.bias) >= 25) {
    tips.push(lastRhythm.bias < 0
      ? `🕵️ En tu último reto de ritmo ibas ${-lastRhythm.bias} ms adelantado/a. Hoy: escucha el clic y deja que suene antes de golpear.`
      : `🕵️ En tu último reto de ritmo ibas ${lastRhythm.bias} ms atrasado/a. Hoy: prepara el movimiento antes del clic.`);
  }
  const stuck = SKILLS.find((d) => {
    const hist = skillState(d.id).history;
    if (!d.metric || isPassed(d) || hist.length < 4) return false;
    const last = hist.slice(-3);
    const prev = hist.slice(0, -3);
    const bestPrev = prev.reduce((a, x) => Math.max(a, x.v), -Infinity);
    return !d.metric.lower && last.every((x) => x.v <= bestPrev);
  });
  if (stuck) tips.push(`🧩 "${stuck.title}" lleva 3 intentos sin récord. Es normal: haz la versión lenta y limpia, y revisa la lección. El cerebro consolida entre sesiones.`);

  if (!items.length && !tips.length) return null;
  return h('div', { class: 'card' },
    items.length > 0 && h('h3', null, `📈 ${title}`),
    items.length > 0 && h('ul', { class: 'clean' }, items.slice(0, 3).map((x) => h('li', null, x.text))),
    tips.map((t) => h('p', { class: 'tip' }, t)));
}

function viewToday(root) {
  const lv = levelInfo();
  const goal = state.settings.weeklyGoal;
  const done = sessionsThisWeek();
  const streak = streakWeeks();
  const since = daysSinceLastSession();
  const hour = new Date().getHours();
  let greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  if (since == null) greeting = '¡Bienvenido/a a tu primera sesión!';
  else if (since >= 7) greeting = '¡Qué bueno verte de vuelta!';
  const weekMsg = done >= goal
    ? 'Objetivo semanal cumplido. Lo que sumes ahora es extra.'
    : since != null && since >= 7 ? 'Hoy basta con una sesión corta: lo importante es volver.'
      : `Te ${goal - done === 1 ? 'falta' : 'faltan'} ${plural(goal - done, 'sesión', 'sesiones')} esta semana.`;

  let minutes = state.settings.minutes;
  const options = [5, 10, 15, 20];
  const previewEl = h('div', { class: 'preview' });
  const chips = options.map((m) => h('button', { class: 'chip', onclick: () => { minutes = m; state.settings.minutes = m; save(); paint(); } }, m === 5 ? '5 min exprés' : `${m} min`));
  function paint() {
    chips.forEach((c, i) => c.classList.toggle('on', options[i] === minutes));
    const blocks = previewSession(minutes);
    previewEl.replaceChildren(...blocks.map((b) => h('div', { class: 'pv-row' },
      h('span', { class: 'pill' }, ROLE_LABEL[b.role]), h('span', { class: 'pv-title' }, b.def.title), h('span', { class: 'muted small' }, TYPE_LABEL[b.def.type]))));
    if (blocks.some((b) => b.role === 'lesson')) previewEl.append(h('p', { class: 'muted small' }, 'Después de cada lección, la sesión sigue con la práctica que esa lección desbloquea.'));
  }
  paint();

  const stage = STAGES[currentStage() - 1];
  const cap = state.lastCapsuleAt ? (Date.now() - state.lastCapsuleAt) / 86400000 : null;
  const capsuleDue = state.sessions.length >= 2 && (cap == null || cap > 28);

  root.append(...[
    topBar(),
    h('div', { class: 'card hero' },
      h('div', { class: 'row gap' }, ring(done / goal, `${done}/${goal}`),
        h('div', null,
          h('div', { class: 'hero-title' }, greeting),
          h('div', { class: 'muted' }, weekMsg),
          h('div', { class: 'streak' }, streak ? `🔥 ${plural(streak, 'semana')} seguida${streak === 1 ? '' : 's'}` : 'Cumple tu objetivo semanal para empezar una racha'))),
      h('div', { class: 'lvl' },
        h('div', { class: 'row between' }, h('span', null, `Nivel ${lv.level} · ${lv.title}`), h('span', { class: 'muted small' }, `${lv.into}/${lv.need} XP`)),
        progressBar(lv.into / lv.need))),
    h('div', { class: 'card' },
      h('h3', null, 'Sesión de hoy'),
      h('div', { class: 'chips' }, chips),
      previewEl,
      h('button', { class: 'btn primary big', onclick: () => startSession(minutes) }, '▶ Empezar sesión')),
    insights(),
    capsuleDue && h('a', { class: 'card link', href: '#/tool/capsula' },
      h('h3', null, '📼 Graba tu cápsula del tiempo'),
      h('p', { class: 'muted' }, '30 segundos tocando lo que sepas. Dentro de un mes la escucharás y oirás la diferencia: el progreso que no notas día a día.')),
    h('a', { class: 'card link', href: '#/ruta' },
      h('div', { class: 'row between' }, h('h3', null, `Etapa ${stage.n}: ${stage.title}`), h('span', { class: 'muted' }, `${Math.round(stageProgress(stage.n) * 100)}%`)),
      h('p', { class: 'muted small' }, stage.goal),
      progressBar(stageProgress(stage.n))),
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
  const timeEl = h('span', { class: 'muted' });
  const blockEl = h('span', { class: 'muted' });
  const bar = progressBar(0, 'thin');
  const body = h('div', { class: 'session-body' });
  const quitBtn = h('button', { class: 'btn small ghost', onclick: quit }, '✕ Terminar');
  root.append(h('div', { class: 'session-top' },
    h('div', { class: 'row between' }, quitBtn, blockEl, timeEl), bar), body);
  const tick = () => { timeEl.textContent = `⏱ ${mmss(Math.floor((Date.now() - session.t0) / 1000))}`; };
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
        h('div', { class: 'block-intro' }, h('span', { class: 'pill' }, ROLE_LABEL[r]), h('span', { class: 'muted small' }, ROLE_HINT[r], ` · ~${Math.round(sec / 60)} min`)),
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
    quitBtn.hidden = true;
    bar.firstChild.style.width = '100%';
    blockEl.textContent = '';
    body.replaceChildren(h('div', { class: 'card result' },
      h('div', { class: 'res-big' }, counts ? '🎉 Sesión completada' : 'Sesión corta'),
      h('p', { class: 'muted' }, `${mmss(seconds)} de práctica · ${plural(done.length, 'bloque')}`),
      counts
        ? h('div', { class: 'row gap center' }, ring(sessionsThisWeek() / goal, `${sessionsThisWeek()}/${goal}`, 72), h('div', null, r.weekGoal ? '🔥 ¡Objetivo semanal cumplido!' : `Sesiones esta semana: ${sessionsThisWeek()} de ${goal}`))
        : h('p', null, 'Lo que practicaste quedó guardado, pero para contar en tu semana la sesión debe durar al menos 2 minutos.'),
      h('ul', { class: 'clean summary' }, done.map((b) => h('li', null,
        h('span', null, b.def.title),
        h('span', { class: 'muted' }, b.summary.lesson ? '✓ lección' : `${metricText(b.def, b.summary.value)}${b.summary.isPR ? ' 🏆' : ''}${b.summary.passedNow ? ' ✅' : ''}`)))),
      badges.map((b) => h('p', { class: 'badge-new' }, `${b.icon} Insignia: ${b.name}`)),
      h('div', { class: 'xp-pop' }, `+${s.xp + r.bonus} XP`),
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
  root.append(h('div', { class: 'session-top' }, h('a', { class: 'btn small ghost', href: '#/ruta' }, '← Ruta')));
  if (!isAvailable(def)) {
    const req = (def.req || []).map((r) => SKILL_BY_ID[r]);
    root.append(h('div', { class: 'card' }, h('h2', null, def.title), h('p', null, '🔒 Primero completa:'),
      h('ul', null, req.map((r) => h('li', null, h('a', { href: `#/practicar/${r.id}` }, r.title))))));
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
  let meta = '';
  if (!avail) meta = `🔒 ${(d.req || []).map((r) => SKILL_BY_ID[r].title).join(', ') || 'Etapa bloqueada'}`;
  else if (d.type === 'lesson') meta = isPassed(d) ? '✓ Hecha' : 'Nueva';
  else {
    const best = bestFor(d, currentParam(d));
    meta = [d.ladder && (st.mastered ? '⭐ Dominada' : `${currentParam(d)} BPM`), best != null ? metricText(d, best) : 'Sin intentos', isPassed(d) && '✓'].filter(Boolean).join(' · ');
  }
  return h(avail ? 'a' : 'div', { class: `skill ${avail ? '' : 'locked'} ${isPassed(d) ? 'passed' : ''}`, href: avail ? `#/practicar/${d.id}` : null },
    h('div', { class: 'row between' }, h('span', { class: 'sk-title' }, d.title), h('span', { class: 'pill small' }, TYPE_LABEL[d.type])),
    progressBar(progress(d), 'thin'),
    h('div', { class: 'muted small' }, meta));
}

function viewPath(root) {
  root.append(topBar('Tu ruta'),
    h('p', { class: 'muted' }, 'Cada habilidad tiene un objetivo medible. Al superar el 80% de una etapa (y sus lecciones) se abre la siguiente. Toca cualquier habilidad para practicarla libremente.'));
  const cur = currentStage();
  for (const st of STAGES) {
    const unlocked = st.n <= state.unlockedStage;
    const p = stageProgress(st.n);
    const card = h('details', { class: `card stage ${unlocked ? '' : 'locked'}`, open: st.n === cur },
      h('summary', null,
        h('div', { class: 'row between' }, h('h3', null, `${st.n}. ${st.title}`), h('span', { class: 'muted' }, unlocked ? `${Math.round(p * 100)}%` : '🔒')),
        h('p', { class: 'muted small' }, st.goal),
        progressBar(p)));
    if (unlocked) card.append(h('div', { class: 'skills' }, stageSkills(st.n).map(skillRow)));
    else {
      card.append(h('button', {
        class: 'btn small ghost',
        onclick: () => {
          if (confirm(`¿Ya dominas lo anterior? Se abrirán las etapas hasta la ${st.n}.`)) { unlockStage(st.n); render(); }
        },
      }, '🔓 Ya sé esto: abrir etapa'));
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
    h('div', { class: 'card' }, h('h3', null, 'Sesiones por semana'), h('p', { class: 'muted small' }, `Objetivo: ${state.settings.weeklyGoal} por semana`), weeksChart()),
    h('div', { class: 'card' }, h('h3', null, 'Insignias'),
      h('div', { class: 'badges' }, BADGES.map((b) => h('div', { class: `badge ${state.badges[b.id] ? 'on' : ''}`, title: b.desc },
        h('span', null, b.icon), h('small', null, b.name))))));

  const charts = SKILLS.filter((d) => d.metric && skillState(d.id).history.length);
  if (!charts.length) root.append(h('p', { class: 'muted center' }, 'Tus gráficas aparecerán cuando completes tu primera sesión.'));
  for (const d of charts) {
    const hist = skillState(d.id).history.slice(-24);
    const best = bestFor(d);
    root.append(h('div', { class: 'card chart' },
      h('div', { class: 'row between' }, h('strong', null, d.title), h('span', { class: 'muted small' }, `${plural(skillState(d.id).history.length, 'intento')}`)),
      svgNode(sparkSvg(hist.map((x) => x.v), { target: d.metric.target, lower: d.metric.lower })),
      h('div', { class: 'muted small' }, `Primera: ${metricText(d, skillState(d.id).history[0].v)} · Mejor: ${metricText(d, best)}${d.ladder ? ` · Tempo actual: ${currentParam(d)} BPM` : ''}`)));
  }
}

// ─────────────── Herramientas ───────────────

const TOOLS = [
  ['afinador', '🎯', 'Afinador', 'Afinación estándar con aguja y notas de referencia.'],
  ['metronomo', '🥁', 'Metrónomo', 'Con tap tempo y acento en el primer pulso.'],
  ['acordes', '🖐️', 'Diccionario de acordes', 'Todos los acordes de la ruta, con sonido.'],
  ['capsula', '📼', 'Cápsula del tiempo', 'Grábate y compárate con tu yo de hace un mes.'],
  ['calibrar', '🔧', 'Calibrar micrófono', 'Latencia y sensibilidad de detección.'],
];

function viewTools(root) {
  root.append(topBar('Herramientas'),
    ...TOOLS.map(([id, icon, name, desc]) => h('a', { class: 'card link tool', href: `#/tool/${id}` }, h('span', { class: 'tool-icon' }, icon), h('div', null, h('strong', null, name), h('p', { class: 'muted small' }, desc)))),
    h('a', { class: 'card link tool', href: '#/ajustes' }, h('span', { class: 'tool-icon' }, '⚙️'), h('div', null, h('strong', null, 'Ajustes'), h('p', { class: 'muted small' }, 'Notación, objetivo semanal, volumen, copia de seguridad.'))));
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
  const bpmEl = h('div', { class: 'big-count' });
  const slider = h('input', { type: 'range', min: 30, max: 220, value: bpm, oninput: (e) => setBpm(+e.target.value) });
  function setBpm(v) {
    bpm = Math.max(30, Math.min(220, Math.round(v)));
    met.bpm = bpm;
    bpmEl.textContent = bpm;
    slider.value = bpm;
  }
  setBpm(bpm);
  const taps = [];
  const toggle = h('button', {
    class: 'btn primary big',
    onclick: () => {
      if (met.timer) { met.stop(); toggle.textContent = '▶ Empezar'; } else { met.start(); toggle.textContent = '■ Parar'; }
    },
  }, '▶ Empezar');
  root.append(topBar('Metrónomo', '#/herramientas'), h('div', { class: 'card center' },
    bpmEl, h('div', { class: 'muted' }, 'BPM'),
    h('div', { class: 'row gap center' }, [-5, -1, 1, 5].map((d) => h('button', { class: 'btn small', onclick: () => setBpm(bpm + d) }, d > 0 ? `+${d}` : d))),
    slider, lights,
    h('div', { class: 'row gap center' },
      h('select', { onchange: (e) => { beats = +e.target.value; met.beatsPerBar = beats; paintLights(); } },
        [2, 3, 4, 6].map((n) => h('option', { value: n, selected: n === 4 }, `${n}/4`))),
      h('button', {
        class: 'btn',
        onclick: () => {
          const t = performance.now();
          if (taps.length && t - taps.at(-1) > 2000) taps.length = 0;
          taps.push(t);
          if (taps.length > 5) taps.shift();
          if (taps.length >= 2) setBpm(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1)));
        },
      }, '👆 Tap')),
    toggle));
  return () => met.stop();
}

function toolChords(root) {
  root.append(topBar('Acordes', '#/herramientas'),
    h('p', { class: 'muted' }, 'Toca un acorde para escucharlo. Números = dedos (1 índice … 4 meñique); × = no tocar; ○ = al aire.'),
    h('div', { class: 'chord-grid' }, Object.keys(CHORDS).map((sym) => {
      const card = chordCard(sym);
      card.addEventListener('click', () => strum(sym));
      return card;
    })));
}

function toolCalibrate(root) {
  const latEl = h('strong');
  const paintLat = () => { latEl.textContent = state.settings.latency == null ? 'sin calibrar (se usa 90 ms)' : `${Math.round(state.settings.latency * 1000)} ms`; };
  paintLat();
  const status = h('p', { class: 'muted' });
  const beatDot = h('div', { class: 'onset-dot' });
  const run = async (fn, msg) => {
    status.textContent = msg;
    try {
      const lat = await fn();
      if (lat == null) status.textContent = 'No se detectó lo suficiente. Prueba el otro método o sube la sensibilidad.';
      else {
        state.settings.latency = lat;
        save();
        paintLat();
        status.textContent = `✓ Guardado: ${Math.round(lat * 1000)} ms`;
      }
    } catch (err) {
      status.textContent = err instanceof MicError ? err.message : String(err);
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
    class: 'btn',
    onclick: async () => {
      if (held) return;
      try {
        await acquireMic();
      } catch (err) { status.textContent = err.message; return; }
      if (disposed) { releaseMic(); return; }
      held = true;
      listen.textContent = '🎙️ Escuchando…';
      off = onMicEvent((e) => {
        if (e.type === 'level') levelBar.firstChild.style.width = `${Math.max(0, Math.min(100, (Math.log10(e.energy + 1e-9) + 8) * 16))}%`;
        if (e.type === 'onset' && e.band === 'strum') { onsetDot.classList.remove('on'); void onsetDot.offsetWidth; onsetDot.classList.add('on'); }
      });
    },
  }, '🎙️ Probar detección');

  root.append(topBar('Calibrar', '#/herramientas'),
    h('div', { class: 'card' },
      h('h3', null, 'Latencia'),
      h('p', null, 'Actual: ', latEl),
      h('p', { class: 'muted small' }, 'El móvil tarda unos milisegundos en sacar el sonido y en escuchar. Medirlo hace justa la evaluación de ritmo.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: () => run(calibrateLoopback, '🔇 Silencio: escuchando los clics del altavoz…') }, 'Automática (altavoz)'),
        h('button', {
          class: 'btn',
          onclick: () => run(() => calibrateByPlaying((b) => {
            beatDot.textContent = b < 4 ? 4 - b : '';
            beatDot.classList.remove('on'); void beatDot.offsetWidth; beatDot.classList.add('on');
          }), 'Con auriculares: 4 clics de cuenta y luego rasguea en cada clic (8 veces).'),
        }, 'Tocando (auriculares)')),
      beatDot, status),
    h('div', { class: 'card' },
      h('h3', null, 'Sensibilidad'),
      h('p', { class: 'muted small' }, 'Rasguea: el círculo debe encenderse con cada golpe pero no con voces o ruidos. Si no se enciende, sube la sensibilidad; si salta solo, bájala.'),
      listen, levelBar, onsetDot, sens));
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
  const status = h('p', { class: 'muted' });
  const btn = h('button', { class: 'btn primary big', onclick: () => (rec ? stop() : record()) }, '⏺ Grabar (máx. 30 s)');

  async function refresh() {
    urls.forEach(URL.revokeObjectURL);
    urls.length = 0;
    const clips = (await listCapsules()).sort((a, b) => b.t - a.t);
    if (!clips.length) { list.replaceChildren(h('p', { class: 'muted center' }, 'Aún no hay cápsulas.')); return; }
    list.replaceChildren(...clips.map((c) => {
      const url = URL.createObjectURL(c.blob);
      urls.push(url);
      return h('div', { class: 'card capsule' },
        h('div', { class: 'row between' },
          h('strong', null, new Date(c.t).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })),
          h('span', { class: 'muted small' }, `Etapa ${c.stage} · ${c.seconds}s`)),
        h('audio', { controls: true, src: url, preload: 'metadata' }),
        h('button', { class: 'btn small ghost', onclick: async () => { if (confirm('¿Borrar esta cápsula?')) { await deleteCapsule(c.id); refresh(); } } }, 'Borrar'));
    }));
  }

  async function record() {
    try {
      rec = await startRecording();
    } catch (err) {
      status.textContent = err.message;
      return;
    }
    const t0 = Date.now();
    btn.textContent = '■ Detener';
    btn.classList.add('rec');
    iv = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      status.textContent = `⏺ Grabando… ${s}s / 30s`;
      if (s >= 30) stop();
    }, 250);
    rec.t0 = t0;
  }

  async function stop() {
    clearInterval(iv);
    const r = rec;
    rec = null;
    btn.textContent = '⏺ Grabar (máx. 30 s)';
    btn.classList.remove('rec');
    r.stop();
    const blob = await r.done;
    const seconds = Math.round((Date.now() - r.t0) / 1000);
    await addCapsule({ t: Date.now(), stage: currentStage(), seconds, blob });
    state.capsules = (state.capsules || 0) + 1;
    state.lastCapsuleAt = Date.now();
    save();
    checkBadges().forEach((b) => toast(`${b.icon} Insignia: ${b.name}`));
    status.textContent = '✓ Guardada en este dispositivo.';
    refresh();
  }

  root.append(topBar('Cápsula del tiempo', '#/herramientas'),
    h('div', { class: 'card' },
      h('p', null, 'Graba 30 segundos tocando lo mejor que sepas hoy. Idea: toca siempre la progresión de tu etapa actual para poder comparar.'),
      h('p', { class: 'muted small' }, 'Las grabaciones se guardan solo en este dispositivo (no se incluyen en la copia de seguridad).'),
      btn, status),
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
  const radio = (name, value, label, current, onChange) => h('label', { class: 'check inline' },
    h('input', { type: 'radio', name, value, checked: current === value, onchange: () => onChange(value) }), label);
  const slider = (key, min, max, step, onInput) => h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { set(key, +e.target.value); onInput?.(+e.target.value); } });
  const fileIn = h('input', {
    type: 'file', accept: 'application/json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        replaceState(JSON.parse(await f.text()));
        toast('✓ Progreso restaurado');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message); }
    },
  });

  root.append(topBar('Ajustes', '#/herramientas'),
    h('div', { class: 'card' },
      h('h3', null, 'Nombres de las notas'),
      h('div', { class: 'col' },
        radio('nota', 'es', 'Do Re Mi', s.notation, (v) => { set('notation', v); setNotation(v); }),
        radio('nota', 'en', 'C D E', s.notation, (v) => { set('notation', v); setNotation(v); }),
        radio('nota', 'both', 'Ambos: Do (C)', s.notation, (v) => { set('notation', v); setNotation(v); }))),
    h('div', { class: 'card' },
      h('h3', null, 'Objetivo semanal'),
      h('p', { class: 'muted small' }, 'Sesiones por semana. La racha cuenta semanas, no días: saltarte un día no rompe nada.'),
      h('div', { class: 'row gap' }, [2, 3, 4, 5].map((n) => radio('goal', n, String(n), s.weeklyGoal, (v) => set('weeklyGoal', v))))),
    h('div', { class: 'card' },
      h('h3', null, 'Sonido'),
      h('label', null, 'Volumen del clic', slider('clickVol', 0, 1, 0.05)),
      h('label', null, 'Volumen de la guitarra de la app', slider('backingVol', 0, 1, 0.05)),
      h('label', null, 'Sensibilidad del micrófono', slider('sensitivity', 0.5, 2.5, 0.1, setSensitivity))),
    h('div', { class: 'card' },
      h('h3', null, 'Copia de seguridad'),
      h('p', { class: 'muted small' }, 'Tu progreso vive en este navegador. Descarga una copia de vez en cuando (o para pasarlo a otro dispositivo).'),
      h('div', { class: 'row gap' },
        h('button', {
          class: 'btn',
          onclick: () => {
            const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `traste-progreso-${new Date().toISOString().slice(0, 10)}.json` });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
        }, '⬇ Exportar'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, '⬆ Importar'), fileIn)),
    h('div', { class: 'card' },
      h('h3', null, 'Zona peligrosa'),
      h('button', {
        class: 'btn danger',
        onclick: () => {
          if (confirm('¿Borrar TODO tu progreso? No se puede deshacer.') && confirm('¿Seguro? Exporta una copia antes si tienes dudas.')) {
            resetState();
            location.hash = '#/hoy';
            location.reload();
          }
        },
      }, 'Borrar progreso')));
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
