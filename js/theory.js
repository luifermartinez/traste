// Generadores de preguntas de teoría. Cada uno devuelve {q, options, answer, explain}.
import { pcName, chordName, getNotation, OPEN_MIDI, PC_EN, mod12, majorKeyChords, chordSym, DEGREES, pick, shuffle, fretMidi } from './music.js';

const NATURAL = [0, 2, 4, 5, 7, 9, 11];

function mc(q, correct, distractors, explain = '') {
  const pool = shuffle([...new Set(distractors)].filter((d) => d !== correct)).slice(0, 3);
  const options = shuffle([correct, ...pool]);
  return { q, options, answer: options.indexOf(correct), explain };
}

/** "Sol–Si–Re (G–B–D)" respetando la notación elegida. */
function names(pcs) {
  const es = pcs.map((p) => pcName(p, 'es')).join('–');
  const en = pcs.map((p) => pcName(p, 'en')).join('–');
  const mode = getNotation();
  return mode === 'es' ? es : mode === 'en' ? en : `${es} (${en})`;
}
const chords = (syms) => syms.map((s) => chordName(s, getNotation() === 'en' ? 'en' : 'es')).join(' – ');
const triad = (root, minor) => [root, root + (minor ? 3 : 4), root + 7].map(mod12);
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const DECKS = {
  cuerdas: [
    () => {
      const s = rand(1, 6);
      return mc(`¿Qué nota suena en la cuerda ${s} al aire?`, pcName(OPEN_MIDI[s]), [4, 9, 2, 7, 11, 0, 5].map((p) => pcName(p)), 'De la 6ª a la 1ª: Mi – La – Re – Sol – Si – Mi.');
    },
    () => mc('¿Cuál es la cuerda más gruesa y grave?', '6ª (Mi grave)', ['1ª (Mi agudo)', '3ª (Sol)', '4ª (Re)'], 'La 6ª es la más gruesa; la 1ª la más fina.'),
    () => mc('En una tablatura, la línea de ARRIBA es…', 'La cuerda 1 (Mi agudo)', ['La cuerda 6 (Mi grave)', 'El traste 1', 'La cuerda 3 (Sol)'], 'Arriba la más aguda, como si miraras la guitarra desde arriba al tocar.'),
    () => mc('En una tablatura, un "0" significa…', 'Tocar esa cuerda al aire', ['No tocar esa cuerda', 'Traste 10', 'Un silencio'], 'Para no tocar una cuerda se usa "x" o simplemente no aparece.'),
    () => mc('El afinador marca la aguja a la izquierda (grave). ¿Qué haces?', 'Tensar la cuerda', ['Aflojar la cuerda', 'Nada, está bien', 'Pasar a otra cuerda'], 'Grave = le falta tensión. Afina siempre subiendo hacia la nota.'),
    () => mc('¿Dónde se presiona la cuerda para que suene limpia?', 'Justo detrás del traste', ['Encima del traste de metal', 'En el centro entre dos trastes', 'Lo más lejos del traste posible'], 'Cerca del traste necesitas menos fuerza y no zumba.'),
    () => mc('En un diagrama de acorde, una "X" sobre una cuerda indica…', 'No tocar esa cuerda', ['Tocarla al aire', 'Usar el dedo 4', 'Hacer cejilla'], 'O = al aire, X = no se toca.'),
  ],
  naturales: [
    () => {
      const i = rand(0, 6);
      return mc(`¿Qué nota natural viene después de ${pcName(NATURAL[i])}?`, pcName(NATURAL[(i + 1) % 7]), NATURAL.map((p) => pcName(p)), 'Do Re Mi Fa Sol La Si… y vuelve a Do.');
    },
    () => mc('¿Entre qué notas naturales hay solo un semitono (1 traste)?', `${pcName(4)}–${pcName(5)} y ${pcName(11)}–${pcName(0)}`,
      [`${pcName(0)}–${pcName(2)} y ${pcName(7)}–${pcName(9)}`, `${pcName(2)}–${pcName(4)} y ${pcName(9)}–${pcName(11)}`, 'Entre todas'],
      'Entre las demás naturales hay un tono (2 trastes); en medio está el sostenido.'),
    () => {
      const s = pick([1, 2]);
      const f = rand(0, 3);
      const m = fretMidi(s, f);
      return mc(`Cuerda ${s}, traste ${f}: ¿qué nota es?`, pcName(m), [m - 1, m + 1, m + 2, m - 2].map((p) => pcName(p)), `La cuerda ${s} al aire es ${pcName(OPEN_MIDI[s])}; cada traste sube un semitono.`);
    },
    () => mc('Subir un traste equivale a subir…', 'Un semitono', ['Un tono', 'Una octava', 'Una quinta'], 'Dos trastes = un tono.'),
    () => mc(`¿Qué es ${pcName(6)}?`, `${pcName(5, 'es')} subido un semitono`, [`${pcName(5, 'es')} bajado un semitono`, 'Un acorde', `${pcName(5, 'es')} una octava arriba`], '# (sostenido) sube un semitono; ♭ (bemol) baja un semitono.'),
    () => mc('¿Cuántos trastes hay en una octava?', '12', ['7', '8', '10'], 'El traste 12 repite la nota al aire una octava más aguda.'),
  ],
  acordes: [
    () => {
      const root = pick([0, 7, 2, 9, 4, 5]);
      return mc(`¿Qué notas forman ${chordName(PC_EN[root])}?`, names(triad(root, false)),
        [names(triad(root, true)), names(triad(root + 2, false)), names([root, root + 4, root + 9].map(mod12))],
        'Tríada mayor: tónica + 4 semitonos (tercera mayor) + 3 semitonos (quinta).');
    },
    () => {
      const root = pick([9, 4, 2]);
      return mc(`¿Qué notas forman ${chordName(PC_EN[root] + 'm')}?`, names(triad(root, true)),
        [names(triad(root, false)), names(triad(root + 5, true)), names([root, root + 2, root + 7].map(mod12))],
        'Tríada menor: tónica + 3 semitonos (tercera menor) + 4 semitonos.');
    },
    () => mc(`De ${chordName('E')} a ${chordName('Em')}, ¿qué cambia?`, 'La tercera baja un semitono', ['La quinta sube un semitono', 'Cambia la tónica', 'Se añade una séptima'],
      `${pcName(8)} pasa a ${pcName(7)}: en la guitarra, levantas un dedo.`),
    () => {
      const root = pick([0, 7, 2, 9, 4]);
      return mc(`¿Cuál es la tercera de ${chordName(PC_EN[root])}?`, pcName(root + 4), [root + 3, root + 5, root + 7, root + 2].map((p) => pcName(p)), 'Tercera mayor = 4 semitonos sobre la tónica.');
    },
    () => {
      const root = pick([0, 7, 2, 9, 4]);
      return mc(`¿Cuál es la quinta de ${chordName(PC_EN[root])}?`, pcName(root + 7), [root + 5, root + 4, root + 9, root + 6].map((p) => pcName(p)), 'Quinta justa = 7 semitonos sobre la tónica.');
    },
    () => mc('¿Qué nota decide si un acorde es mayor o menor?', 'La tercera', ['La tónica', 'La quinta', 'La nota más aguda'], 'Tercera mayor (4 semitonos) = alegre; menor (3) = triste.'),
  ],
  penta: [
    () => mc(`Notas de ${pcName(9, 'es')} menor pentatónica:`, names([9, 0, 2, 4, 7]), [names([9, 11, 0, 2, 4]), names([9, 0, 4, 7, 11]), names([9, 1, 4, 6, 7])], 'Grados 1 ♭3 4 5 ♭7 de La.'),
    () => mc('Grados de la pentatónica menor:', '1 ♭3 4 5 ♭7', ['1 2 3 5 6', '1 ♭3 5 ♭7', '1 2 ♭3 4 5 ♭6 ♭7'], 'Cinco notas: la escala menor sin el 2 ni el ♭6.'),
    () => {
      const [pc, fret] = pick([[9, 5], [7, 3], [0, 8], [2, 10], [4, 12]]);
      return mc(`¿En qué traste de la 6ª cuerda empieza la posición 1 de ${pcName(pc)} menor pentatónica?`, String(fret),
        ['3', '5', '7', '8', '10', '12', '2'], 'La posición 1 empieza en la tónica sobre la 6ª cuerda. Es la misma forma movida.');
    },
    () => mc(`¿Qué acordes usa un blues de 12 compases en ${pcName(9, 'es')}?`, chords(['A7', 'D7', 'E7']), [chords(['A', 'D', 'G']), chords(['Am', 'Dm', 'Em']), chords(['A7', 'C7', 'G7'])], 'I7 – IV7 – V7.'),
    () => mc('¿Qué acorde suena en el compás 9 de un blues en La?', chordName('E7'), [chordName('A7'), chordName('D7'), chordName('G7')], 'Compases 9–12: V7 – IV7 – I7 – V7.'),
    () => mc('El shuffle se siente como…', 'Corcheas en swing: larga-corta', ['Corcheas iguales', 'Solo negras', 'Silencio en cada pulso'], 'Como tresillos con el del medio en silencio.'),
  ],
  campo: [
    () => {
      const key = pick([0, 7, 2, 9, 4]);
      const i = rand(0, 5);
      const all = majorKeyChords(key);
      const c = all[i];
      return mc(`En ${pcName(key)} mayor, ¿cuál es el acorde ${DEGREES[i]}?`, chordName(chordSym(c.pc, c.q)),
        all.filter((_, j) => j !== i && j < 6).map((x) => chordName(chordSym(x.pc, x.q))), 'Campo armónico mayor: I ii iii IV V vi vii°.');
    },
    () => mc('En el campo armónico mayor, ¿qué acordes son menores?', 'ii, iii y vi', ['I, IV y V', 'ii, V y vi', 'Solo el vi'], 'I, IV y V son mayores; vii° es disminuido.'),
    () => mc('Un power chord contiene…', 'Tónica y quinta (sin tercera)', ['Tónica, tercera y quinta', 'Tónica y tercera', 'Cuatro notas'], 'Sin tercera no es mayor ni menor.'),
    () => {
      const key = pick([7, 0, 2]);
      const ks = majorKeyChords(key);
      const prog = [0, 4, 5, 3].map((i) => chordSym(ks[i].pc, ks[i].q));
      return mc(`I–V–vi–IV en ${pcName(key)} mayor es…`, chords(prog),
        [chords([0, 3, 4, 5].map((i) => chordSym(ks[i].pc, ks[i].q))), chords([0, 4, 3, 1].map((i) => chordSym(ks[i].pc, ks[i].q))), chords([5, 3, 0, 4].map((i) => chordSym(ks[i].pc, ks[i].q)))],
        'La progresión más usada del pop.');
    },
    () => mc(`La nota que da nombre a ${chordName('G5')} está en…`, 'La cuerda 6, traste 3', ['La cuerda 5, traste 3', 'La cuerda 6, traste 5', 'La cuerda 4, traste 5'], 'La raíz del power chord es la nota más grave.'),
  ],
  septimas: [
    () => {
      const [q, ans] = pick([['7', '1 3 5 ♭7'], ['maj7', '1 3 5 7'], ['m7', '1 ♭3 5 ♭7']]);
      return mc(`¿Qué grados forman un acorde "${q}"?`, ans, ['1 3 5 ♭7', '1 3 5 7', '1 ♭3 5 ♭7', '1 ♭3 ♭5 ♭7'], '7 = dominante, maj7 = séptima mayor, m7 = menor séptima.');
    },
    () => {
      const key = pick([0, 7, 2, 5, 9]);
      const prog = (k) => [chordSym(k + 2, 'm7'), chordSym(k + 7, '7'), chordSym(k, 'maj7')];
      return mc(`ii–V–I en ${pcName(key)} mayor:`, chords(prog(key)),
        [chords([chordSym(key + 5, 'maj7'), chordSym(key + 7, '7'), chordSym(key, 'maj7')]), chords(prog(key + 7)), chords([chordSym(key + 2, '7'), chordSym(key + 7, 'm7'), chordSym(key, 'maj7')])],
        'ii menor 7 → V dominante → I maj7.');
    },
    () => {
      const [k, ans] = pick([[9, ['Am', 'Dm', 'E7']], [4, ['Em', 'Am', 'B7']], [2, ['Dm', 'Gm', 'A7']]]);
      return mc(`i–iv–V7 en ${pcName(k)} menor:`, chords(ans), [chords([ans[0], ans[1], ans[2].replace('7', 'm')]), chords(['C', 'F', 'G7']), chords([ans[1], ans[0], ans[2]])], 'El V7 es mayor aunque la tonalidad sea menor: da la tensión latina.');
    },
    () => mc('El tresillo agrupa 8 corcheas en…', '3 + 3 + 2', ['4 + 4', '2 + 2 + 2 + 2', '3 + 2 + 3'], 'Golpes en 1, "2 y" y 4.'),
    () => mc('El contratiempo se toca en…', 'Las "y" (entre pulsos)', ['Los pulsos 1 y 3', 'Todos los pulsos', 'Solo el 1'], 'Es el "chucu" del ska, el reggae y la cumbia.'),
  ],
};

/** n preguntas variadas del mazo (sin repetir generador consecutivamente). */
export function makeQuiz(deck, n = 8) {
  const gens = DECKS[deck];
  const out = [];
  let order = shuffle(gens);
  while (out.length < n) {
    if (!order.length) order = shuffle(gens);
    out.push(order.pop()());
  }
  return out;
}
