# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una sola persona: el dueño de la app, adulto hispanohablante que empieza la guitarra desde cero absoluto con una guitarra acústica de cuerdas metálicas. Practica 10–15 minutos, 3–4 días por semana. Mira la app a ratos de día y de noche: a veces con el móvil apoyado a medio metro mientras sostiene la guitarra, a veces con el móvil en la mano.

## Product Purpose

Sistema personal que decide qué practicar cada día y mide el progreso con números reales para que el avance sea visible. Metas a 6–12 meses: acompañar canciones cantando, tocar melodías y solos, y entender la música (teoría, oído, mástil). Éxito: el usuario practica con constancia semana tras semana y puede ver cuánto ha mejorado.

## Positioning

La app escucha la guitarra por el micrófono y convierte cada ejercicio en una medida (cambios por minuto, milisegundos de desfase con el metrónomo, notas por minuto, aciertos de oído) y arma la sesión del día según esas medidas. No es un catálogo de vídeos ni un juego de notas que caen.

## Operating Context

- Sesión diaria guiada: lección → afinar → foco técnico → repaso o teoría → música. Duraciones de 5 (exprés), 10, 15 o 20 minutos.
- Durante los ejercicios las manos están en la guitarra: la pantalla se lee a distancia y se toca poco (empezar, parar, valorar).
- Ruta de 6 etapas (de las primeras cuerdas al jazz y lo latino) con habilidades medibles.
- Herramientas sueltas: afinador, metrónomo, diccionario de acordes, calibración de micrófono, cápsula del tiempo (grabaciones mensuales).
- Racha por semanas cumplidas, no por días.

## Capabilities and Constraints

- PWA estática (HTML, CSS y JS sin framework ni compilación), publicada en GitHub Pages, funciona sin conexión.
- Micrófono vía Web Audio: detección de tono (YIN) y de golpes con discriminación del clic del metrónomo.
- Datos solo en el dispositivo (localStorage e IndexedDB), exportables a JSON.
- Notación configurable: Do Re Mi, C D E o ambas. En los nombres de acordes las mayúsculas importan ("Em" ≠ "EM").
- Todo el texto en español.

## Brand Commitments

Nombre: Traste. Sin emojis en la interfaz.

## Evidence on Hand

Sin testimonios, usuarios ni métricas externas. El único dato real es el historial local del usuario.

## Product Principles

- Siempre se termina tocando música, nunca solo ejercicios.
- Cada progreso se muestra con una cifra comparable con la anterior.
- Faltar un día no castiga: la constancia se mide por semanas.
- Lo que se lee mientras se toca debe leerse a medio metro.

## Accessibility & Inclusion

Legible a medio metro de distancia y en luz baja. Rechazos explícitos del usuario: que parezca un disfraz (objetos de música dibujados como decoración), que sea genérico (tarjetas grises iguales con un acento), que sea infantil (gamificación chillona) o que cueste leer.
