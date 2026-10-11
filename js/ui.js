// Utilidades de interfaz: creación de nodos y dibujos SVG (acordes, mástil, tablatura, gráficas).
import { CHORDS, chordName, OPEN_MIDI, pcShort } from './music.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** Nodo a partir de SVG en texto. */
export function svgNode(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export function toast(msg, ms = 2600) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export function progressBar(frac, cls = '') {
  return h('div', { class: `bar ${cls}` }, h('div', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }));
}

export function ring(frac, label, size = 84) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return svgNode(`<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c * f} ${c}" stroke-opacity="${f > 0 ? 1 : 0}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" class="ring-txt">${label}</text></svg>`);
}

// ─────────────── Diagrama de acorde ───────────────

export function chordSvg(sym) {
  const c = CHORDS[sym];
  const pressed = c.frets.filter((f) => f > 0);
  const maxF = Math.max(0, ...pressed);
  const base = maxF <= 4 ? 1 : Math.min(...pressed);
  const X = (i) => 18 + i * 16;
  const top = 30;
  const Y = (f) => top + (f - base + 0.5) * 20;
  let s = `<svg class="chord" viewBox="0 0 116 142" width="116" height="142">`;
  for (let k = 0; k <= 5; k++) s += `<line x1="${X(0)}" x2="${X(5)}" y1="${top + k * 20}" y2="${top + k * 20}" class="cd-fret"/>`;
  if (base === 1) s += `<rect x="${X(0) - 1}" y="${top - 4}" width="${X(5) - X(0) + 2}" height="5" class="cd-nut"/>`;
  else s += `<text x="4" y="${Y(base) + 4}" class="cd-base">${base}</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${X(i)}" x2="${X(i)}" y1="${top}" y2="${top + 100}" class="cd-string"/>`;
  c.frets.forEach((f, i) => {
    if (f < 0) s += `<text x="${X(i)}" y="${top - 9}" text-anchor="middle" class="cd-mute">×</text>`;
    else if (f === 0) s += `<circle cx="${X(i)}" cy="${top - 13}" r="4.5" class="cd-open"/>`;
  });
  if (c.barre) {
    const first = c.frets.findIndex((f) => f === c.barre);
    s += `<rect x="${X(first) - 7}" y="${Y(c.barre) - 7}" width="${X(5) - X(first) + 14}" height="14" rx="7" class="cd-dot"/>`;
    s += `<text x="${(X(first) + X(5)) / 2}" y="${Y(c.barre) + 4}" text-anchor="middle" class="cd-finger">1</text>`;
  }
  c.frets.forEach((f, i) => {
    if (f <= 0 || (c.barre && f === c.barre && c.fingers[i] === 1)) return;
    s += `<circle cx="${X(i)}" cy="${Y(f)}" r="7" class="cd-dot"/>`;
    if (c.fingers[i]) s += `<text x="${X(i)}" y="${Y(f) + 4}" text-anchor="middle" class="cd-finger">${c.fingers[i]}</text>`;
  });
  return `${s}</svg>`;
}

export function chordCard(sym, extraClass = '') {
  return h('div', { class: `chord-card ${extraClass}` }, h('div', { class: 'chord-name' }, chordName(sym)), svgNode(chordSvg(sym)));
}

// ─────────────── Mástil ───────────────

/**
 * Mástil horizontal (cuerda 1 arriba, como la tablatura).
 * marks: [{s, f, cls, label}], activeStrings: cuerdas resaltadas (el resto se atenúa).
 */
export function fretboardSvg({ from = 0, to = 5, marks = [], activeStrings = null } = {}) {
  const first = Math.max(1, from);
  const fw = 46;
  const x0 = 40;
  const y0 = 16;
  const sh = 22;
  const width = x0 + (to - first + 1) * fw + 8;
  const height = y0 + sh * 5 + 34;
  const cx = (f) => (f === 0 ? x0 - 18 : x0 + (f - first + 0.5) * fw);
  const cy = (s) => y0 + (s - 1) * sh;
  let s = `<svg class="fretboard" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMid meet">`;
  s += `<rect x="${x0}" y="${y0 - 6}" width="${width - x0 - 8}" height="${sh * 5 + 12}" class="fb-wood"/>`;
  for (const f of [3, 5, 7, 9, 15, 17]) if (f >= first && f <= to) s += `<circle cx="${cx(f)}" cy="${y0 + sh * 2.5}" r="5" class="fb-inlay"/>`;
  if (12 >= first && 12 <= to) s += `<circle cx="${cx(12)}" cy="${y0 + sh * 1.5}" r="5" class="fb-inlay"/><circle cx="${cx(12)}" cy="${y0 + sh * 3.5}" r="5" class="fb-inlay"/>`;
  for (let k = first - 1; k <= to; k++) {
    const x = x0 + (k - first + 1) * fw;
    s += `<line x1="${x}" x2="${x}" y1="${y0 - 6}" y2="${y0 + sh * 5 + 6}" class="${k === 0 ? 'fb-nut' : 'fb-fret'}"/>`;
  }
  for (let st = 1; st <= 6; st++) {
    const on = !activeStrings || activeStrings.includes(st);
    s += `<line x1="${x0 - 30}" x2="${width - 8}" y1="${cy(st)}" y2="${cy(st)}" class="fb-string ${on ? '' : 'fb-dim'}" stroke-width="${0.8 + st * 0.35}"/>`;
    s += `<text x="4" y="${cy(st) + 4}" class="fb-label ${on ? '' : 'fb-dim'}">${pcShort(OPEN_MIDI[st])}</text>`;
  }
  for (let f = first; f <= to; f++) s += `<text x="${cx(f)}" y="${height - 8}" text-anchor="middle" class="fb-num">${f}</text>`;
  for (const m of marks) {
    s += `<circle cx="${cx(m.f)}" cy="${cy(m.s)}" r="9.5" class="fb-mark ${m.cls || ''}"/>`;
    if (m.label) s += `<text x="${cx(m.f)}" y="${cy(m.s) + 4}" text-anchor="middle" class="fb-mark-txt">${m.label}</text>`;
  }
  return `${s}</svg>`;
}

// ─────────────── Tablatura ───────────────

export function tabSvg(notes, current = -1) {
  const cw = 30;
  const x0 = 26;
  const y0 = 14;
  const sh = 16;
  const width = x0 + notes.length * cw + 10;
  let s = `<svg class="tab" viewBox="0 0 ${width} ${y0 + sh * 5 + 14}" width="${width}" height="${y0 + sh * 5 + 14}">`;
  'eBGDAE'.split('').forEach((l, i) => {
    s += `<text x="4" y="${y0 + i * sh + 4}" class="tab-l">${l}</text>`;
    s += `<line x1="${x0 - 6}" x2="${width - 4}" y1="${y0 + i * sh}" y2="${y0 + i * sh}" class="tab-line"/>`;
  });
  notes.forEach((n, i) => {
    const x = x0 + i * cw + cw / 2;
    const y = y0 + (n.s - 1) * sh;
    const cls = i < current ? 'done' : i === current ? 'cur' : '';
    s += `<rect x="${x - 10}" y="${y - 8}" width="20" height="16" rx="4" class="tab-bg ${cls}"/>`;
    s += `<text x="${x}" y="${y + 5}" text-anchor="middle" class="tab-n ${cls}">${n.f}</text>`;
  });
  return `${s}</svg>`;
}

// ─────────────── Gráfica de evolución ───────────────

export function sparkSvg(points, { target, lower = false, w = 280, hgt = 70 } = {}) {
  if (!points.length) return '';
  const vals = points.concat(target != null ? [target] : []);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max === min) { max += 1; min -= 1; }
  const pad = 6;
  const X = (i) => pad + (points.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (points.length - 1));
  const Y = (v) => {
    const t = (v - min) / (max - min);
    return pad + (lower ? t : 1 - t) * (hgt - 2 * pad);
  };
  let s = `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">`;
  if (target != null) s += `<line x1="0" x2="${w}" y1="${Y(target)}" y2="${Y(target)}" class="spark-target"/>`;
  s += `<polyline points="${points.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" class="spark-line"/>`;
  points.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" class="spark-dot"/>`; });
  return `${s}</svg>`;
}

/** "25 cambios/min", "80% a tiempo", "45 s", "★★★". */
export function metricText(def, v) {
  const { unit, label } = def.metric;
  if (unit === '%') return `${Math.round(v)}% ${label.replace(/^% ?/, '')}`;
  if (unit === 's') return `${Math.round(v)} s`;
  if (unit === '★') return Math.round(v) ? '★'.repeat(Math.round(v)) : '0 ★';
  return `${Math.round(v * 10) / 10} ${label}`;
}
