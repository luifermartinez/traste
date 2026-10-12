# Traste — tu sistema personal para aprender guitarra

Web app (PWA) que funciona en el móvil y en el PC, sin servidor ni cuentas. Escucha tu guitarra por el micrófono, te dice qué practicar cada día y mide tu progreso con números reales.

Diseñada para: **cero absoluto · guitarra acústica · 10–15 min · 3–4 días por semana**, con metas de acompañar canciones, tocar melodías/solos y entender la música.

---

## El método

### 1. Sesiones cortas con estructura fija
Cada sesión se arma sola según tu progreso:

| Bloque | Qué es | Por qué |
|---|---|---|
| **Aprende** | Lección nueva (solo cuando toca) | Desbloquea la práctica asociada en la misma sesión |
| **Afina** | Afinador que detecta cada cuerda | Una guitarra desafinada hace que todo suene mal |
| **Foco** | La habilidad técnica que más te acerca al siguiente paso | Prioriza lo no superado de tu etapa y rota para no repetir siempre lo mismo |
| **Repaso / Mente** | Alterna: una habilidad ya aprendida o teoría/oído | Mantener cuesta poco; entender acelera todo |
| **Música** | Melodía o tocar con la banda | **Siempre terminas tocando música**, nunca solo ejercicios |

Tamaños: 5 min (exprés, para días sin tiempo), 10, 15 o 20 min.

### 2. Todo se mide
Cada habilidad tiene una métrica objetiva y un objetivo:

- **Cambios de acorde**: cambios por minuto (el micrófono cuenta cada rasgueo).
- **Ritmo**: % de golpes a tiempo, medido en milisegundos contra el metrónomo. Te dice si tiendes a adelantarte o atrasarte.
- **Mástil**: notas correctas por minuto (la app pide una nota y escucha si la tocas).
- **Melodías**: fluidez en notas por minuto; la app espera a que toques cada nota y te avisa si fue más aguda o más grave.
- **Oído**: % de notas que encuentras en la guitarra al primer intento.
- **Teoría**: % de aciertos (las preguntas cambian cada vez).
- **Tocar con la banda**: autoevaluación de 1–3 estrellas; con 3 estrellas el tempo sube.

Las habilidades de ritmo y de tocar con la banda tienen una **escalera de tempo**: al cumplir el objetivo, la próxima vez el BPM sube.

### 3. Ruta de 6 etapas
1. **Primeros sonidos** — afinar, cuerdas, Mim y Lam, negras, Oda a la alegría.
2. **Tres acordes, mil canciones** — La, Re, Mi, corcheas, notas en cuerdas 1–2, primer oído.
3. **Los cuatro acordes del pop** — Sol, Do, rasgueo folk, notas en la 6ª cuerda, tríadas.
4. **Blues y tu primera escala** — 12 compases, shuffle, pentatónica menor, licks.
5. **Rock, power chords y cejilla** — punk, palm mute, Fa y Sim, campo armónico.
6. **Latino y jazz** — séptimas, ii–V–I, i–iv–V7, tresillo y contratiempo.

Una etapa se abre al superar el 80% de la anterior (y todas sus lecciones). Si ya sabes algo, en **Ruta** puedes abrir una etapa directamente.

Cada etapa es un calibre de púa con su color (.50 rojo, .60 naranja, .73 amarillo, .88 verde, 1.0 azul, 1.14 morado): la app entera toma el color de la etapa en la que estás.

### 4. Constancia sin culpa
- La **racha cuenta semanas**, no días: cumple tu objetivo semanal (3 por defecto) y la racha sigue.
- Una sesión cuenta si es completa o dura al menos 2 minutos. La exprés de 5 min cuenta.
- **"Esta semana mejoraste"** en Hoy compara tus mejores marcas con las de semanas anteriores.
- **Detective**: avisos automáticos si vas adelantado/atrasado en el ritmo o si una habilidad lleva 3 intentos sin récord.
- **Cápsula del tiempo**: graba 30 s cada mes y escucha la diferencia.
- XP, niveles e insignias.

---

## Consejos para que el micrófono te escuche bien
- Pon el móvil a 30–60 cm de la boca de la guitarra, en un sitio tranquilo.
- En los retos de **ritmo**, la primera vez la app mide la latencia de tu móvil escuchando sus propios clics (4 s de silencio). Con **auriculares** la medición es más precisa: calibra en *Herramientas → Calibrar → Tocando*.
- Durante los **4 clics de cuenta no toques**: la app los usa para aprender cómo suena el clic y no confundirlo con tus golpes.
- Si no detecta tus golpes, sube la **sensibilidad** (*Herramientas → Calibrar*). Si salta con ruidos, bájala.
- En los cambios de acorde siempre puedes contar a mano con el botón grande.

---

## Publicarla gratis para usarla en el móvil

El micrófono solo funciona en páginas **https** (o `localhost`), por eso hay que publicarla. Cualquier hosting de archivos estáticos sirve.

### Opción A — GitHub Pages
1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio **público** llamado `traste` (sin README).
3. En una terminal, dentro de esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Traste"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/traste.git
   git push -u origin main
   ```
   (Con GitHub CLI basta: `gh repo create traste --public --source=. --push`.)
4. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. En 1–2 minutos estará en `https://TU_USUARIO.github.io/traste/`.

### Opción B — Netlify Drop (sin terminal)
Entra en <https://app.netlify.com/drop> y arrastra esta carpeta. Te da una URL https al instante.

### Instalarla en el móvil
- **Android (Chrome)**: abre la URL → menú ⋮ → *Instalar app* / *Añadir a pantalla de inicio*.
- **iPhone (Safari)**: abre la URL → botón Compartir → *Añadir a pantalla de inicio*.

Funciona sin conexión una vez abierta. Si actualizas los archivos y vuelves a publicar, la versión nueva aparece la **segunda** vez que abres la app.

### Probar en el PC sin publicar
```bash
npx serve .            # o: python -m http.server 8000
```
y abre `http://localhost:3000` (o `:8000`). En el móvil por la IP de tu red **no** funcionará el micrófono (no es https).

---

## Tus datos
- Todo se guarda **solo en el navegador del dispositivo** (localStorage; las cápsulas en IndexedDB). No hay servidor ni cuentas.
- **Ajustes → Copia de seguridad → Exportar** descarga un `.json` con tu progreso. Úsalo para no perderlo o para pasarlo a otro dispositivo (**Importar**). Las grabaciones de la cápsula no se incluyen.

---

## Personalizarla
- **Contenido** (etapas, lecciones, habilidades, objetivos, melodías, progresiones): `js/curriculum.js`.
  - Melodías en formato `cuerda:traste*duración`, p.ej. `'1:0 1:3*2 2:1*.5'`.
  - Para que una habilidad sea más fácil o difícil, cambia `metric.target` o la escalera `ladder` (BPM).
- **Preguntas de teoría**: `js/theory.js`.
- **Acordes** (diagramas): `CHORDS` en `js/music.js`.
- **Patrones de rasgueo**: `PATTERNS` en `js/music.js`.
- **Cómo se arma cada sesión**: `js/session.js`.
- **Aspecto** (colores de calibre, tipografía, componentes): `styles.css`; las reglas del diseño están en `DESIGN.md`.

Si añades archivos nuevos, agrégalos también a la lista `FILES` de `sw.js` para que funcionen sin conexión.

## Estructura
```
index.html, styles.css, manifest.webmanifest, sw.js, icons/, fonts/ (Rubik, OFL)
PRODUCT.md, DESIGN.md  para quién es y reglas del diseño
js/app.js           vistas (Hoy, Ruta, Progreso, Herramientas, Ajustes) y ejecutor de sesión
js/session.js       generador adaptativo de la sesión diaria
js/store.js         progreso, XP, rachas, insignias (localStorage)
js/curriculum.js    ruta de aprendizaje
js/theory.js        generadores de preguntas
js/music.js         notas, acordes, escalas, patrones
js/audio.js         micrófono, detección de tono (YIN), metrónomo, sonido, calibración
js/mic-worklet.js   detector de golpes en tiempo real (separa tu rasgueo del clic)
js/capsules.js      grabaciones (IndexedDB)
js/activities/      cada tipo de ejercicio
```
