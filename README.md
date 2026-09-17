# Hábitos

Seguimiento de hábitos en HTML, CSS y JavaScript vanilla. Sin dependencias, sin
build, sin servidor: los datos viven en el `localStorage` del navegador.

## Archivos

```
index.html          Marcado completo (vistas, modal, navegación)
manifest.json       Metadatos PWA
sw.js               Service worker (caché offline)
icon.svg            Icono de la app
css/styles.css      Estilos, en 13 secciones comentadas
js/utils.js         Fechas, DOM y utilidades puras
js/store.js         localStorage, CRUD y saneado de datos
js/stats.js         Rachas, porcentajes, niveles y logros
js/app.js           Orquestación: eventos, puntos, recordatorios, exportación
```

La dependencia va en una sola dirección: `utils → store → stats → ui → app`.
Los `<script>` deben cargarse en ese orden.

---

## Instalación

### En este ordenador

Doble clic en `index.html`. Funciona con `file://` porque los scripts son
clásicos, no módulos ES (los módulos fallarían por CORS al abrir un archivo).

Para tenerlo a mano: clic derecho en `index.html` → *Enviar a* → *Escritorio
(crear acceso directo)*, o arrastra la pestaña a la barra de marcadores.

Comprueba que guarda: marca un hábito, cierra el navegador y vuelve a abrir. Si
sale el aviso "El navegador bloquea el almacenamiento", ese navegador no permite
`localStorage` sobre `file://` — usa otro, o sírvelo desde `localhost`.

### En el móvil

Copiar la carpeta al teléfono **no sirve**: Android e iOS no permiten instalar
una app desde archivos locales. Hace falta una URL `https://`. Los datos siguen
siendo tuyos y locales — el servidor solo entrega HTML, CSS y JS la primera vez;
tus hábitos nunca salen del móvil.

**Con GitHub Pages** (gratis, permanente):

1. Crea una cuenta en [github.com](https://github.com) si no la tienes.
2. Botón **+** arriba a la derecha → *New repository*. Nombre: `habitos`.
   Marca **Public** y crea.
3. En el repositorio vacío, pulsa *uploading an existing file*.
4. Entra **dentro** de la carpeta `Habitos`, pulsa `Ctrl+A` y arrastra esa
   selección: los archivos sueltos y las carpetas `css` y `js`.

   > No arrastres la carpeta `Habitos` entera desde fuera. Si lo haces, los
   > archivos quedan un nivel más abajo, Pages no encuentra el `index.html` y
   > la dirección acaba siendo `usuario.github.io/Habitos/Habitos/`.

   Pulsa *Commit changes*.
5. Pestaña **Settings** → **Pages** (menú izquierdo). En *Branch* elige `main`
   y carpeta `/ (root)`. Guarda.
6. Espera un minuto y recarga: aparecerá tu URL,
   `https://TU-USUARIO.github.io/habitos/`.

En el móvil, abre esa URL y añádela a la pantalla de inicio:

- **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* o *Instalar app*.
- **iPhone (Safari)**: botón compartir → *Añadir a pantalla de inicio*.

Queda con su icono, a pantalla completa y funcionando sin conexión.

> El repositorio es público: cualquiera puede ver el **código**, pero nadie
> puede ver tus **datos**, que están solo en tu navegador.

**Importante**: PC y móvil son instalaciones independientes y **no se
sincronizan**. Para pasar datos de uno a otro: *Ajustes → Exportar JSON* en el
origen y *Ajustes → Importar* en el destino.

### Saber qué versión corre cada dispositivo

**Ajustes → Esta instalación** muestra tres datos: la versión (`v10 · 17/09/2026`),
el origen (`Archivo local` o el dominio) y el estado de la caché offline. Si la
caché guardada no coincide con la versión de la app, lo dice en ámbar con la
instrucción para arreglarlo — es la causa habitual de "he subido los cambios y
el móvil no los ve".

El número vive en `VERSION`, al principio de `js/utils.js`, **y hay que subirlo
también en `CACHE` de `sw.js`**. Están en dos sitios a propósito: si se
desincronizan, esa misma pantalla lo delata en lugar de callarse.

### Al cambiar el código

Si editas algo y ya lo tenías instalado como PWA, sube el número de `CACHE` en
`sw.js` (`habitos-v1` → `habitos-v2`). Si no, el navegador seguirá sirviendo la
versión antigua desde la caché. Es el error número uno con las PWA: juras que el
cambio no funciona y lo que pasa es que estás viendo la copia vieja.

---

## Trabajar con Git

Sin Git, cada cambio pisa el anterior y no hay vuelta atrás. Con Git tienes
historial, puedes deshacer, y publicar en el móvil pasa a ser un botón.

**Montarlo una vez:**

1. Instala [GitHub Desktop](https://desktop.github.com) e inicia sesión con tu
   cuenta de GitHub.
2. *File → Add local repository* → elige esta carpeta. Te dirá que no es un
   repositorio y te ofrecerá *create a repository*. Acepta.
3. Deja el nombre `Habitos`, marca **Git ignore: None** (ya hay un `.gitignore`)
   y pulsa *Create repository*.
4. Pulsa *Publish repository*. Desmarca *Keep this code private* si quieres usar
   GitHub Pages, que solo funciona con repositorios públicos en el plan gratuito.

**El día a día:** editas archivos, y GitHub Desktop lista los cambios solo. Le
escribes una frase de resumen abajo a la izquierda ("añadir vista de año"),
pulsas *Commit to main* y luego *Push origin*. Eso es todo.

**Para volver atrás:** en la pestaña *History* ves cada cambio. Clic derecho en
uno → *Revert changes in commit* y lo deshace sin borrar el historial.

Con el repositorio publicado, activar GitHub Pages (Settings → Pages → rama
`main`, carpeta `/ (root)`) hace que cada *push* actualice también el móvil.

---

## Personalización

### Colores y forma

Todo el aspecto sale de las variables del bloque `:root` en `css/styles.css`.
Cambiando estas diez repintas la app entera:

| Variable | Qué controla |
|---|---|
| `--bg`, `--bg-elevated` | Fondo de la página y del modal |
| `--surface`, `--surface-2`, `--surface-3` | Tarjetas, campos y estados hover |
| `--border`, `--border-strong` | Separadores y bordes |
| `--text`, `--text-muted`, `--text-faint` | Los tres niveles de texto |
| `--accent` | Color principal (botones, nivel, heatmap) |
| `--success`, `--warning`, `--danger`, `--streak` | Colores semánticos |

Otras palancas: `--radius*` (redondeo), `--sp-1`…`--sp-6` (espaciado),
`--fs-xs`…`--fs-2xl` (escala tipográfica), `--dur` y `--ease` (velocidad y
curva de todas las animaciones), `--nav-h`, `--rail-w` y `--content-max`
(métricas del layout).

El acento también se cambia desde **Ajustes** sin tocar código: se guarda en
`settings.accent` y se aplica como variable inline sobre `:root`, derivando de
paso los cuatro niveles del heatmap.

### El tema de la pantalla Progreso

Progreso tiene su propia piel, de panel de sistema RPG, y **está confinada al
selector `#view-progress`** en la sección 8d del CSS. Las variables `--sys-*` y
la rampa `--heat-*` se redefinen ahí dentro, así que ninguna otra pantalla
hereda nada: el resto de la app mantiene el acento elegido en Ajustes. Para
quitar el tema basta con borrar ese bloque.

El panel de nivel (`.sys-level`) vive en ese mismo bloque y reutiliza `.card`,
así que hereda el filo y las esquinas del resto de paneles.

### Breakpoints

Tres, en la sección 13 del CSS:

- **< 768px** — una columna, navegación inferior fija, modal como hoja inferior.
- **≥ 768px** — dos columnas de hábitos, estadísticas en fila de 4, modal centrado.
- **≥ 1024px** — la barra inferior se convierte en raíl lateral reescribiendo las
  áreas del grid de `.app-shell`. No hay marcado duplicado para móvil y escritorio.

### Iconos sugeridos

En `EMOJI_GROUPS`, al principio de `js/ui.js`. Son arrays de emoji, no cadenas
que luego se parten: `🏋️` ocupa dos unidades UTF-16 y `Array.from` lo rompería.
El campo de texto sigue admitiendo cualquier emoji pegado a mano.

### Tabla de ejercicios de partida

En `seedWorkout()` de `js/store.js`. Es un array de `[rutina, [[nombre, tipo,
series, objetivo], …]]` — añadir o cambiar ejercicios es editar esa lista. Solo
se usa la primera vez; después manda lo guardado.

### Hábitos por defecto

En `defaultState()` de `js/store.js`. Solo se usan la primera vez que se abre la
app; después manda lo guardado.

### XP, niveles y rangos

Todo vive en `js/stats.js` y ninguna vista repite estas cuentas: piden
`St.levelInfo(xp)` y pintan lo que devuelve.

| Constante | Qué es |
|---|---|
| `XP` | Tabla de recompensas: `habit` 10, `perfectDay` 5, `exercise` 10, `workout` 50, `allExercises` 25, `goal` 100. |
| `XP_TABLE` | XP total con la que empieza cada nivel, del 1 al 10. |
| `XP_STEP` (50) | Del 10 en adelante cada nivel cuesta `50·n` más que el anterior. La fórmula `25·n·(n+1) − 50` reproduce la tabla exacta, así que tabla y continuación empalman sin salto. |
| `RANKS` | Tramos de rango. Añadir uno es añadir una fila: gana la última cuyo `from` no supera el nivel. |
| `PERFECT_WEEK_MIN_DAYS` (5) | Días con actividad que exige "Semana perfecta". |
| `ACHIEVEMENTS` | Los 9 logros. Añadir uno son dos pasos: una entrada aquí y su condición dentro de `earnedAchievements()`. |

`levelInfo(xp)` devuelve nivel, rango, XP dentro del nivel, XP que falta y
porcentaje. Cambiar la curva de experiencia es tocar `XP_TABLE` y `XP_STEP`, y
nada más: el nivel **no se guarda**, se deriva de la XP, así que ningún cambio de
curva puede corromper datos.

**Dónde se guarda.** En `game.points` de `habitTracker.v1`. Conserva ese nombre
porque es el que ya está escrito en el almacén de los usuarios.

**Quién reparte.** `grantXp()` en `js/app.js`, único punto de entrada. Compara el
nivel antes y después, así la subida se detecta una sola vez y sin depender de
qué pantalla esté abierta. La presentación (`UI.showLevelUp`) va aparte: cambiar
la celebración no toca la regla.

**Por qué no se duplica.** `withScoring()` (hábitos) y `withWorkoutScoring()`
(ejercicios) hacen una foto del estado, ejecutan la acción y pagan solo la
diferencia. Repetir una acción ya cumplida vale 0, y deshacerla devuelve
exactamente lo que dio. Sin eso, marcar y desmarcar en bucle sería una máquina de
fabricar niveles.

En `store.js`, `MAX_FREEZES` (3) limita los comodines acumulables; se gana uno al
entrar en un mes nuevo.

### Color predeterminado

`HT.utils.ACCENTS` (en `js/utils.js`) lista los colores y `DEFAULT_ACCENT` marca
cuál manda. Ese valor es la única fuente: `store.js` lo usa como color de partida
y `UI.applyAccent()` deriva de él todos los tokens (`--accent`, `--accent-hover`,
`--accent-text`, `--accent-soft` y la rampa `--heat-*`). Ningún componente
escribe un color de marca a mano.

Los valores de `:root` en el CSS son solo lo que se ve antes de que arranque el
JS; en cuanto carga, `applyAccent()` los reescribe con el color guardado. Para
añadir la paleta completa basta con pintar un selector sobre `ACCENTS` — la tabla
ya tiene las cinco entradas.

### Versión

`VERSION` en `js/utils.js`, en formato `MAYOR.MENOR.PARCHE`. Es la fuente única y
**no se sube sola**: se cambia a mano al publicar. El único otro sitio donde
aparece es `CACHE` en `sw.js`, porque un service worker no puede leer ese
archivo; si se desincronizan, Ajustes → *Esta instalación* lo avisa en vez de
callarse.

- Parche `1.0.1` — correcciones y retoques visuales.
- Menor `1.1.0` — funcionalidad nueva compatible.
- Mayor `2.0.0` — rediseño o cambio de datos incompatible.

---

## Estructura de datos

Una sola clave, `habitTracker.v1`:

```jsonc
{
  "version": 2,
  "settings": {
    "weekStart": 1, "accent": "#4361ee",
    "notificationsEnabled": false, "effects": true
  },
  "habits": [{
    "id": "h_k3f9",
    "name": "Leer",
    "icon": "📖",
    "color": "#e879f9",
    "type": "quantity",              // "check" | "quantity" | "schedule" | "avoid"
    // solo quantity · entry: "stepper" (botones + y −) o "manual" (escribir el total)
    "target": { "amount": 20, "unit": "min", "step": 5, "entry": "stepper" },
    "slots": ["morning", "night"],                 // solo schedule
    "activeDays": [1, 2, 3, 4, 5],                 // 0 = domingo
    "reminder": { "enabled": true, "time": "08:00" },
    "createdAt": "2026-09-15",
    "archived": false
  }],
  "logs": {
    // check → true | quantity → número | schedule → {morning:true}
    // avoid → true, pero aquí true significa RECAÍDA, no logro: el día
    // sin registro es el día limpio.
    "h_k3f9": { "2026-09-15": 25 }
  },
  "notes":  { "2026-09-15": "Día raro, pero saqué el rato de leer." },
  "frozen": { "2026-09-12": true },   // días salvados con un comodín

  // Entrenamiento. Las rutinas se alternan en el orden del array.
  "routines":  [{ "id": "r_1", "name": "Empuje" }],
  "exercises": [{ "id": "e_1", "name": "Flexiones", "routineId": "r_1",
                  "kind": "reps", "sets": 4, "target": 12, "archived": false }],
  "sessions":  { "2026-09-16": { "routineId": "r_1", "done": true,
                                 "sets": { "e_1": [12, 11, 9] } } },
  "workout":   { "lastRoutineId": "r_1", "linkedHabitId": "h_xxx" },
  "game": {
    // "points" es el acumulador de XP; nivel y rango se derivan, no se guardan
    "points": 120, "achievements": ["first_step"], "bestStreak": 12,
    "habitsCreated": 6, "freezes": 2, "freezeMonth": "2026-09"
  }
}
```

La versión 2 añadió `notes`, `frozen`, `settings.effects` y los comodines; la 3,
el bloque de entrenamiento. Los datos antiguos se leen sin problema:
`cleanState()` rellena lo que falte con valores por defecto. La única migración
con lógica propia es `migrateToWorkout()`, que crea la tabla de calistenia y el
hábito "Entrenar" a quien venía de la v2 — y solo si no hay nada, para no
repoblar una tabla que se vació a propósito.

`logs` está indexado por hábito y luego por fecha, así que consultar un día
concreto es un acceso directo en lugar de un recorrido. Las fechas son
`YYYY-MM-DD` **en hora local**: `toISOString()` convertiría a UTC y registraría
en el día equivocado a quien marque un hábito de madrugada.

Al arrancar, `cleanState()` valida todo lo que sale de `localStorage`. Si el JSON
está roto, guarda el original en `habitTracker.corrupt-backup` y empieza de cero.

---

## Cómo extender

**Un tipo nuevo de hábito** — toca cuatro puntos: `cleanHabit()` y
`cleanLogValue()` en `store.js` (validación), `isComplete()` y `progressOf()` en
`stats.js` (cuándo cuenta como hecho), `buildCard()` y `paintCard()` en `ui.js`
(cómo se pinta) y `onHabitListClick()` en `app.js` (qué hace al pulsar).

**Una vista nueva** — una `<section class="view">` en el HTML, un botón en `.nav`
con su `data-view`, y una entrada en `els.views` dentro de `UI.init()`.

**Sincronización con un servidor** — `store.js` es la única capa que persiste.
Sustituir `writeNow()` y `load()` por llamadas de red deja intacto el resto.

**Migrar el esquema** — subir `VERSION` en `store.js` y transformar los datos
antiguos dentro de `cleanState()` antes de validarlos.

---

## Decisiones que conviene conocer

- **Escribir el valor es un modo de Cantidad, no un tipo aparte.** Un hábito de
  pasos y uno de minutos guardan el mismo dato y se miden igual; lo único que
  cambia es cómo lo introduces. Hacerlo un cuarto tipo habría duplicado la misma
  lógica en el saneado, las rachas, el heatmap y la exportación.
- **El entreno se contabiliza a través de un hábito, no en paralelo.** Cerrar la
  sesión marca el hábito "Entrenar", y de ahí salen los puntos, la racha y el
  heatmap. Así hay una sola contabilidad en vez de dos sistemas que se ignoran.
  Si borras ese hábito, Ejercicios sigue funcionando pero deja de puntuar.
- **Las rutinas van por rotación, no por día de la semana.** Al cerrar un
  entreno pasa el turno a la siguiente. Si dejas de entrenar tres días, retomas
  donde lo dejaste en vez de desalinearte.
- **Una sesión cerrada se bloquea.** No se pueden añadir ni quitar series
  mientras está cerrada: hay que reabrirla. Evita tocar por error el histórico
  de un entreno ya terminado.
- **La vista de Semana es plan y marcador a la vez.** La misma rejilla dice qué
  hábito toca cada día y cómo llevas la semana. Separarlo en dos pantallas
  obligaría a comparar de memoria.
- **Editar, archivar y eliminar viven en la ficha del hábito.** Se entra tocando
  su icono o su nombre en la tarjeta. Allí están los tres botones arriba a la
  derecha: lápiz, caja y papelera.
- **La gráfica distingue el cero del vacío.** Un día al 0% muestra su carril de
  fondo vacío; un día sin hábitos, o que aún no ha llegado, no muestra nada. Son
  dos cosas distintas y pintarlas igual sería mentir sobre el dato.
- **Se puede registrar hacia atrás, nunca hacia delante.** Las flechas de la
  cabecera y las celdas del calendario llevan a cualquier día pasado para
  rellenarlo. El futuro está bloqueado: marcar mañana no significaría nada.
- **Los comodines vuelven neutro un día, no lo aprueban.** Un día congelado no
  cuenta como cumplido, pero tampoco corta la racha. Es la diferencia entre
  perdonar un tropiezo y falsear el historial.
- **Las rachas perdonan el día en curso.** Si hoy aún no has hecho ejercicio
  sigues viendo tu racha, no un cero. Se rompe cuando el día termina sin marcar.
- **Los días inactivos no rompen la racha.** Un hábito de lunes a viernes
  sobrevive al fin de semana.
- **El heatmap valora el progreso parcial.** 20 de 30 minutos tiñen la celda;
  no es todo o nada.
- **Cambiar el tipo de un hábito borra su histórico.** Un `1500` reinterpretado
  como check no significa nada, y prefiero perder el dato a mentir en las
  estadísticas. La app avisa al guardar.
- **Los recordatorios solo funcionan con la pestaña abierta.** Se programan con
  `setTimeout`; avisar con la app cerrada exigiría Push API y un servidor.

## Limitaciones

- Los datos son de este navegador y este dispositivo. Exporta a JSON para
  moverlos o guardarlos.
- Borrar los datos de navegación borra el historial de hábitos.
- Sin notificaciones en segundo plano (ver arriba).
