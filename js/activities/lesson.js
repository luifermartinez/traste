import { h, svgNode, chordCard, tabSvg, fretboardSvg } from '../ui.js';
import { icon } from '../icons.js';
import { parseTab, pcShort } from '../music.js';
import { strum, playNote, now } from '../audio.js';
import { isPassed } from '../store.js';
import { header } from './common.js';

export function mount(root, { def, onDone }) {
  const checks = [];
  const body = h('div', { class: 'lesson' });
  const done = h('button', { class: 'btn primary big', disabled: true, onclick: () => onDone({ lesson: true }) }, icon('check', { size: 18 }), 'Lección completada');
  const listen = (onclick) => h('button', { class: 'btn small ghost', onclick }, icon('play', { size: 14 }), 'Escuchar');
  const update = () => { done.disabled = !checks.every((c) => c.checked); };

  for (const b of def.content) {
    if (b.h) body.append(h('h3', null, b.h));
    else if (b.p) body.append(h('p', null, b.p));
    else if (b.list) body.append(h('ul', null, b.list.map((x) => h('li', null, x))));
    else if (b.tip) body.append(h('div', { class: 'tip' }, icon('bulb', { size: 18 }), h('span', null, b.tip)));
    else if (b.chords) {
      body.append(h('div', { class: 'chord-row' }, b.chords.map((c) => {
        const card = chordCard(c);
        card.append(listen(() => strum(c)));
        return card;
      })));
    } else if (b.tab) {
      const notes = parseTab(b.tab);
      body.append(h('div', { class: 'tab-wrap' }, svgNode(tabSvg(notes))),
        listen(() => notes.forEach((n, i) => playNote(n.midi, now() + 0.05 + i * 0.5, 0.5, 0.6))));
    } else if (b.fretboard) {
      const { from, to, notes, roots = [] } = b.fretboard;
      const marks = parseTab(notes).map((n) => ({ s: n.s, f: n.f, cls: roots.includes(n.midi) ? 'root' : '', label: pcShort(n.midi) }));
      body.append(h('div', { class: 'fb-wrap' }, svgNode(fretboardSvg({ from, to, marks }))));
    } else if (b.songs) {
      body.append(h('div', { class: 'songs' },
        h('div', { class: 'head' }, icon('music', { size: 18 }), 'Canciones reales con estos acordes'),
        h('p', { class: 'muted small' }, 'Busca "título + acordes" en cualquier web de acordes. Si la tonalidad no coincide, usa la cejilla (capo) o el transpositor de la web.'),
        h('ul', null, b.songs.map((s) => h('li', null, s)))));
    } else if (b.check) {
      body.append(h('h3', null, 'Antes de marcarla como hecha'));
      for (const txt of b.check) {
        const cb = h('input', { type: 'checkbox' });
        if (isPassed(def)) cb.checked = true;
        cb.addEventListener('change', update);
        checks.push(cb);
        body.append(h('label', { class: 'check' }, cb, h('span', null, txt)));
      }
    }
  }
  update();
  root.append(header(def), body, done);
  return () => {};
}
