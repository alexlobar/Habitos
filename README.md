# Hábitos

Seguimiento de hábitos en HTML, CSS y JavaScript vanilla. Sin dependencias, sin
build, sin servidor: los datos viven en el `localStorage` del navegador.

Versión documentada: **2.9.0** · esquema de datos **v18**.

El sistema de experiencia, niveles, rangos, logros y rachas tiene su propio
documento con el detalle completo: [`PROGRESION.md`](PROGRESION.md).

## Archivos

```
index.html          Marcado completo: vistas, modales y navegación
manifest.json       Metadatos PWA
sw.js               Service worker (caché offline)
icon.svg            Icono de la app (navegador y escritorio)
icon-180.png        Icono de pantalla de inicio en iPhone (iOS no admite SVG)
icon-192.png        Icono Android
icon-512.png        Icono Android
icon-maskable-512.png  Icono Android a sangre, para que el lanzador le dé su forma
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

La barra de navegación tiene cuatro secciones: **Hoy · Histórico · Notas ·
Ajustes**. (Ejercicios salió en la 2.2.0: el entreno se apunta en otra app y
aquí queda el hábito "Entrenar". Plan salió de la barra en la 2.3.0: se entra
por *Planificar* de Histórico.) Sistema (hasta la 2.3.0 se llamaba Progreso) tampoco está en ella: se abre desde la
chapa de nivel y rango de arriba a la derecha.

**Cabecera.** El día que estás mirando en grande, con flechas para ir hacia
atrás y un calendario para saltar a cualquier fecha. A la izquierda, el rombo
`◈` de la racha de cumplimiento: en el color de la app a cero, cian y con el
número en racha, rojo y latiendo si hoy está en juego (2.3.3). Junto al
calendario, el lápiz violeta (icono de línea) de la racha de registro, siempre
a la vista. Al tocarlos se explican. A la derecha, la chapa con nivel,
rango y EXP. Debajo, la barra del día con su cuenta (`5/9`).

**Hoy.** Los hábitos del día agrupados por categoría. Los ya cumplidos se
apartan a un cajón plegado al final. Debajo: los hábitos en pausa, el botón
*Anotar el día*, el peso del día y la nota del día. De lunes a miércoles, arriba
del todo, el **resumen de la semana pasada** (cumplimiento contra la anterior,
días perfectos, racha, lo que más se escapó, Redes y peso) con el botón para
planificar la semana en curso; se quita con ✕ hasta la semana siguiente. Si la
semana está sin planificar, una línea discreta lo recuerda (el domingo, si lo
está la que viene). Durante una ausencia, otra línea dice hasta cuándo dura.
Con **misiones** aceptadas (2.6.0), una tarjeta arriba con su progreso; tocarla
lleva a Plan. Con la semana planificada y sin misiones, una línea invita a
elegirlas.

**La EXP en cada tarjeta** (2.9.0). A la derecha de la barra de progreso, una
ficha pequeña con lo que da el hábito ese día (`+25`). Cuanto más difícil, más
viva: violeta con *Difícil* (40) y ámbar con *Muy difícil* (50). En verde
cuando ya está ganada. En los hábitos a evitar dice el próximo hito y cuánto
falta (`+100 en 12 d`), porque no pagan por día. Siempre hay uno por delante:
desde la 2.9.0, pasados los 100 días sin caer, +50 cada 30 días más
(PROGRESION.md, apartado 3). No cuenta los bonos de día
bueno o perfecto, que son del día y no del hábito. En el ordenador, al pasar
el ratón por encima, explica la dificultad o el hito. Va junto a la barra y no junto al
nombre para no cortar nombres largos en el móvil.

**Plan.** Tres partes:

- *El plan de la semana*: qué días toca cada hábito en **esta semana** o en
  **la que viene**, sin cambiar sus días de siempre. Se empieza cuando se
  quiera: un martes se planifica de hoy al domingo, y lo que ya pasó se queda
  como estaba. Al pulsar *Confirmar y bloquear*, la semana queda **bloqueada
  hasta el domingo** (hay 7 segundos para deshacerlo). El domingo, Plan se abre
  directamente en la semana que viene. Sin plan, todo sigue sus días de
  siempre. Planificar no da EXP. **Cada semana se puede desbloquear una vez**
  (2.7.0), esta y la que viene, por si surge algo que impide lo planificado:
  el plan confirmado sirve de punto de partida, lo que ya pasó se queda como
  estaba y, al volver a confirmar, queda bloqueada del todo hasta el domingo.
  Las misiones aceptadas no cambian.
- *Misiones* (2.6.0): hasta tres retos para la semana —cumplir un hábito N
  veces, semana limpia de un hábito a evitar, media por debajo de un máximo,
  N días perfectos o registrar todos los días—. *Sugerir* las propone según la
  semana anterior. Una vez aceptadas no se cambian hasta el domingo y cuentan
  desde ese día. 50 EXP cada una y 50 más por las tres (PROGRESION.md, 11).
- *Ausencias*: un viaje o una temporada fuera. Fechas de inicio y fin, motivo,
  una nota y los hábitos que se pausan (todos marcados de entrada). Esos días
  no se piden, no cuentan como fallados y las rachas se quedan donde estén.
  Una ausencia por venir se cancela; una en curso se termina hoy.

Se entra desde **Planificar** (en negrita, con el icono del calendario) en
Histórico, desde el resumen semanal y desde el aviso de semana sin planificar
de Hoy. *Volver* lleva a la pantalla desde la que se entró.

**Histórico.** La semana en rejilla (hábito × día), los totales de los hábitos
por cantidad, el cumplimiento de la semana y del mes, el calendario en vista
de mes o de año, la gráfica de evolución y la evolución del peso (30 días,
3, 6 o 12 meses, o todo, con la media de 7 días). Debajo, **Peso de un mes**
(2.7.5): un mes y un peso, para rellenar meses pasados sin ir día a día; se
guarda como el día 1 de ese mes y avisa si ese día ya tenía uno. Bajo el peso, el **peso objetivo**:
cuánto falta, a qué ritmo vas y para cuándo llegarías; en la gráfica, una
línea discontinua si el objetivo está cerca de tus datos.

**Notas.** Un campo para escribir la nota de hoy, un buscador, las **notas
libres** (con título opcional, sin día: objetivos, listas, ideas) y todas tus
notas de día en orden, cada una con cómo fue ese día. La fecha lleva a ese día y
el lápiz la edita ahí mismo; vaciarla la borra. Una nota libre que se cierra
vacía se descarta, y al eliminarla hay 7 segundos para deshacerlo. El buscador
filtra las dos listas.

**Ajustes.** Apariencia, qué se ve en Hoy, privacidad, la lista de todos tus
hábitos (con archivados y pausados), copia de seguridad y la información de la
instalación. En *Preferencias*, el interruptor **Restar EXP por días en blanco**
(2.6.0, encendido de entrada): −25 EXP por cada día que acabe sin registrar
nada, sin bajar nunca de nivel y devueltos si rellenas el día.

**Guardar copia** (2.6.0), en *Tus datos* y en el aviso de copia: abre el menú
de compartir del móvil para mandarla a Drive, WhatsApp, el correo… Chrome no
deja compartir archivos `.json`, así que va como `habitos-AAAA-MM-DD.txt` con el
mismo contenido; *Importar* acepta `.json` y `.txt`. Se comparte solo el archivo,
sin texto al lado: con texto, apps como Drive se quedaban con él y tiraban el
archivo (2.6.1). En el ordenador (sin pantalla táctil) se descarga, y si el
menú falla también, con un aviso que dice el error. Cancelar el menú no cuenta
como copia. Desde la 2.8.1 va **siempre** como `.txt`: hasta entonces se probaba
antes `.json`, y Chrome para Android lo daba por bueno al preguntar
(`canShare`) pero lo rechazaba al compartir con `NotAllowedError`. Si el
navegador pide un toque nuevo (el anterior caducó), sale un aviso con el botón
*Compartir* en vez de descargar; a la segunda, se descarga.
*Exportar JSON* sigue descargando el archivo como siempre.

**Privacidad** (2.3.0), para enseñar la app sin enseñar lo más personal. Tres
interruptores, todos apagados de entrada:

- *Ocultar el peso*: el peso del día en Hoy, la tarjeta de peso de Histórico
  y su línea del resumen semanal.
- *Ocultar los hábitos a evitar*: sus tarjetas en Hoy, "Días sin" del
  Sistema, sus líneas del resumen semanal, la lista de Ajustes y el aviso de
  pausa. Mientras estén ocultos no se pueden apuntar fallos; la EXP de sus
  hitos se cobra igual, pero el aviso no dice el nombre.
- *Ocultar las notas*: la sección Notas (sale de la barra), la nota del día en
  Hoy y lo escrito a mano al anotar un día.

Solo cambia lo que se ve: todo sigue guardado y contando para rachas,
porcentajes y EXP, y las exportaciones lo llevan todo. La barra del día no
delata nada, porque ya solo contaba los hábitos normales.

**Sistema** (desde la chapa). Nivel y rango, los cinco atributos, las dos
rachas (◈ cumpliendo y el lápiz registrando, sin caja propia desde la 2.3.1), el historial de ascensos, las rachas por hábito, los días sin caer en
los hábitos a evitar y los logros. En *Días sin*, además de la racha, cada
hábito a evitar lleva su acumulado de toda la historia (2.3.2): `Σ 4 h 50 min`
en los de máximo al día como Redes, `Σ 3 fallos` en los de fallos o franjas.
**Recompensas** (2.7.0): cada hábito con su dificultad (*Muy fácil* 10 ·
*Fácil* 20 · *Normal* 25 · *Difícil* 40 · *Muy difícil* 50 EXP), cambiable ahí mismo o en el
formulario del hábito; los cambios valen desde mañana. Debajo, la **previsión
hasta el rango X**: cumpliéndolo todo con esos valores y a tu ritmo real de
los últimos 30 días. El panel de nivel la resume en una línea.
Desde la 2.7.1, **Recompensas, Rachas por hábito y Días sin se pliegan** como
Ascensos y Logros (con su cuenta en la cabecera), y cada desplegable recuerda
si lo dejaste abierto (en `habitTracker.folds`, aparte de tus datos). Se
quedan siempre a la vista el panel de nivel, el estado del jugador, las dos
rachas y las cuatro cifras.

**Ficha de un hábito** (tocando su icono o su nombre). Estadísticas, totales,
calendario del mes (la tarjeta "Por día de la semana" salió en la 2.7.5) y los botones de editar,
pausar, archivar y eliminar. Los hábitos con máximo diario (Redes) tienen sus
propios totales: semana pasada, día más alto, días pasados del mes, y la
comparación con la semana anterior a estas alturas.

Las cuatro cifras de arriba dependen del tipo (2.7.5):

| Hábitos que se hacen | Hábitos a evitar |
|---|---|
| Racha actual | Días sin caer (o *sin pasarte*, con máximo) |
| Récord | Récord sin caer |
| Últimos 30 días (% cumplido) | Días limpios en 30 días (o *dentro* del máximo) |
| EXP ganada (con el valor de cada día, sin bonos) | Días que faltan para el siguiente hito de EXP |

Desde la 2.7.2 **todos los hábitos** tienen *Totales acumulados* y *Valores de
los últimos 30 días*, cada uno en su unidad (`habitCounts()` y `habitChart()`
en `stats.js`):

| Tipo | Totales | Gráfica |
|---|---|---|
| Check | veces esta semana y este mes "de" las que tocaban, total, media y mejor semana, semana pasada | veces cumplido en los 7 días hasta cada día, contra sus días por semana |
| Franjas | igual, contando franjas | franjas cumplidas cada día que tocaba, contra las que tiene |
| A evitar por fallos | fallos de la semana, del mes y totales, media por semana, día con más, días con fallo del mes, y la semana contra la pasada a estas alturas | fallos de cada día (un día limpio es un 0), con el tope de crítico como techo |
| Cantidad y con máximo | como hasta ahora | como hasta ahora |

Desde la 2.7.3 la ficha dice también **a qué atributos suma** el hábito (Fuerza
si es el de entreno; si no, el de su categoría), cuánto aporta él
(constancia × experiencia) y cuánto vale el atributo entero
(`habitAttributes()` en `stats.js`). Desde la 2.7.4, *Totales acumulados* abre
con **este mes contra el anterior a estas alturas** (del día 1 a hoy, contra
lo mismo del mes pasado), en verde si vas mejor y en rojo si peor; en los
hábitos a evitar, mejor es menos (`monthCompare()`).

**Ánimo del día** (2.7.4). En la tarjeta de la nota de Hoy, cinco caras (😞 🙁
😐 🙂 😄); tocar la elegida otra vez la quita. No da EXP ni entra en
porcentajes, pero es un registro: cuenta para la racha de registro y salva un
día de quedar en blanco. En **Histórico**, la tarjeta *Ánimo* cruza los
últimos 90 días con lo cumplido: cuántos días de cada ánimo, qué porcentaje
de hábitos cumpliste esos días y el ánimo medio de los días buenos (80% o
más) frente a los demás (`moodSummary()`). El resumen semanal añade el ánimo
medio. Va con las notas: si se ocultan en Privacidad, se oculta también.

**Temporizador** (2.8.0). Un botón ▶ junto al nombre del hábito, en Hoy, en:

- los **check con minutos**: se activa en el formulario del hábito,
  *Temporizador (opcional)*, de 1 a 600 min. Al llegar al tiempo suena (si los
  efectos están activados), vibra y **el hábito se marca solo**. Si terminas
  antes, avisa de cuánto faltaba y ofrece *Marcar igual*.
- los **de cantidad medidos en tiempo** (unidad `min`, `h` o `seg`, sin pedir
  nada): al pulsar *Terminar* se **suma lo cronometrado** al día (a minuto
  entero; en horas, con dos decimales). Al llegar a la meta del día avisa y
  sigue contando. Con menos de un minuto no apunta nada.

Mientras corre, una barra flota sobre la navegación en cualquier sección, con el
tiempo, la meta, un anillo de progreso, *Pausar/Seguir*, *Terminar* y ✕
(descartar; si lleva un minuto o más, pregunta). Solo hay uno a la vez y solo
se ve en el día de hoy. Se guarda la hora de inicio, no un contador: **sigue
contando aunque cierres la app o recargues**, y lo apuntado va al día en que
empezó, aunque se termine pasada la medianoche. Si lleva más de 3 horas,
pregunta antes de apuntar, por si se quedó olvidado. Mientras corre mantiene la
pantalla encendida (si el navegador lo permite): con ella apagada el móvil
congela la app y el aviso llegaría al volver, aunque el tiempo se cuenta bien
igualmente. Vive en `habitTracker.timer`, aparte de tus datos: es del
dispositivo, no se exporta. Otra ventana abierta lo ve al momento.

**Objetivos a largo plazo** (2.8.0). Metas con fecha para un hábito: «3.000
páginas en 2027», «100 entrenos este año», «200 días sin Gula». Están en el
**Sistema** (tarjeta *Objetivos*, abierta de entrada y plegable) y en la **ficha
de cada hábito** (los suyos, con *+ Nuevo*). Qué cuenta cada uno:

| Hábito | Cuenta |
|---|---|
| Cantidad | lo apuntado sumado (páginas, minutos…) |
| Check y franjas | días cumplidos |
| A evitar | días sin caer (o sin pasarte del máximo); el de hoy cuenta al acabar |

Cuenta todo lo apuntado entre las dos fechas, también lo anterior a crear el
objetivo. El formulario tiene fechas rápidas (*Este mes*, *3 meses*, *Este año*,
*12 meses*) y dice cuántos días son, cuánto saldría cumpliendo todo lo que
toca, cuánto llevas ya y cuánto pide al día o por semana. En la lista, cada
objetivo lleva su barra con una rayita de **dónde tocaría ir hoy**, lo
conseguido y su estado: *Vas bien* (llevas al menos lo que tocaría), *Vas
justo* (a este ritmo llegarías al 85%), *Vas por detrás*, *Ya no da tiempo* (ni
cumpliendo todos los días que quedan), *Recién empezado* (los dos primeros
días), *Aún no ha empezado*, *Conseguido* o *No se consiguió*; con lo que hace
falta al día (o días por semana) y dónde acabarías a este ritmo. Al alcanzar uno
salta un aviso con confeti, una sola vez. Los terminados pasan a un
desplegable *Terminados*. Hasta 30. **No dan EXP**, para que fijarse una meta
fácil no sea una forma de subir de nivel, pero el primero cumplido da el logro
*Visionario* 🏁. Borrar un hábito se lleva sus objetivos (y *Deshacer* los
devuelve). Con los hábitos a evitar ocultos en Privacidad, sus objetivos
también se ocultan.

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

**Si Chrome dice «Esta aplicación ya está instalada» sin estarlo**: es un fallo
de Chrome para Android (hasta la 157) cuando hay otra app tuya instalada en el
mismo `usuario.github.io`. Usa el botón *Instalar la app* de **Ajustes → Esta
instalación**, que solo aparece cuando el navegador permite instalarla. Detalle
en `PWA-Android-ya-instalada.md`.

**Atajos del icono** (2.6.0). Con la app instalada, mantener pulsado su icono
ofrece *Apuntar fallo*, *Escribir nota*, *Peso de hoy* y *Planificar la semana*
(`shortcuts` en `manifest.json`; cada uno abre `index.html?go=…` y
`openShortcut()` lleva a su sitio). En una app ya instalada, Android tarda en
mostrarlos: Chrome actualiza el manifest por su cuenta, a veces en un día. Con
lo que apuntan oculto en Privacidad, abren Hoy sin más.

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
- Al final de **Ajustes**, la línea **Versión** enseña la que guarda la caché
  offline, su fecha y lo que ocupa todo en KB (app guardada + tus datos; el
  desglose sale al pasar el ratón). Si la caché es de otra versión se pone en
  ámbar y dice cómo arreglarlo. Es la causa habitual de "he subido los cambios
  y el móvil no los ve".
- Debajo, **Datos: X KB de 5120 KB máx.** El tope real es el de localStorage:
  5 MiB por origen, contados en caracteres, y el origen es
  `alexlobar.github.io` entero, así que lo que guarden otras apps publicadas
  ahí resta del mismo saco (se enseña si pasa de 1 KB). Pasa a ámbar al 70 % y
  a rojo al 90 %. La caché de la app no cuenta: va aparte y su cuota es de
  gigas. Como referencia, un día con 13 hábitos, nota y peso son ~0,4 KB.
- Y debajo, si los datos están **protegidos** (🔒) o **sin proteger** (⚠️, en
  ámbar). Al arrancar, `requestPersist()` en `app.js` pide
  `navigator.storage.persist()` mientras no esté concedido, y otra vez al
  instalar la app. Sin protección el navegador puede borrarlos si le falta
  espacio (y Safari tras días sin abrir la web). Chrome la concede sin
  preguntar a apps instaladas o muy usadas; Firefox pregunta una vez. No
  amplía los 5 MB.
- Cuando el service worker nuevo releva al viejo con la página abierta, la app
  se recarga sola una vez para no quedarse con archivos de dos versiones.
- Al instalarse, el service worker descarga los archivos con
  `cache: 'reload'`, saltándose la caché HTTP del navegador (GitHub Pages da
  10 minutos): así una versión subida poco después de otra no se guarda con
  archivos de la anterior (2.2.2).
- El almacén de cachés es del origen entero (`alexlobar.github.io`), igual que
  `localStorage`: al actualizar, `sw.js` borra solo las cachés que empiezan por
  `habitos-v`, nunca las de las otras apps publicadas ahí. Hasta la 2.2.1
  borraba todas las que no fueran la suya.

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
seis `--fs-*` a la vez. **Tamaño de los controles**: muy compacto, compacto,
cómodo o amplio, vía `data-controls` en `<html>`. *Muy compacto* (2.3.0) está
pensado para el móvil: tarjetas más bajas, controles de 32px y, cuando cabe, el
control al lado del nombre en vez de en su propia línea.

### El tema del Sistema

Sistema tiene su propia piel de ventana del System, **confinada a
`#view-progress`** en la sección 8d. Redefine sus `--sys-*`, su rampa
`--heat-*` y también los tokens de texto y superficie, para que se vea igual en
tema oscuro y en tema claro. Ninguna otra pantalla hereda nada de ahí; para
quitar el tema basta con borrar ese bloque.

Fuera del Sistema hay dos piezas que usan el mismo lenguaje a propósito: la
chapa de rango de la cabecera (colores por tramo con `[data-rank]`) y el
los contadores de las rachas (el `◈` y el lápiz).

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
| Opciones con más de dos valores | `CONTROLS`, `FONT_SIZES`, `STREAK_GOALS` en `js/store.js` |

Los catálogos de opciones están en el almacén y no solo en el HTML para que el
saneado y el desplegable no puedan discrepar. Los iconos sugeridos son arrays de
emoji, no cadenas que luego se parten: `🏋️` ocupa dos unidades UTF-16.

Los hábitos de partida solo se usan la primera vez que se abre la app; después
manda lo guardado.

---

## Estructura de datos

Una sola clave, `habitTracker.v1`:

```jsonc
{
  "version": 18,
  "settings": {
    "accent": "#4361ee", "effects": true,
    "theme": "dark",                  // "dark" | "light"
    "fontSize": "normal",             // "small" | "normal" | "large" | "xlarge"
    "controls": "compact",            // "mini" | "compact" | "comfy" | "roomy"
    "hideDone": true,
    "showDayBar": true, "showNotes": true, "showFreeze": true, "showWeight": true,
    // privacidad: ocultan en toda la app, no solo en Hoy (2.3.0)
    "hideWeight": false, "hideAvoid": false, "hideNotes": false,
    "blankPenalty": true,             // −25 EXP por día en blanco (2.6.0)
    "backupDays": 14,                 // aviso de copia: 0, 7, 14 o 30 días
    "streakGoal": "2",                // "1" | "2" | "3" | "quarter" | "half"
    "weekStart": 1,                   // fijo en lunes desde la 1.6.5
    "notificationsEnabled": false,    // sin uso desde la 1.6.8
    "weightGoal": 80                  // kg, o null si no hay objetivo
  },
  "habits": [{
    "id": "h_k3f9", "name": "Lectura", "icon": "📖", "color": "#e879f9",
    "category": "aprendizaje",        // "fisico" | "mental" | "aprendizaje" | "evitar" | null
    "type": "quantity",               // "check" | "quantity" | "schedule" | "avoid"
    // quantity: la meta del día · entry: "stepper" (botones + y −) o "manual"
    // avoid con target: un MÁXIMO al día ("Redes": 90 min), siempre "manual"
    "target": { "amount": 10, "unit": "páginas", "step": 1, "entry": "stepper" },
    "slots": null,                    // schedule y avoid por fallos: "morning" | "afternoon" | "night"
    "limit": null,                    // solo avoid por fallos: fallos del día hasta "crítico"
    "activeDays": [0, 1, 2, 3, 4, 5, 6],   // 0 = domingo
    "createdAt": "2026-09-15",
    "archived": false,
    // tramos [from, to): "to" es el día en que se reanudó, null si sigue en pausa.
    // Los de una ausencia programada llevan "trip": el id que los agrupa.
    "pauses": [{ "from": "2026-09-13", "to": "2026-09-19", "reason": "vacaciones", "note": "" },
               { "from": "2026-11-10", "to": "2026-12-07", "reason": "viaje", "note": "Japón", "trip": "a_x1" }],
    // días de semanas concretas: clave = el lunes; [] = esa semana no toca.
    // null si no hay ninguna. Al confirmar una semana se guardan todos los
    // hábitos, aunque coincidan con activeDays, para que no cambie por detrás.
    "weekPlan": { "2026-10-26": [2, 4, 6] },
    // EXP al cumplirlo (v16): cambios con la fecha desde la que valen.
    // null = 25 siempre. Valores: 10 | 20 | 25 | 40 | 50. Los de evitar, null.
    "xp": [{ "from": "2026-11-06", "xp": 40 }],
    // minutos del temporizador (v18), solo en los check: 1–600, o null
    "timer": null,
    "reminder": { "enabled": false, "time": "08:00" }   // sin uso desde la 1.6.8
  }],
  "logs": {
    // check → true · quantity → número · schedule → { "night": true }
    // avoid por fallos → número de fallos del día; con franjas, en cuáles se falló
    // avoid con máximo → cuánto llevas (minutos, euros…)
    "h_k3f9": { "2026-09-15": 12 }
  },
  "notes": { "2026-09-15": "Día raro, pero saqué el rato de leer." },
  "weights": { "2026-09-15": 72.4 },  // kg, un decimal, entre 20 y 400
  "moods": { "2026-09-15": 4 },       // ánimo del día (v17): 1 muy mal … 5 muy bien
  // notas sin día, la más reciente primero; "updated" en milisegundos
  "freeNotes": [{ "id": "n_x1", "title": "Objetivos", "text": "…", "updated": 1793009134893 }],
  // semanas confirmadas (bloqueadas): lunes → día en que se confirmó
  "plannedWeeks": { "2026-10-26": "2026-10-27" },
  // semanas que ya gastaron su único desbloqueo (v16): lunes → día
  "planUnlocks": { "2026-10-26": "2026-10-29" },
  // misiones aceptadas (v15): lunes → hasta tres. "from" es el día desde el
  // que cuentan; "target", las veces, los fallos máximos o la media máxima.
  // type: "habit_count" | "avoid_clean" | "cap_avg" | "perfect_days" | "log_all"
  "missions": { "2026-10-26": [{ "type": "habit_count", "habitId": "h_xxx", "target": 3, "from": "2026-10-28" }] },
  // objetivos a largo plazo (v18): id → objetivo, hasta 30. Objeto y no lista
  // para que dos ventanas que tocan objetivos distintos no se pisen al mezclar.
  // "doneAt": día en que se celebró, para no celebrarlo dos veces.
  "goals": { "g_ab12cd3": { "habitId": "h_k3f9", "amount": 3000, "from": "2027-01-01",
                            "to": "2027-12-31", "created": "2026-11-05", "doneAt": null } },
  "frozen": {
    // marcas de día: el motivo es gratis; "skip": true cuesta un comodín
    "2026-09-20": { "reason": "energia", "note": "", "skip": false },
    "2026-09-12": { "reason": null,      "note": "", "skip": true }
  },

  // El hábito que mide el atributo Fuerza (STR). Hasta la v13 era
  // workout.linkedHabitId; routines, exercises, sessions y workout se
  // descartan al sanear desde la 2.2.0.
  "trainingHabitId": "h_xxx",

  "game": {
    "points": 1240,                   // acumulador de EXP; nivel y rango se derivan
    "achievements": ["first_step"],
    "bestStreak": 12,                 // mejor racha de un solo hábito
    "habitsCreated": 0,               // los de partida no cuentan
    "avoidXpPaid": 50,                // EXP de hitos de "evitar" ya cobrada
    "avoidXpRebase": false,           // v16: reajuste pendiente a la tabla nueva de hitos
    "lastExport": "2026-09-30",
    "weekSummarySeen": "2026-10-26", // lunes de la semana cuyo resumen ya se cerró
    "levelLog": [{ "level": 1, "date": "2026-09-16" }],
    "levelLogFrom": 0,                // nivel desde el que el registro es fiable
    "freezes": 2,                     // comodines disponibles (máx. 4)
    "freezeWeek": "2026-09-28",       // lunes de la última recarga semanal
    "missionPaid": { "2026-10-26": 100 },   // EXP de misiones cobrada, por semana (v15)
    "penalties": { "2026-10-29": 25 },      // EXP restada por día en blanco (v15)
    "penaltyFrom": "2026-10-30"             // desde cuándo cuentan los días en blanco
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
| < 3 | `migrateToWorkout()` | Crea el hábito "Entrenar" (hasta la 2.2.0 creaba también la tabla de calistenia) |
| < 4 | `migrateToCategories()` | Asigna categoría a los hábitos que existían |
| < 5 | `migrateToScreenSlots()` | Pasa "Evitar pantallas" a franjas y convierte su histórico |
| < 6 | `migrateSeedTweaks()` | Bandera para Japonés, tope 1 para Gula y Lujo |
| < 8 | `migrateNewDefaults()` | Controles compactos y "apartar cumplidos" por defecto |
| < 11 | `migrateAddRedes()` | Añade "Redes" (máximo 90 min) si no hay ya un hábito con ese nombre |
| < 13 | `migrateDropPlanner()` | Archiva "Planificar la semana" (por nombre, sin tildes ni mayúsculas): planificar tiene su pestaña |

La v12 (2.0.0) daba a ese hábito un campo `role`; desde la v13 el saneado lo
descarta. Las versiones 7 (`levelLog`), 9 (`pauses`), 10 (marcas de día), la
parte de `weights` de la 11, `weekPlan`, `freeNotes`, `weightGoal` y
`weekSummarySeen` de la 12, `plannedWeeks` y el `trip` de las pausas de la 13 y
la 14 no necesitan migración propia: el saneado rellena los campos nuevos o, en
el caso de la v10, lee el `true` antiguo de `frozen` como "salvado sin motivo".
En la v14 el saneado copia `workout.linkedHabitId` a `trainingHabitId` y deja
fuera rutinas, ejercicios, sesiones y el ajuste `restSeconds`; eso vale igual
al cargar que al importar una copia antigua. La EXP que dieron los entrenos se
queda. La v15 (2.6.0) tampoco necesita migración: `missions`, `missionPaid` y
`penalties` empiezan vacíos y `penaltyFrom` en el día de la actualización, para
no cobrar días en blanco anteriores. Una misión cuyo hábito ya no existe, o ya
no es del tipo que pide, se descarta al sanear.

La v16 (2.7.0) añade `habit.xp` y `planUnlocks`, que empiezan vacíos (todos los
hábitos valen 25, como antes). Su única migración es una marca: los hitos de
evitar pasan de 50/150/400 a 50/100/200, y al arrancar `syncAvoidXp()` baja una
vez lo cobrado a lo que daría la tabla nueva por las mismas rachas, sin quitar
EXP. Importar una copia anterior a la v16 hace lo mismo.

La v17 (2.7.4) añade `moods`, que empieza vacío: no necesita migración.

La v18 (2.8.0) añade `goals` (vacío) y `habit.timer` (null): tampoco necesita
migración. Sube el número para que una ventana abierta con la 2.7.x, que no
conoce los objetivos, deje de guardar en vez de borrarlos al sanear. Un objetivo
cuyo hábito ya no existe se descarta al sanear.

### Varias ventanas a la vez (2.3.4)

La app instalada y una pestaña del navegador comparten el mismo almacén. Hasta
la 2.3.3 cada ventana escribía su copia entera, y la que llevaba rato abierta
pisaba al recargarse o cerrarse lo apuntado en la otra. Ahora:

- Cada ventana recuerda el texto del almacén que leyó o escribió por última vez.
  Al guardar, si sigue igual escribe; si otra ventana lo ha cambiado, hace una
  mezcla a tres bandas (`merge3()`): lo que solo cambió un lado gana, y si
  cambiaron los dos el mismo dato, gana la que guarda. La EXP se suma.
- Con el evento `storage`, al volver a la ventana (`visibilitychange`) y al
  restaurarla (`pageshow`), trae lo nuevo sin esperar a guardar.
- Al cerrarse (`pagehide`) solo escribe si tiene cambios pendientes.
- Importar y restablecer no mezclan: reemplazan.
- Si otra ventana ya ha guardado con un esquema más nuevo, esta deja de
  escribir y se recarga.

**Importar no ejecuta las migraciones**, solo el saneado, con una excepción:
una copia anterior a la v13 pasa también por `migrateDropPlanner()`, para que
no vuelva "Planificar la semana" como hábito activo. Comprobado que importar
exportaciones de los esquemas 6 a 9 da el mismo resultado que cargarlas; con
archivos anteriores no está verificado.

Comprobado al arrancar: estados guardados con los esquemas 4 a 9 se cargan sin
perder ningún dato (1.7.0), el paso de la v9 a la v10 conserva los días
congelados como "salvados sin motivo" (1.7.2) y el de la v12 a la v13 archiva
el hábito planificador y conserva las ausencias (2.1.0). De la v13 a la v14 se
conserva el enlace con "Entrenar", tanto al cargar como al importar (2.2.0).

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
con su `data-view` (o ninguno, como Sistema), una entrada en `els.views` y otra
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
- **Un hábito a evitar se mide de dos formas.** Contando fallos (Gula: un
  fallo y el día está tocado) o con un máximo al día (Redes: 45 de 90 minutos
  es un día bueno, solo pasarse es fallar). El segundo reutiliza `target`
  leído como techo. Todo lo que pregunta si un hábito a evitar ha fallado pasa
  por `St.slipsOf()`, nunca por `failsOf()`, que solo entiende fallos: si no,
  45 minutos contarían como 45 fallos.
- **El peso no es un hábito.** No se "cumple", así que va aparte y no entra en
  el porcentaje del día, ni en rachas de cumplimiento, ni da EXP. Sí cuenta
  como registro. Los cambios se calculan entre **medias de 7 días**, no entre
  pesadas sueltas, porque el peso de un día baila por el agua y la comida.
- **El plan de la semana es una excepción, no otro horario.** Cada hábito
  conserva sus días de siempre (`activeDays`) y `weekPlan` guarda las semanas
  planificadas. Toda la app pregunta qué toca a través de `S.activeDaysFor()`
  —la usan `getHabitsForDate()` y `St.isActiveOn()`—, así que tarjetas,
  porcentajes, rachas, rejilla y EXP lo respetan sin saber que existe.
- **Se empieza cuando se quiera y se bloquea semana a semana.** Solo se
  planifican la semana en curso y la siguiente. Al confirmar, los días ya
  pasados se quedan como estaban (quitar uno borraría un fallo a posteriori) y
  el resto queda fijado hasta el domingo: un plan que se puede retocar a media
  semana deja de ser un compromiso, y quitar a las 23:00 el hábito que no has
  hecho sería hacerse trampas. Para lo imprevisto están anotar el día, pausar
  el hábito o programar una ausencia. Si confirmar cambia lo que toca hoy, el
  bonus del día se paga o se retira por diferencia (`withTodayBonus()`).
- **"Planificar la semana" dejó de ser un hábito en la 2.1.0.** Planificar no da
  EXP: la migración v13 lo archiva (no lo borra) y Plan ocupa su lugar.
- **Una ausencia son pausas con fecha.** No hay un tipo de dato nuevo: cada
  hábito elegido recibe un tramo de pausa normal con un `trip` común. Por eso
  rachas, porcentajes y EXP la entienden sin cambios, y una pausa sigue
  ganando a un plan bloqueado. No puede empezar antes de hoy ni durar más de
  180 días; un hábito que ya está en pausa indefinida no recibe tramo.
- **Peso objetivo con ritmo de medias.** El ritmo compara la media de 7 días
  actual con la de hace 4 semanas (2 si aún no hay tanto). A ±0,3 kg se da por
  llegado; por debajo de 50 g por semana, por estable. El texto es neutro: no
  sabe si quieres bajar o subir, solo cuánto falta.
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
- **El entreno es solo un hábito.** La sección Ejercicios (rutinas, series,
  descanso) salió en la 2.2.0 porque el entreno se apunta en otra app más
  completa. Aquí queda "Entrenar" como cualquier otro hábito, y el atributo
  Fuerza sale de él (respeta el plan semanal y las pausas).
- **Los atributos suben con el tiempo (2.4.0).** Cada uno es constancia (30
  días) × experiencia (veces cumplido, con el máximo a las 12 semanas de los
  días de cada hábito). Antes era solo la constancia, y dos entrenos de dos
  daban 100. Detalle en PROGRESION.md, sección 6.
- **La curva de niveles cuesta la mitad desde la 2.5.0** (`XP_STEP` 25), y
  **cada hábito da 25 EXP desde la 2.5.1** (antes 20). Con 6-7 hábitos al día,
  el rango S llega en unos 4,5 meses y el X en 1 año y medio. La misma EXP vale
  más niveles; al arrancar se apuntan los que faltan en el registro de
  ascensos. Tablas en PROGRESION.md, secciones 3 y 4.
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
- Si cambias el icono, hay que regenerar también los PNG: el SVG solo lo usan el
  navegador y Android; el iPhone usa `icon-180.png`.
