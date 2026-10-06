# Hábitos

Seguimiento de hábitos en HTML, CSS y JavaScript vanilla. Sin dependencias, sin
build, sin servidor: los datos viven en el `localStorage` del navegador.

Versión documentada: **1.7.2** · esquema de datos **v10**.

El sistema de experiencia, niveles, rangos, logros y rachas tiene su propio
documento con el detalle completo: [`PROGRESION.md`](PROGRESION.md).

## Archivos

```
index.html          Marcado completo: vistas, modales y navegación
manifest.json       Metadatos PWA
sw.js               Service worker (caché offline)
icon.svg            Icono de la app
.gitignore
css/styles.css      Estilos, en secciones numeradas y comentadas
js/utils.js         Fechas, DOM, catálogos (categorías, motivos) y la versión
js/store.js         localStorage, saneado, migraciones y escritura de datos
js/stats.js         Rachas, porcentajes, EXP, niveles, rangos y logros
js/ui.js            Todo lo que toca el DOM: pintado de vistas y modales
js/app.js           Orquestación: eventos, reparto de EXP, exportación, arranque
README.md           Este documento
PROGRESION.md       Referencia del sistema de progresión
```

La dependencia va en una sola dirección: `utils → store → stats → ui → app`.
Los `<script>` deben cargarse en ese orden.

---

## Las pantallas

La barra de navegación tiene cinco secciones: **Hoy · Histórico · Ejercicios ·
Notas · Ajustes**. Progreso no está en ella: se abre desde la chapa de nivel y
rango de arriba a la derecha.

**Cabecera.** El día que estás mirando en grande, con flechas para ir hacia
atrás y un calendario para saltar a cualquier fecha. A la izquierda, el
contador `◆` de la racha de cumplimiento; a la derecha, la chapa con nivel,
rango y EXP. Debajo, la barra del día con su cuenta (`5/9`).

**Hoy.** Los hábitos del día agrupados por categoría. Los ya cumplidos se
apartan a un cajón plegado al final. Debajo: los hábitos en pausa, el botón
*Anotar el día* y la nota del día.

**Histórico.** La semana en rejilla (hábito × día), los totales de los hábitos
por cantidad, el cumplimiento de la semana y del mes, el calendario en vista
de mes o de año y la gráfica de evolución.

**Ejercicios.** La rutina que toca, con sus ejercicios, las series apuntadas,
el récord de cada uno y el contador de descanso entre series. *Gestionar*
despliega la tabla para editar rutinas y ejercicios.

**Notas.** Un campo para escribir la nota de hoy, un buscador y todas tus notas
de día en orden, cada una con cómo fue ese día. Tocar una lleva a ese día.

**Ajustes.** Apariencia, qué se ve en Hoy, entrenamiento, la lista de todos tus
hábitos (con archivados y pausados), copia de seguridad y la información de la
instalación.

**Progreso** (desde la chapa). Nivel y rango, los cinco atributos, las dos
rachas, el historial de ascensos, las rachas por hábito, los días sin caer en
los hábitos a evitar y los logros.

**Ficha de un hábito** (tocando su icono o su nombre). Estadísticas, totales,
calendario del mes, cumplimiento por día de la semana y los botones de editar,
pausar, archivar y eliminar.

---

## Instalación

### En este ordenador

Doble clic en `index.html`. Funciona con `file://` porque los scripts son
clásicos, no módulos ES (los módulos fallarían por CORS al abrir un archivo).

Comprueba que guarda: marca un hábito, cierra el navegador y vuelve a abrir. Si
sale el aviso "El navegador bloquea el almacenamiento", ese navegador no permite
`localStorage` sobre `file://` — usa otro, o sírvelo desde `localhost`.

### En el móvil

Copiar la carpeta al teléfono **no sirve**: Android e iOS no permiten instalar
una app desde archivos locales. Hace falta una URL `https://`. Los datos siguen
siendo tuyos y locales — el servidor solo entrega HTML, CSS y JS; tus hábitos
nunca salen del dispositivo.

**Con GitHub Pages** (gratis, permanente):

1. Crea un repositorio público en [github.com](https://github.com), por ejemplo
   `habitos`.
2. En el repositorio, *Add file → Upload files*.
3. Entra **dentro** de la carpeta del proyecto, selecciona todo (`Ctrl+A`) y
   arrástralo: los archivos sueltos y las carpetas `css` y `js`.

   > No arrastres la carpeta entera desde fuera. Si lo haces, los archivos
   > quedan un nivel más abajo, Pages no encuentra el `index.html` y la
   > dirección acaba siendo `usuario.github.io/habitos/Habitos/`.

4. *Commit changes*.
5. **Settings → Pages**: rama `main`, carpeta `/ (root)`. Guarda.
6. Al minuto aparece la URL: `https://TU-USUARIO.github.io/habitos/`.

En el móvil, abre esa URL y añádela a la pantalla de inicio:

- **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* o *Instalar app*.
- **iPhone (Safari)**: botón compartir → *Añadir a pantalla de inicio*.

> El repositorio es público: cualquiera puede ver el **código**, pero nadie
> puede ver tus **datos**, que están solo en tu navegador.

**PC y móvil son instalaciones independientes y no se sincronizan.** Para pasar
datos de uno a otro: *Ajustes → Exportar JSON* en el origen y *Ajustes →
Importar* en el destino. Importar **reemplaza** todo lo que haya en el destino.

### Publicar una versión nueva

1. Sube el número de versión en los **tres** sitios (ver abajo).
2. En GitHub, *Add file → Upload files* y arrastra **la carpeta entera por
   dentro**, igual que la primera vez. GitHub sustituye los archivos que
   cambian.
3. *Commit changes*.

**Sube siempre todos los archivos, no sueltos.** Un `index.html` de una versión
con los `.js` de otra deja la app pintada pero sin responder. Desde la 1.6.7 la
app lo detecta y lo avisa en pantalla, pero es mejor no llegar ahí.

### La versión, en tres sitios

| Dónde | Qué |
|---|---|
| `js/utils.js` | `VERSION` y `BUILD_DATE` — la fuente de verdad |
| `sw.js` | `CACHE = 'habitos-vX.Y.Z'` — un service worker no puede leer `utils.js` |
| `index.html` | `data-build="X.Y.Z"` en la etiqueta `<html>` |

Los tres tienen que coincidir, y están separados a propósito para que un
desajuste se note en vez de pasar en silencio:

- Si `data-build` no coincide con `VERSION`, al arrancar sale *"El navegador ha
  mezclado versiones… Recarga forzando: Ctrl + Mayús + R"*.
- Si la caché del service worker es de otra versión, **Ajustes → Esta
  instalación** lo dice en ámbar con cómo arreglarlo. Es la causa habitual de
  "he subido los cambios y el móvil no los ve".
- Cuando el service worker nuevo releva al viejo con la página abierta, la app
  se recarga sola una vez para no quedarse con archivos de dos versiones.

Formato `MAYOR.MENOR.PARCHE`: parche para correcciones y retoques, menor para
funcionalidad nueva compatible, mayor para rediseños o datos incompatibles.

---

## Personalización

### Colores y forma

Todo el aspecto sale de las variables del bloque `:root` en `css/styles.css`
(sección 1). Las principales:

| Variable | Qué controla |
|---|---|
| `--bg`, `--bg-elevated` | Fondo de la página y de los paneles elevados |
| `--surface`, `--surface-2`, `--surface-3`, `--card-bg` | Tarjetas, campos y hover |
| `--border`, `--border-strong` | Separadores y bordes |
| `--text`, `--text-muted`, `--text-faint` | Los tres niveles de texto |
| `--accent` y derivados | Color principal (lo reescribe `applyAccent()`) |
| `--success`, `--warning`, `--danger`, `--streak`, `--frost` | Colores semánticos |

Otras palancas: `--radius*`, `--sp-1`…`--sp-6`, `--fs-xs`…`--fs-2xl`, `--dur` y
`--ease`, `--nav-h`, `--rail-w` y `--content-max`.

**El acento** se cambia desde Ajustes. `HT.utils.ACCENTS` lista los colores y
`DEFAULT_ACCENT` es el de partida. `UI.applyAccent()` deriva de él
`--accent-hover`, `--accent-text`, `--accent-soft` y la rampa `--heat-*`, y lo
ajusta al tema: lo aclara sobre oscuro y lo oscurece sobre claro.

**Tema claro** (sección 1b): solo redefine tokens; ningún componente sabe en qué
tema está. **Tamaño de letra** (sección 1c): cuatro escalones que reescriben los
seis `--fs-*` a la vez. **Tamaño de los controles**: compacto, cómodo o amplio,
vía `data-controls` en `<html>`.

### El tema de Progreso

Progreso tiene su propia piel de ventana del System, **confinada a
`#view-progress`** en la sección 8d. Redefine sus `--sys-*`, su rampa
`--heat-*` y también los tokens de texto y superficie, para que se vea igual en
tema oscuro y en tema claro. Ninguna otra pantalla hereda nada de ahí; para
quitar el tema basta con borrar ese bloque.

Fuera de Progreso hay dos piezas que usan el mismo lenguaje a propósito: la
chapa de rango de la cabecera (colores por tramo con `[data-rank]`) y el
contador `◆` de la racha.

### Puntos de corte

- **≤ 420px** — la chapa de la cabecera esconde la EXP y deja nivel y rango.
- **< 768px** — dos tarjetas de hábito por fila, navegación inferior fija,
  modales como hoja inferior.
- **≥ 768px** — más aire entre tarjetas, estadísticas en fila de cuatro,
  modales centrados.
- **≥ 1024px** — la barra inferior pasa a raíl lateral reescribiendo las áreas
  del grid de `.app-shell`, y las tarjetas se reparten en tantas columnas como
  quepan (mínimo 320px cada una). No hay marcado duplicado.
- **≥ 1440px** — el contenido gana ancho máximo.

### Catálogos

| Qué | Dónde |
|---|---|
| Categorías de hábito | `CATEGORIES` en `js/utils.js` |
| Motivos de pausa | `PAUSE_REASONS` en `js/utils.js` |
| Motivos de un día flojo | `DAY_REASONS` en `js/utils.js` |
| Iconos sugeridos | `EMOJI_GROUPS` al principio de `js/ui.js` |
| Hábitos de partida | `defaultState()` y `AVOID_SEED` en `js/store.js` |
| Tabla de ejercicios de partida | `seedWorkout()` en `js/store.js` |
| Opciones con más de dos valores | `CONTROLS`, `FONT_SIZES`, `REST_SECONDS`, `STREAK_GOALS` en `js/store.js` |

Los catálogos de opciones están en el almacén y no solo en el HTML para que el
saneado y el desplegable no puedan discrepar. Los iconos sugeridos son arrays de
emoji, no cadenas que luego se parten: `🏋️` ocupa dos unidades UTF-16.

Los hábitos y la tabla de partida solo se usan la primera vez que se abre la
app; después manda lo guardado.

---

## Estructura de datos

Una sola clave, `habitTracker.v1`:

```jsonc
{
  "version": 10,
  "settings": {
    "accent": "#4361ee", "effects": true,
    "theme": "dark",                  // "dark" | "light"
    "fontSize": "normal",             // "small" | "normal" | "large" | "xlarge"
    "controls": "compact",            // "compact" | "comfy" | "roomy"
    "hideDone": true, "showBadges": true,
    "showDayBar": true, "showNotes": true, "showFreeze": true,
    "backupDays": 14,                 // aviso de copia: 0, 7, 14 o 30 días
    "restSeconds": 150,               // 0, 90, 120, 150, 180, 240 o 300
    "streakGoal": "2",                // "1" | "2" | "3" | "quarter" | "half"
    "weekStart": 1,                   // fijo en lunes desde la 1.6.5
    "notificationsEnabled": false     // sin uso desde la 1.6.8
  },
  "habits": [{
    "id": "h_k3f9", "name": "Lectura", "icon": "📖", "color": "#e879f9",
    "category": "aprendizaje",        // "fisico" | "mental" | "aprendizaje" | "evitar" | null
    "type": "quantity",               // "check" | "quantity" | "schedule" | "avoid"
    // solo quantity · entry: "stepper" (botones + y −) o "manual" (escribir el total)
    "target": { "amount": 10, "unit": "páginas", "step": 1, "entry": "stepper" },
    "slots": null,                    // schedule y avoid: "morning" | "afternoon" | "night"
    "limit": null,                    // solo avoid: fallos del día hasta "crítico"
    "activeDays": [0, 1, 2, 3, 4, 5, 6],   // 0 = domingo
    "createdAt": "2026-09-15",
    "archived": false,
    // tramos [from, to): "to" es el día en que se reanudó, null si sigue en pausa
    "pauses": [{ "from": "2026-09-13", "to": "2026-09-19", "reason": "vacaciones", "note": "" }],
    "reminder": { "enabled": false, "time": "08:00" }   // sin uso desde la 1.6.8
  }],
  "logs": {
    // check → true · quantity → número · schedule → { "night": true }
    // avoid → número de fallos del día; con franjas, en cuáles se falló
    "h_k3f9": { "2026-09-15": 12 }
  },
  "notes": { "2026-09-15": "Día raro, pero saqué el rato de leer." },
  "frozen": {
    // marcas de día: el motivo es gratis; "skip": true cuesta un comodín
    "2026-09-20": { "reason": "energia", "note": "", "skip": false },
    "2026-09-12": { "reason": null,      "note": "", "skip": true }
  },

  // Entrenamiento. Las rutinas se alternan en el orden del array.
  "routines":  [{ "id": "r_1", "name": "Empuje" }],
  "exercises": [{ "id": "e_1", "name": "Flexiones", "routineId": "r_1",
                  "kind": "reps", "sets": 4, "target": 12, "archived": false }],
  "sessions":  { "2026-09-16": { "routineId": "r_1", "done": true,
                                 "sets": { "e_1": [12, 11, 9] } } },
  "workout":   { "lastRoutineId": "r_1", "linkedHabitId": "h_xxx" },

  "game": {
    "points": 1240,                   // acumulador de EXP; nivel y rango se derivan
    "achievements": ["first_step"],
    "bestStreak": 12,                 // mejor racha de un solo hábito
    "habitsCreated": 0,               // los de partida no cuentan
    "avoidXpPaid": 50,                // EXP de hitos de "evitar" ya cobrada
    "lastExport": "2026-09-30",
    "levelLog": [{ "level": 1, "date": "2026-09-16" }],
    "levelLogFrom": 0,                // nivel desde el que el registro es fiable
    "freezes": 2,                     // comodines disponibles (máx. 4)
    "freezeWeek": "2026-09-28"        // lunes de la última recarga semanal
  }
}
```

`logs` está indexado por hábito y luego por fecha, así que consultar un día es
un acceso directo. Las fechas son `YYYY-MM-DD` **en hora local**:
`toISOString()` convertiría a UTC y apuntaría en el día equivocado a quien marque
un hábito de madrugada.

`frozen` conserva su nombre aunque ya no signifique solo "congelado": es lo que
está escrito en el almacén de todos los usuarios. El resto de la app no lo lee
directamente — pregunta a `S.isFrozen()` (¿el día queda fuera de las rachas?) y
a `S.getDayMark()` (la marca completa).

### Saneado y migraciones

Al arrancar, `cleanState()` valida todo lo que sale de `localStorage` y rellena
lo que falte. Si el JSON está roto, guarda el original en
`habitTracker.corrupt-backup` y empieza de cero.

Después se ejecutan las migraciones que tocan, según la versión guardada:

| Esquema | Migración | Qué hace |
|---|---|---|
| < 3 | `migrateToWorkout()` | Crea la tabla de calistenia y el hábito "Entrenar" |
| < 4 | `migrateToCategories()` | Asigna categoría a los hábitos que existían |
| < 5 | `migrateToScreenSlots()` | Pasa "Evitar pantallas" a franjas y convierte su histórico |
| < 6 | `migrateSeedTweaks()` | Bandera para Japonés, tope 1 para Gula y Lujo |
| < 8 | `migrateNewDefaults()` | Controles compactos y "apartar cumplidos" por defecto |

Las versiones 7 (`levelLog`), 9 (`pauses`) y 10 (marcas de día) no necesitan
migración propia: el saneado rellena los campos nuevos o, en el caso de la v10,
lee el `true` antiguo de `frozen` como "salvado sin motivo".

**Importar no ejecuta las migraciones**, solo el saneado. Comprobado que
importar exportaciones de los esquemas 6 a 9 da el mismo resultado que
cargarlas; con archivos anteriores no está verificado.

Comprobado al arrancar: estados guardados con los esquemas 4 a 9 se cargan sin
perder ningún dato (1.7.0), y el paso de la v9 a la v10 conserva los días
congelados como "salvados sin motivo" (1.7.2).

---

## Cómo extender

**Un tipo nuevo de hábito** — `cleanHabit()` y `cleanLogValue()` en `store.js`
(validación), `isComplete()` y `progressOf()` en `stats.js` (cuándo cuenta como
hecho), `buildCard()` y `paintCard()` en `ui.js` (cómo se pinta) y el manejador
de clics de la lista en `app.js`.

**Un campo nuevo en un hábito** — solo en `cleanHabit()`. Los hábitos de partida
también pasan por ahí (`mkHabit()` lo llama), así que no puede quedar fuera
ninguno. Fue justo ese descuido lo que dejó la app sin arrancar en una
instalación nueva entre la 1.6.6 y la 1.6.8.

**Una vista nueva** — una `<section class="view">` en el HTML, un botón en `.nav`
con su `data-view` (o ninguno, como Progreso), una entrada en `els.views` y otra
en `NAV_OF_VIEW` dentro de `ui.js`.

**Un elemento nuevo en el HTML** — su `id` en la lista de `UI.init()`. Si falta
en el HTML, la app ya no se cae: lo sustituye por un nodo suelto, sigue
funcionando y lo dice en la consola y en pantalla.

**Migrar el esquema** — subir `VERSION` en `store.js`, transformar en una función
`migrateXxx()` y llamarla en `load()` con su `if (incoming < N)`.

**Sincronización con un servidor** — `store.js` es la única capa que persiste.
Sustituir `writeNow()` y `load()` por llamadas de red deja intacto el resto.

---

## Decisiones que conviene conocer

- **Dos rachas, porque miden cosas distintas.** La de *cumplimiento* exige un
  mínimo de hábitos al día (ajustable); la de *registro* solo que apuntes algo,
  aunque sea por qué el día salió mal. Un día malo contado con honestidad
  mantiene la segunda y rompe la primera. Detalle en `PROGRESION.md`.
- **Anotar el motivo es gratis; salvar el día cuesta un comodín.** Si salvar
  fuera gratis, siempre habría un motivo y la racha no mediría nada. Los
  comodines se recargan uno por semana, hasta cuatro.
- **Pausar no es archivar.** Un hábito en pausa sale de Hoy y sus días no
  cuentan ni a favor ni en contra, así que la racha se queda donde estaba. Se
  guardan los tramos, no un "está en pausa": borrar el rastro al reanudar haría
  que aquellos días contaran como fallados semanas después.
- **El nivel no se guarda.** Se deriva de la EXP en cada pintado, así que cambiar
  la curva nunca corrompe datos.
- **La EXP se paga por diferencia.** Cada acción hace una foto antes y después y
  paga solo lo que cambió. Repetir algo ya cumplido vale 0, y deshacer devuelve
  exactamente lo que dio.
- **Escribir el valor es un modo de Cantidad, no un tipo aparte.** Pasos y
  minutos guardan el mismo dato; solo cambia cómo se introduce.
- **El entreno se contabiliza a través de un hábito.** Cerrar la sesión marca
  "Entrenar", y de ahí salen la EXP, la racha y el calendario. Una sola
  contabilidad en vez de dos sistemas que se ignoran.
- **Las rutinas van por rotación, no por día de la semana.** Si dejas de entrenar
  tres días, retomas donde lo dejaste.
- **Una sesión cerrada se bloquea.** Para tocar sus series hay que reabrirla.
- **Se puede registrar hacia atrás, nunca hacia delante.** Marcar mañana no
  significaría nada.
- **Las rachas perdonan el día en curso.** Se rompen cuando el día termina sin
  llegar al listón, no a las 00:01.
- **Los días sin nada programado no rompen rachas.** Un hábito de lunes a viernes
  sobrevive al fin de semana.
- **El calendario valora el progreso parcial.** 20 de 30 minutos tiñen la celda.
- **La gráfica distingue el cero del vacío.** Un día al 0% y un día sin hábitos
  no se pintan igual.
- **Cambiar el tipo de un hábito borra su histórico.** Un `1500` reinterpretado
  como check no significa nada.
- **El campo de Notas escribe siempre en hoy**, mires el día que mires: un
  diario se escribe en presente. La nota de la pantalla Hoy escribe en el día que
  tengas abierto.
- **No hay recordatorios.** Una página web solo puede avisar mientras está
  abierta, que es justo cuando no hace falta. Se quitaron en la 1.6.8 en vez de
  prometer algo que no se podía cumplir.

## Limitaciones

- Los datos son de este navegador y este dispositivo. Exporta a JSON para
  moverlos o guardarlos; la propia app te avisa cuando hace tiempo que no lo
  haces.
- Borrar los datos de navegación borra el historial de hábitos.
- Importar reemplaza, no fusiona.
- Sin notificaciones de ningún tipo.
- El icono de pantalla de inicio en iPhone necesita un PNG: iOS no admite el
  `icon.svg` actual como `apple-touch-icon`.
