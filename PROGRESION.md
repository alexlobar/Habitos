# Sistema de progresión

Referencia completa de la EXP, los niveles, los rangos, los atributos, los
logros y las rachas. El `README.md` lo resume; esto es el detalle, pensado para
consultarlo cuando haya que tocar la curva, añadir una recompensa o entender por
qué una racha se ha roto.

Versión documentada: **2.5.1** · esquema de datos **v14**.

Todas las cuentas viven en `js/stats.js`. Ninguna vista las repite: piden el
dato y pintan lo que reciben.

---

## 1. La pantalla Sistema (antes Progreso)

Se abre tocando la chapa de nivel y rango de la cabecera (ya no está en la
barra de navegación). De arriba abajo:

| # | Bloque | Qué muestra |
|---|---|---|
| 1 | Panel de nivel | Nivel, rango, barra de EXP con previsión, EXP del nivel y total |
| 2 | Estado del jugador | Los cinco atributos (sección 6) |
| 3 | Tus dos rachas | Cumpliendo y registrando, cada una con su regla (sección 8) |
| 4 | Cuatro fichas | Mejor hábito ahora, récord de un hábito, misiones completadas, logros |
| 5 | Ascensos | Plegado. Fecha en que alcanzaste cada nivel |
| 6 | Rachas por hábito | Racha actual y récord de cada hábito |
| 7 | Días sin | Solo si hay hábitos a evitar: días seguidos sin caer |
| 8 | Logros | Plegado, con la cuenta en la cabecera (`3/15`) |

### El panel de nivel

```
                ESTADO
              NIVEL  7
            [E]  NOVATO
     ████████████▒▒▒▒▒▒░░░░░░░░░
             60 / 450 EXP
     390 EXP para subir · 1.810 en total
     +170 EXP si cumples los 4 que faltan hoy
```

La cifra de EXP cuenta lo mismo que la barra: el avance **dentro del nivel**
(`60 / 450`), no la EXP total contra la del siguiente nivel. El total va debajo.

El tramo apagado (`▒`) es la **previsión**: dónde quedaría la barra si
cumplieras todo lo que falta hoy, bono del día incluido. Si lo pendiente se sale
del nivel, el tramo llega al final y el número real lo da el texto. Lo calcula
`pendingToday()`.

---

## 2. La cadena de la experiencia

```
   Acciones que dan EXP
   (hábito, bono del día, hito de "evitar")
              │
              ▼
        grantXp()                  ← único punto de entrada  ·  js/app.js
              │
              ▼
       game.points                 ← el acumulador que se guarda
              │
              ▼
      levelInfo(xp)                ← XP_TABLE, XP_STEP y RANKS  ·  js/stats.js
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
   Nivel    Rango   Barra de EXP
```

**El nivel y el rango no se guardan.** Se derivan de `game.points` en cada
pintado. Cambiar la curva no obliga a migrar nada y no puede corromper datos.

La excepción es `game.levelLog`, y lo es por necesidad: la EXP guarda *cuánta*
llevas, no *cuándo* la ganaste. La fecha de un ascenso no se puede deducir de
nada, así que se apunta (sección 7).

---

## 3. Qué da EXP

Los valores están en `XP`, en `js/stats.js`. **Toda la EXP acaba en 0 o en 5**:
los bonos se redondean con `round5()`.

| Acción | EXP |
|---|---:|
| Completar un hábito | **25** (20 hasta la 2.5.0) |
| Día bueno: cumplir el 80% o más de los hábitos del día | **+25%** de lo ganado en hábitos ese día |
| Día perfecto: cumplirlos todos | **+50%** de lo ganado en hábitos ese día |
| Cumplir un objetivo | 100 — *definido, sin acción que lo dispare* |

Los bonos son un porcentaje y no una cantidad fija para que escalen con lo que
haces: un día perfecto con nueve hábitos vale más que uno con tres. Y tienen dos
escalones para que fallar un hábito no tire por tierra la jornada entera.

Con 25 por hábito un bono puede salir con medio punto (7 perfectos: 175 × 50% =
87,5); `round5()` lo deja en 90. La EXP ya ganada con 20 se queda como está, y
el nivel no salta: solo se sube más rápido desde la 2.5.1. Desmarcar un hábito
de un día anterior al cambio retira 25 aunque en su día diera 20 (y el bono en
proporción): unos pocos puntos, y solo si se editan días pasados.

Hasta la 2.1.x la sección Ejercicios pagaba aparte: 10 por ejercicio completo,
+50% por completarlos todos y 50 por cerrar el entreno. Salió en la 2.2.0 (el
entreno se apunta en otra app); "Entrenar" sigue siendo un hábito y paga sus 25
como cualquier otro. La EXP que ya dieron los entrenos se queda.

### Un día de ejemplo

Con los hábitos de partida tocan **9 al día**, todos los días (los cuatro hábitos
a evitar no cuentan; "Planificar la semana", que sumaba uno el domingo, dejó de
ser hábito en la 2.1.0).

| Día | Cuenta | EXP |
|---|---|---:|
| 7 de 9 | 7 × 25 — por debajo del 80%, sin bono | 175 |
| 8 de 9 | 200 + 25% (50) | 250 |
| 9 de 9 | 225 + 50% (112,5 → 115) | 340 |

### Hábitos a evitar

No dan EXP a diario: su día empieza limpio a las 00:00, así que no hay ningún
"pasó a cumplido" que premiar. Hay dos formas de medirlos:

- **Contando fallos** (Gula, Lujo, Evitar pantallas): un fallo y el día deja de
  estar limpio.
- **Con un máximo al día** (Redes, 90 min): apuntas cuánto llevas y el día solo
  falla si te pasas. La tarjeta avisa en ámbar a partir del 75% del máximo y
  se pone en rojo al pasarlo. Apuntar minutos no paga ni resta nada.

Para la racha y los hitos las dos funcionan igual: un día limpio es un día sin
fallo. Cobran por aguantar, por hábito:

| Hito | EXP |
|---|---:|
| 7 días seguidos sin caer | +50 |
| 30 días seguidos sin caer | +150 |
| 100 días seguidos sin caer | +400 |

En `AVOID_MILESTONES`. Se calculan sobre la **mejor racha histórica**, que nunca
baja, y `game.avoidXpPaid` lleva la cuenta de lo ya cobrado. Un hito no se cobra
dos veces, y una recaída no retira EXP ya ganada.

---

## 4. La curva de niveles

Se empieza en el **nivel 0**: es la casilla de salida, aún no has ganado nada.

- `XP_TABLE` — EXP total con la que empieza cada nivel del 0 al 9, escrita a
  mano. El índice del array es el nivel.
- `XP_STEP` (25) — el paso de la progresión.

Subir al nivel *n* cuesta `25·(n+1)`: 50, 75, 100, 125… La fórmula cerrada

```
xpForLevel(n) = 12,5 · n · (n + 3)
```

reproduce la tabla al dígito, así que la tabla y la continuación empalman sin
escalón. `n·(n+3)` siempre es par, así que el resultado es múltiplo de 25. La
tabla se conserva porque es la que se lee de un vistazo; la fórmula es la que
escala.

**Desde la 2.5.0 la curva cuesta la mitad.** Hasta la 2.4.x el paso era 50 y,
con 6-7 hábitos al día, el rango X quedaba a casi cuatro años; ahora queda a
unos dos.

| Nivel | EXP total | Cuesta | Rango | Hasta la 2.4.x |
|---:|---:|---:|---|---:|
| 0 | 0 | — | E · Novato | 0 |
| 1 | 50 | 50 | E | 100 |
| 2 | 125 | 75 | E | 250 |
| 5 | 500 | 150 | E | 1.000 |
| 9 | 1.350 | 250 | E | 2.700 |
| 10 | 1.625 | 275 | D · Aprendiz | 3.250 |
| 20 | 5.750 | 525 | C · Combatiente | 11.500 |
| 30 | 12.375 | 775 | B · Élite | 24.750 |
| 40 | 21.500 | 1.025 | A · Maestro | 43.000 |
| 50 | 33.125 | 1.275 | S · Soberano | 66.250 |
| 60 | 47.250 | 1.525 | SS · Monarca | 94.500 |
| 70 | 63.875 | 1.775 | SS+ · Monarca supremo | 127.750 |
| 80 | 83.000 | 2.025 | SSS · Leyenda | 166.000 |
| 90 | 104.625 | 2.275 | SSS+ · Leyenda eterna | 209.250 |
| 100 | 128.750 | 2.525 | X · Fuera de escala | 257.500 |

El nivel y el rango no se guardan, así que el cambio no migra nada: la misma EXP
pasa a valer más niveles. Al arrancar, `recordLevelUp()` apunta con fecha de hoy
los niveles que el registro de ascensos aún no tenía (sección 7), una sola vez y
con un único aviso. Los ascensos anteriores conservan su fecha.

`levelFromXp()` hace el camino inverso: parte de la solución de la ecuación y
ajusta con un bucle corto, para que un redondeo de coma flotante nunca devuelva
un nivel que no case con `xpForLevel()`. Comprobado en las 400 fronteras hasta
el nivel 200.

**Cambiar la curva** es tocar `XP_TABLE` y `XP_STEP`, y nada más.

### Ritmo orientativo

Lo que da un día según cuántos hábitos tocan (los de evitar no cuentan):

| Hábitos ese día | Perfecto (+50%) | Bueno: todos menos uno (+25%) |
|---:|---:|---:|
| 8 | 300 | 220 |
| 7 | 265 | 190 |
| 6 | 225 | 155 |
| 5 | 190 | 125 |

Con 5 a 8 hábitos al día, a ritmo **realista** —5 días perfectos y 2 buenos por
semana— y contando los hitos de los cuatro hábitos a evitar (2.400 EXP si los
cuatro llegan a 100 días limpios). Días desde el primero:

| Rango (nivel · EXP) | 8 al día (~277/día) | 6-7 al día (~224/día) | 5 al día (~171/día) |
|---|---:|---:|---:|
| D (10 · 1.625) | 6 | 7 | 9 |
| C (20 · 5.750) | 21 | 25 | 30 |
| B (30 · 12.375) | 42 | 52 | 68 |
| A (40 · 21.500) | 75 | 93 | 112 |
| S (50 · 33.125) | 111 (~3,5 meses) | 137 (~4,5 meses) | 180 (~6 meses) |
| SS (60 · 47.250) | 162 | 200 | 262 |
| SS+ (70 · 63.875) | 222 | 275 | 359 |
| SSS (80 · 83.000) | 291 | 360 | 471 |
| SSS+ (90 · 104.625) | 369 | 456 | 597 |
| **X (100 · 128.750)** | **456 (~1 año y 3 meses)** | **564 (~1 año y 6,5 meses)** | **738 (~2 años)** |

Con todos los días perfectos, el X llega en 422 días con 8 hábitos, 516 con 6-7
y 665 con 5.

Cómo ha ido cambiando, a 6-7 hábitos y ritmo realista:

| Rango | Hasta la 2.4.x (curva 50, 20/hábito) | 2.5.0 (curva 25, 20/hábito) | Desde la 2.5.1 (curva 25, 25/hábito) |
|---|---:|---:|---:|
| D | 18 días | 8 días | 7 días |
| C | 2 meses | 1 mes | 25 días |
| B | 4 meses | 2 meses | 1,7 meses |
| A | 7,5 meses | 3,5 meses | 3 meses |
| S | 12 meses | 6 meses | 4,5 meses |
| SS | 1 año y 5 meses | 8 meses | 6,5 meses |
| SS+ | 1 año y 11 meses | 11 meses | 9 meses |
| SSS | 2 años y 6 meses | 1 año y 3 meses | 1 año |
| SSS+ | 3 años y 2 meses | 1 año y 7 meses | 1 año y 3 meses |
| **X** | **casi 4 años** | **1 año y 11 meses** | **1 año y 6,5 meses** |

Los hitos de "evitar" adelantan entre 8 y 14 días. Son cuentas a ritmo
constante: cualquier cambio en el número de hábitos las mueve. Pasado el nivel
100 se sigue subiendo, pero ya no hay rango nuevo.

---

## 5. Rangos

| Niveles | Rango | Nombre |
|---|---|---|
| 0 – 9 | E | Novato |
| 10 – 19 | D | Aprendiz |
| 20 – 29 | C | Combatiente |
| 30 – 39 | B | Élite |
| 40 – 49 | A | Maestro |
| 50 – 59 | S | Soberano |
| 60 – 69 | SS | Monarca |
| 70 – 79 | SS+ | Monarca supremo |
| 80 – 89 | SSS | Leyenda |
| 90 – 99 | SSS+ | Leyenda eterna |
| 100 en adelante | X | Fuera de escala |

En `RANKS`. Cada fila tiene `id`, `from`, `letter` y `name`; gana la última cuyo
`from` no supera el nivel. Añadir un rango es añadir una fila.

Cada rango tiene su color, definido una sola vez en el CSS con
`[data-rank="…"]` y reutilizado por el panel de nivel, la chapa de la cabecera y
el historial de ascensos. De E a A es una rampa de calor (cian, verde, ámbar,
naranja, rojo); de S en adelante se sale de la escala. En SSS+ y X la letra del
rango late en el panel de nivel.

---

## 6. Atributos

Cinco atributos de estilo RPG, todos de 0 a 100 y **todos sacados de datos
reales**: si una rama no tiene hábitos, su atributo vale 0 y lo dice.

| Código | Atributo | De dónde sale |
|---|---|---|
| STR | Fuerza | El hábito "Entrenar" (`trainingHabitId`), con su plan y sus pausas. Hasta la 2.2.0: entrenos cerrados en Ejercicios |
| VIT | Vitalidad | Media de los hábitos de *Salud y bienestar físico* |
| AGI | Agilidad | Ídem de *Hábitos a evitar* |
| INT | Inteligencia | Ídem de *Aprendizaje y conocimiento* |
| SEN | Concentración | Ídem de *Desarrollo personal y mental* |

Desde la 2.4.0 cada hábito aporta **constancia × experiencia** (`habitAttr()`):

- **Constancia** — cumplimiento a 30 días. Baja si lo dejas.
- **Experiencia** — veces cumplido en toda su historia, sobre un máximo de
  `ATTR_WEEKS` (12) semanas de sus días: 3 días por semana → 36; diario → 84. En
  los de evitar cuentan los días limpios.

Hasta la 2.3.x era solo la constancia, y con un hábito recién creado dos entrenos
de dos ya daban 100. Ahora sube como el nivel:

| Fuerza, entrenando 3 días por semana | Antes | Ahora |
|---|---:|---:|
| 2 entrenos, todos cumplidos | 100 | 6 |
| 3 semanas cumpliendo (9) | 100 | 25 |
| 6 semanas (18) | 100 | 50 |
| 12 semanas (36) | 100 | 100 |
| Después, 2 semanas sin entrenar | ~50 | ~50 |

Los atributos no se guardan: se calculan al abrir el Sistema, así que cambiar la
fórmula no toca datos. Debajo de cada barra se enseña de dónde sale el número
("Constancia 100% · Experiencia 2 de 36"), para que ninguno parezca inventado.
En `attributes()`.

---

## 7. Subida de nivel y ascensos

La **detección** vive en `grantXp()`: compara el nivel antes y después de sumar
y, si ha crecido, llama a `onLevelUp()`. Como toda la EXP entra por ahí, la
subida se detecta una sola vez y sin depender de la pantalla abierta.

La **presentación** es `UI.showLevelUp()`: un destello en la chapa de la
cabecera y una ventana a pantalla completa con el nuevo nivel, y el rango si lo
estrenas justo en ese nivel. Con los efectos apagados o el movimiento reducido
activado en el sistema, la ventana se sustituye por un aviso. Detección y
celebración están separadas a propósito.

### El registro de ascensos

`onLevelUp()` apunta la fecha **antes** de celebrar nada, en `game.levelLog`: un
apunte `{ level, date }` por nivel. Tres reglas lo mantienen honesto:

1. **Solo la primera vez.** La EXP es simétrica —desmarcar retira lo ganado— y se
   puede cruzar el mismo umbral varias veces. Un nivel ya apuntado no se repite
   ni se borra.
2. **Sin huecos.** Si un bono sube dos niveles de golpe, se apuntan los dos con
   la misma fecha.
3. **Sin inventar el pasado.** `game.levelLogFrom` es el nivel desde el que el
   registro es fiable: quien ya tenía nivel antes de la 1.6.3 empieza a contar
   desde él, y la tarjeta lo dice en vez de disimularlo.

---

## 8. Rachas

Hay **tres tipos de racha**, y conviene no mezclarlos.

### La racha de cumplimiento — `dayStreak()`

La del contador `◆` de la cabecera. **Días seguidos cumpliendo al menos el
listón** de hábitos.

El listón se elige en *Ajustes → La pantalla Hoy*:

| Ajuste | Cuántos hacen falta |
|---|---|
| 1, 2 o 3 hábitos | Ese número fijo |
| Un cuarto del día | `ceil(total / 4)` |
| La mitad del día | `ceil(total / 2)` |

Por defecto, **2**. Los modos proporcionales se calculan sobre los hábitos que
tocaban **ese** día, porque dos de nueve un miércoles y dos de tres un domingo no
son el mismo esfuerzo. Con 9 hábitos, un cuarto son 3 y la mitad son 5. El
listón nunca pide más de los que hay ni menos de uno. En `streakGoalFor()`.

### La racha de registro — `activityStreak()`

**Días seguidos apuntando algo**, aunque el día fuera malo. Cuenta cualquier
registro:

- marcar un hábito, apuntar una cantidad o un fallo de un hábito a evitar,
- apuntar el peso del día,
- escribir una nota del día,
- **o anotar el motivo de por qué el día no salió.**

Las **notas libres** de la pantalla Notas no cuentan: no van atadas a ningún
día, así que no dicen que te presentaras ese día.

Ese último punto es lo que la hace valiosa. Un día malo, contado con honestidad,
**mantiene la racha de registro y rompe la de cumplimiento**. No premia fingir:
premia aparecer y decir la verdad. Como la de cumplimiento sigue siendo
estricta, las dos juntas dicen cosas distintas en vez de repetirse.

### Reglas comunes a las dos

- **Hoy no corta.** Hasta medianoche sigues a tiempo: si hoy aún no llegas, la
  racha se cuenta desde ayer.
- **Los días sin nada programado son neutros.** Ni suman ni rompen. Romper una
  racha por un domingo sin hábitos sería castigarte por tu propio calendario.
- **Los días salvados con comodín** son neutros para la de cumplimiento. Para la
  de registro cuentan a favor: salvar el día ya es apuntarlo.
- **Los hábitos a evitar no cuentan** para el listón: están cumplidos desde las
  00:00 y harían que la racha corriera sola.
- **Los hábitos en pausa** no tocan esos días, así que tampoco entran en el
  total.
- **El plan de la semana manda.** Si una semana un hábito solo toca martes,
  jueves y sábado, el lunes no le tocaba: ni cuenta en el total ni rompe su
  racha. Por eso el plan no deja cambiar días ya pasados: quitar uno borraría
  un fallo a posteriori. Hoy solo se puede cambiar mientras la semana no esté
  confirmada; después queda bloqueada hasta el domingo.
- **Las ausencias programadas** son pausas con fecha: los hábitos elegidos no
  tocan esos días. Si durante un viaje mantienes alguno (Japonés, por
  ejemplo), el listón se calcula solo con ellos y nunca pide más de los que
  hay: con uno solo, hacerlo mantiene la racha. Si los pausas todos, los días
  son neutros y la racha te espera a la vuelta.

### En peligro — `streakAtRisk()`

El contador `◆` pasa de cian a **rojo** y su borde late cuando **hoy todavía no
llegas al listón** y la racha de cumplimiento tiene **3 días o más**. Por debajo
de 3 no avisa: no hay nada que valga la pena defender. Al tocarlo, el aviso dice
las dos rachas y cuántos hábitos faltan hoy.

Con la racha a 0, el contador desaparece y vuelve el rombo `◈` de la marca.

### Las rachas por hábito — `currentStreak()` y `bestStreak()`

Cada hábito tiene la suya, que se ve en su ficha y en *Rachas por hábito*. Mismas
reglas de perdón: los días que no le tocan y los días salvados no la cortan, y
hoy tampoco.

Las fichas *Mejor hábito ahora* y *Récord de un hábito* del Sistema, y los
logros *Racha de 7 / 30 días* y *Centurión*, miran **la mejor racha de un solo
hábito**, no las rachas generales de arriba. Hasta la 1.7.3 esas fichas se
llamaban *Racha actual* y *Mejor racha*, y se confundían con las generales.
`game.bestStreak` guarda ese récord. Los hábitos a evitar quedan fuera: tienen
su propio bloque, *Días sin*.

---

## 9. Anotar el día y los comodines

El botón *Anotar el día* de la pantalla Hoy aparece cuando quedó algo sin
cumplir. Abre un diálogo con seis motivos —🤒 Enfermedad · ✈️ Viaje · 💼 Día
imposible · 🪫 Sin energía · 🎉 Imprevisto · ✏️ Otro, con texto libre— y una
casilla: *Que este día no cuente*.

**Son dos cosas separadas a propósito:**

| | Precio | Efecto |
|---|---|---|
| Anotar el motivo | **Gratis, sin límite** | El día sigue contando como fallado; cuenta para la racha de registro |
| Que el día no cuente | **Un comodín** | El día queda neutro para la racha de cumplimiento y las de cada hábito |

Si salvar el día fuera gratis, siempre habría un motivo y la racha dejaría de
medir nada en dos semanas.

**Los comodines** viven en `game.freezes`: se gana **uno por semana**, cada
lunes, hasta un máximo de **cuatro**. Si no abres la app en un mes, al volver
recuperas los cuatro de golpe, no uno. Quitar la marca de un día salvado
devuelve el comodín. Sin comodines, el motivo se guarda igual y el día sigue
contando, y la app lo dice.

**El aviso de ayer.** Al arrancar, si ayer quedó por debajo del listón y no
anotaste por qué, sale un aviso con un botón para hacerlo. Una sola vez, sin
insistir.

**En la rejilla de la semana**: `✓` cumplido, `·` fallado con motivo, `❄`
salvado con comodín, `✕` fallado sin explicación.

**Datos antiguos.** Hasta la 1.7.1 un día congelado se guardaba como `true`.
Desde la 1.7.2 se lee como *salvado sin motivo* — que es exactamente lo que
significaba — y sigue salvado.

---

## 10. Logros

Quince, en `ACHIEVEMENTS`. Se evalúan en `earnedAchievements()` cada vez que
cambia algo y **no se pierden** una vez ganados (salvo con *Reiniciar
progresión*).

| | Logro | Condición |
|---|---|---|
| 🌱 | Primer despertar | Completar el primer hábito |
| ⚔️ | Cien misiones | 100 hábitos completados |
| 🏹 | Mil misiones | 1.000 hábitos completados |
| ⛓️ | Racha de 7 días | Un mismo hábito, 7 días seguidos |
| 🏔️ | Racha de 30 días | Un mismo hábito, 30 días seguidos |
| 💎 | Centurión | Un mismo hábito, 100 días seguidos |
| ⭐ | Día impecable | Cumplir todos los hábitos de hoy |
| 🏆 | Semana impecable | Últimos 7 días perfectos, con al menos 5 días con hábitos |
| 🔰 | Primer ascenso | Rango D (nivel 10) |
| 👑 | Soberano | Rango S (nivel 50) |
| 🌌 | Fuera de escala | Rango X (nivel 100) |
| 🗂️ | Archimaestro | Crear 10 hábitos (los de partida no cuentan) |
| ⚡ | Diez mil de EXP | 10.000 de EXP acumulada |
| 📝 | Cronista | 10 notas de día |
| 🧭 | Sin faltar un día | 90 días seguidos registrando algo |

*Misiones* son veces que se ha completado un hábito, sin contar los de evitar:
sus días limpios pasan solos y ahogarían el número real de cosas hechas.

*Sin faltar un día* es el único logro que se gana también en los días malos.

**Añadir un logro** son dos pasos: una entrada en `ACHIEVEMENTS` y su condición
en `earnedAchievements()`. El `id` no debe cambiar nunca: es lo que está guardado
en `game.achievements`.

---

## 11. Por qué la EXP no se puede duplicar

Ninguna acción paga por sí misma. Lo que paga es **la diferencia** entre el
estado de antes y el de después:

- `withScoring()` — hábitos. Compara si el hábito estaba cumplido y el bono del
  día, antes y después.
- `withTodayBonus()` — plan de la semana y ausencias. Confirmar un plan,
  programar una ausencia que empieza hoy o terminarla puede dejar el día
  perfecto o quitarle el bono; se mide el bono de hoy antes y después y se paga
  la diferencia. Planificar en sí no da EXP.

De ahí salen tres garantías:

1. Repetir una acción ya cumplida vale 0. Sumar páginas a una lectura ya
   cumplida no suma más.
2. Deshacer devuelve exactamente lo que dio, bonos incluidos.
3. Volver a abrir una pantalla no cambia ningún estado, así que no paga nada.

Sin esto, marcar y desmarcar en bucle sería una máquina de fabricar niveles.

Con la app abierta en dos ventanas (la instalada y una pestaña), cada una gana
su EXP por su lado. Desde la 2.3.4, al mezclar lo que guardan, la EXP se suma
(lo que tenían en común más lo ganado en cada una) en lugar de quedarse con la
cifra de una sola.

**Lo que no da EXP, a propósito:** anotar el motivo de un día malo. Pagaría por
declarar días malos y acabarías inventándolos. Su recompensa es que la racha de
registro sobrevive.

---

## 12. Reiniciar la progresión

*Ajustes → Reiniciar progresión* (`resetProgress()`) pone a cero la EXP, los
logros, el récord de racha, la EXP cobrada por hitos de "evitar" y el registro
de ascensos. **No toca** los hábitos, su histórico, las notas, las marcas de día
ni las ausencias — es la diferencia con *Borrar todo*.

---

## 13. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tabla de EXP, bonos y previsión | `js/stats.js` — `XP`, `dayBonus()`, `pendingToday()` |
| Curva y rangos | `js/stats.js` — `XP_TABLE`, `XP_STEP`, `xpForLevel()`, `levelFromXp()`, `RANKS` |
| Atributos | `js/stats.js` — `attributes()` |
| Rachas generales | `js/stats.js` — `dayStreak()`, `activityStreak()`, `streakGoalFor()`, `streakAtRisk()` |
| Rachas por hábito | `js/stats.js` — `currentStreak()`, `bestStreak()`, `topStreak()` |
| Hitos de "evitar" | `js/stats.js` — `AVOID_MILESTONES` |
| Logros | `js/stats.js` — `ACHIEVEMENTS`, `earnedAchievements()` |
| Reparto de EXP y subida | `js/app.js` — `grantXp()`, `withScoring()`, `withTodayBonus()`, `onLevelUp()` |
| Marcas de día y comodines | `js/store.js` — `setDayMark()`, `clearDayMark()`, `isFrozen()`, `refillFreezes()` |
| Plan de la semana | `js/store.js` — `activeDaysFor()`, `confirmWeekPlan()`, `undoWeekPlan()`, `isWeekLocked()` · `js/app.js` — `confirmPlan()` |
| Ausencias | `js/store.js` — `addAbsence()`, `getAbsences()`, `cancelAbsence()` · `js/app.js` — `onAbsenceSubmit()`, `cancelAbsence()` |
| Resumen semanal y peso objetivo | `js/stats.js` — `weekSummary()`, `weightGoal()` |
| Registro de ascensos | `js/store.js` — `recordLevelUp()` · `js/ui.js` — `renderAscents()` |
| Pintado del Sistema | `js/ui.js` — `renderProgress()`, `renderLevelPanel()`, `renderStreakPair()` |
| Contador de la cabecera | `js/ui.js` — `renderStreakChip()`, `streakMessage()` |
| Motivos de un día | `js/utils.js` — `DAY_REASONS` |
| Estilos del panel de sistema | `css/styles.css`, sección 8d |
