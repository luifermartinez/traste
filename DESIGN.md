---
name: Traste
description: Sistema personal para aprender guitarra; la app toma el color del calibre de púa de tu etapa.
colors:
  gauge-050-red: "#c8392a"
  gauge-060-orange: "#e2762b"
  gauge-073-yellow: "#ebbd2c"
  gauge-088-green: "#33804a"
  gauge-100-blue: "#2d5da6"
  gauge-114-purple: "#6b3f92"
  ground: "#eeeeeb"
  surface: "#ffffff"
  surface-2: "#f5f5f2"
  line: "#e0dfda"
  ink: "#1b1b1a"
  ink-muted: "#64635d"
  ok: "#2b7d46"
  bad: "#b3261e"
  ground-dark: "#141414"
  surface-dark: "#1e1e1d"
  ink-dark: "#f1f0ec"
typography:
  stage:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.05
  title:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1.95rem"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1.5625rem"
    fontWeight: 600
    lineHeight: 1.18
  subhead:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  number:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  sm: "12px"
  md: "16px"
  pill: "999px"
spacing:
  page: "18px"
  card: "18px"
  row: "13px 16px"
components:
  button-primary:
    backgroundColor: "{colors.gauge-050-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "48px"
  list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.row}"
  segmented:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
---

# Design System: Traste

## Overview

**Creative North Star: "Calibre"**

Las púas Tortex tienen un color por grosor: .50 rojo, .60 naranja, .73 amarillo, .88 verde, 1.0 azul, 1.14 morado. Traste tiene seis etapas, así que cada etapa es un calibre y la app entera toma el color de la púa que has alcanzado. Avanzar es literalmente cambiar de color.

Es una app de práctica: se lee a medio metro con la guitarra en las manos. El mundo solo aporta color, una tipografía redondeada y un gesto propio (la púa estampada con su calibre); la navegación, las listas y los controles son los estándar.

**Key Characteristics:**
- Un solo calibre de color por pantalla, ocupando regiones enteras.
- Suelo neutro plano; tema claro u oscuro según el sistema.
- Una sola familia tipográfica, Rubik, de 400 a 700.
- La púa estampada es la única ilustración.

## Colors

Seis calibres saturados y mate sobre neutros sin tinte; solo uno activo a la vez.

### Primary
- **Calibre de la etapa** (`--g`, uno de los seis): campo superior de Hoy, botón primario, pestaña activa, barras de progreso, paso actual de la sesión, nota actual de la tablatura, golpe actual del ritmo. Lo fija `html[data-gauge]` según la etapa actual.
- **Calibre .50 rojo** (#c8392a) · **.60 naranja** (#e2762b) · **.73 amarillo** (#ebbd2c) · **.88 verde** (#33804a) · **1.0 azul** (#2d5da6) · **1.14 morado** (#6b3f92). Texto encima: blanco salvo en naranja y amarillo, que llevan tinta oscura (#1b1b1a).

### Neutral
- **Suelo** (#eeeeeb / oscuro #141414): fondo de la app.
- **Superficie** (#ffffff / #1e1e1d): listas, tarjetas, barra de pestañas.
- **Superficie 2** (#f5f5f2 / #262625): pistas de barras, controles segmentados, tablatura, fichas de iconos.
- **Línea** (#e0dfda / #2f2f2d): separadores de filas.
- **Tinta** (#1b1b1a / #f1f0ec) y **tinta suave** (#64635d / #a7a59e).

### Semánticos
- **Bien** (#2b7d46 / #6cc48a): afinado, acierto, habilidad superada, mejoras.
- **Mal** (#b3261e / #f2867a): fallo, error de micrófono, borrar.
- **Aviso** (#9a6512 / #e7b04a): golpe cerca pero no justo.

### Named Rules
**The One Gauge Rule.** Cada pantalla usa un único calibre. Los seis solo aparecen juntos en la fila de púas de la Ruta.

**The Whole Region Rule.** El calibre llena regiones (el campo de Hoy, un botón, una barra), no se reparte en acentos sueltos.

## Typography

**Familia única:** Rubik (autoalojada, eje 400–700), con `system-ui` de respaldo.

### Hierarchy
- **Etapa** (600, 2.25rem, 1.05): "Etapa 1" en el campo de color.
- **Título** (600, 1.95rem, 1.12): título de cada pantalla.
- **Sección** (600, 1.5625rem, 1.18): "Sesión de hoy", títulos de ejercicio.
- **Subsección** (600, 1.25rem, 1.25): títulos dentro de lecciones y etapas.
- **Cuerpo** (400, 1rem, 1.5): texto; lecciones a 65ch como máximo.
- **Cifra** (600, 3.6–5.5rem, 1, numerales tabulares): resultados, contador de cambios, BPM.

### Named Rules
**The No Kicker Rule.** Nada encima de un título: el tipo de ejercicio, la etapa o el progreso van debajo o al lado.

**The Real Case Rule.** Nada en mayúsculas forzadas: en los acordes "Em" no es "EM".

## Layout

Columna única de 600px máximo con 18px de margen. Ritmo: secciones separadas 30px, filas de lista de 56px mínimo, tarjetas con 18px de relleno. El campo de color de Hoy sangra a todo el ancho de la columna. Barra de pestañas fija abajo; en sesión se oculta y aparece una barra superior con cerrar, nombre del bloque y reloj.

## Elevation & Depth

Profundidad por capas tonales (suelo → superficie) más una sombra suave para listas y tarjetas. En oscuro, solo una sombra mínima.

### Shadow Vocabulary
- **Superficie** (`box-shadow: 0 1px 2px rgba(27,27,26,.06), 0 6px 18px -10px rgba(27,27,26,.18)`): listas, tarjetas, encabezados de etapa.

### Named Rules
**The Flat Ground Rule.** Sin texturas, grano, degradados ni brillos.

## Shapes

Esquinas de 16px en superficies y 12px en controles; círculos para pasos numerados y puntos de estado. La única silueta propia es la púa (gota redondeada), usada como sello de calibre.

## Components

### Buttons
- **Forma:** 12px (14px en el botón grande de 56px).
- **Primario:** fondo del calibre, texto en su tinta; hover al calibre profundo.
- **Secundario:** superficie con borde de línea fuerte.
- **Fantasma:** sin fondo ni borde, texto suave.
- **Foco:** anillo de 3px del calibre al 55%.

### Segmented control
Fondo superficie 2, segmento activo en superficie con sombra leve y texto en tinta. Usado para la duración de la sesión, el compás y el objetivo semanal.

### Lists
Grupos de filas sobre superficie con separadores de 1px; cada fila: icono o paso numerado, título y subtítulo, valor o chevron a la derecha.

### Navigation
Barra inferior de cuatro pestañas (icono de línea + texto). Activa en el color del calibre.

### Pick stamp (signature)
La púa rellena del calibre con el grosor estampado (".50", "mm") en la tinta del calibre. Grande y recortada en el campo de Hoy; en fila de seis, unidas por la línea del recorrido, en la Ruta; pequeña en cada encabezado de etapa.

## Do's and Don'ts

### Do:
- **Do** tomar el color de `--g` para todo lo accionable o en curso de la pantalla.
- **Do** usar los colores semánticos (bien/mal/aviso) solo para estados.
- **Do** dibujar los iconos con el set de línea de la app (24px, trazo 1.75).
- **Do** mostrar los resultados como cifra grande seguida de su unidad.

### Don't:
- **Don't** mezclar dos calibres en una misma pantalla fuera de la Ruta.
- **Don't** poner etiquetas pequeñas encima de los títulos.
- **Don't** usar emojis ni caracteres Unicode como iconos.
- **Don't** dibujar amplificadores, perillas o vúmetros como decoración.
- **Don't** añadir texturas, grano, brillos o degradados de fondo.
