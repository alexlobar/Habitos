# Sistema de progresión

Referencia completa de la EXP, los niveles, los rangos, los atributos, los
logros y las rachas. El `README.md` lo resume; esto es el detalle, pensado para
consultarlo cuando haya que tocar la curva, añadir una recompensa o entender por
qué una racha se ha roto.

Versión documentada: **1.7.2** · esquema de datos **v10**.

Todas las cuentas viven en `js/stats.js`. Ninguna vista las repite: piden el
dato y pintan lo que reciben.

---

## 1. La pantalla Progreso

Se abre tocando la chapa de nivel y rango de la cabecera (ya no está en la
barra de navegación). De arriba abajo:

| # | Bloque | Qué muestra |
|---|---|---|
| 1 | Panel de nivel | Nivel, rango, barra de EXP con previsión, EXP del nivel y total |
| 2 | Estado del jugador | Los cinco atributos (sección 6) |
| 3 | Tus dos rachas | Cumpliendo y registrando, cada una con su regla (sección 8) |
| 4 | Cuatro fichas | Racha actual, mejor racha, misiones completadas, logros |
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
   (hábito, bono del día, ejercicio, entreno, hito de "evitar")
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
| Completar un hábito | **20** |
| Día bueno: cumplir el 80% o más de los hábitos del día | **+25%** de lo ganado en hábitos ese día |
| Día perfecto: cumplirlos todos | **+50%** de lo ganado en hábitos ese día |
| Completar un ejercicio (todas sus series) | **10** |
| Completar todos los ejercicios del día | **+50%** de lo ganado en ejercicios |
| Cerrar el entrenamiento | **50** |
| Cumplir un objetivo | 100 — *definido, sin acción que lo dispare* |

Los bonos son un porcentaje y no una cantidad fija para que escalen con lo que
haces: un día perfecto con nueve hábitos vale más que uno con tres. Y tienen dos
escalones para que fallar un hábito no tire por tierra la jornada entera.

Cerrar el entreno marca además el hábito "Entrenar", que paga sus 20 como
cualquier otro.

### Un día de ejemplo

Con los hábitos de partida tocan **9 al día** de lunes a sábado y 10 el domingo
(los tres hábitos a evitar no cuentan).

| Día | Cuenta | EXP |
|---|---|---:|
| 7 de 9 | 7 × 20 — por debajo del 80%, sin bono | 140 |
| 8 de 9 | 160 + 25% (40) | 200 |
| 9 de 9 | 180 + 50% (90) | 270 |
| 9 de 9 con entreno de 4 ejercicios | 270 + 40 + 20 + 50 | 380 |

### Hábitos a evitar

No dan EXP a diario: su día empieza limpio a las 00:00, así que no hay ningún
"pasó a cumplido" que premiar. Cobran por aguantar, por hábito:

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
- `XP_STEP` (50) — el paso de la progresión.

Subir al nivel *n* cuesta `50·(n+1)`: 100, 150, 200, 250… La fórmula cerrada

```
xpForLevel(n) = 25 · n · (n + 3)
```

reproduce la tabla al dígito, así que la tabla y la continuación empalman sin
escalón. La tabla se conserva porque es la que se lee de un vistazo; la fórmula
es la que escala.

| Nivel | EXP total | Cuesta | Rango |
|---:|---:|---:|---|
| 0 | 0 | — | E · Novato |
| 1 | 100 | 100 | E |
| 2 | 250 | 150 | E |
| 5 | 1.000 | 300 | E |
| 9 | 2.700 | 500 | E |
| 10 | 3.250 | 550 | D · Aprendiz |
| 20 | 11.500 | 1.050 | C · Combatiente |
| 30 | 24.750 | 1.550 | B · Élite |
| 40 | 43.000 | 2.050 | A · Maestro |
| 50 | 66.250 | 2.550 | S · Soberano |
| 60 | 94.500 | 3.050 | SS · Monarca |
| 70 | 127.750 | 3.550 | SS+ · Monarca supremo |
| 80 | 166.000 | 4.050 | SSS · Leyenda |
| 90 | 209.250 | 4.550 | SSS+ · Leyenda eterna |
| 100 | 257.500 | 5.050 | X · Fuera de escala |

`levelFromXp()` hace el camino inverso: parte de la solución de la ecuación y
ajusta con un bucle corto, para que un redondeo de coma flotante nunca devuelva
un nivel que no case con `xpForLevel()`. Comprobado en las 400 fronteras hasta
el nivel 200.

**Cambiar la curva** es tocar `XP_TABLE` y `XP_STEP`, y nada más.

### Ritmo orientativo

Con los hábitos de partida y sin contar los hitos de "evitar":

| Ritmo diario | Rango S (nivel 50) | Rango X (nivel 100) |
|---|---:|---:|
| 200 EXP — días buenos | ~330 días | ~3 años y medio |
| 270 EXP — días perfectos | ~245 días | ~2 años y medio |
| 380 EXP — perfectos con entreno | ~175 días | ~1 año y 10 meses |

Son cuentas a ritmo constante: cualquier cambio en el número de hábitos las
mueve.

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
| STR | Fuerza | Entrenos cerrados en los últimos 30 días (12 = 100) |
| VIT | Vitalidad | Cumplimiento medio a 30 días de *Salud y bienestar físico* |
| AGI | Agilidad | Ídem de *Hábitos a evitar* |
| INT | Inteligencia | Ídem de *Aprendizaje y conocimiento* |
| SEN | Concentración | Ídem de *Desarrollo personal y mental* |

Debajo de cada barra se enseña de dónde sale el número, para que ninguno parezca
inventado. En `attributes()`.

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
- apuntar una serie de entrenamiento,
- escribir una nota del día,
- **o anotar el motivo de por qué el día no salió.**

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

**Ojo con esto**: las fichas *Racha actual* y *Mejor racha* de Progreso, y los
logros *Racha de 7 / 30 días* y *Centurión*, miran **la mejor racha de un solo
hábito**, no las rachas generales de arriba. `game.bestStreak` guarda ese
récord. Los hábitos a evitar quedan fuera: tienen su propio bloque, *Días sin*.

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
| 🔥 | Racha de 7 días | Un mismo hábito, 7 días seguidos |
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
- `withWorkoutScoring()` — ejercicios. Compara cuántos estaban completos, el
  bono de todos los ejercicios y si la sesión estaba cerrada.

De ahí salen tres garantías:

1. Repetir una acción ya cumplida vale 0. Una serie extra sobre un ejercicio
   completo no suma.
2. Deshacer devuelve exactamente lo que dio, bonos incluidos.
3. Volver a abrir una pantalla no cambia ningún estado, así que no paga nada.

Sin esto, marcar y desmarcar en bucle sería una máquina de fabricar niveles.

**Lo que no da EXP, a propósito:** anotar el motivo de un día malo. Pagaría por
declarar días malos y acabarías inventándolos. Su recompensa es que la racha de
registro sobrevive.

---

## 12. Reiniciar la progresión

*Ajustes → Reiniciar progresión* (`resetProgress()`) pone a cero la EXP, los
logros, el récord de racha, la EXP cobrada por hitos de "evitar" y el registro
de ascensos. **No toca** los hábitos, su histórico, las notas, las marcas de día
ni los entrenos — es la diferencia con *Borrar todo*.

---

## 13. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tabla de EXP, bonos y previsión | `js/stats.js` — `XP`, `dayBonus()`, `exerciseBonus()`, `pendingToday()` |
| Curva y rangos | `js/stats.js` — `XP_TABLE`, `XP_STEP`, `xpForLevel()`, `levelFromXp()`, `RANKS` |
| Atributos | `js/stats.js` — `attributes()` |
| Rachas generales | `js/stats.js` — `dayStreak()`, `activityStreak()`, `streakGoalFor()`, `streakAtRisk()` |
| Rachas por hábito | `js/stats.js` — `currentStreak()`, `bestStreak()`, `topStreak()` |
| Hitos de "evitar" | `js/stats.js` — `AVOID_MILESTONES` |
| Logros | `js/stats.js` — `ACHIEVEMENTS`, `earnedAchievements()` |
| Reparto de EXP y subida | `js/app.js` — `grantXp()`, `withScoring()`, `withWorkoutScoring()`, `onLevelUp()` |
| Marcas de día y comodines | `js/store.js` — `setDayMark()`, `clearDayMark()`, `isFrozen()`, `refillFreezes()` |
| Registro de ascensos | `js/store.js` — `recordLevelUp()` · `js/ui.js` — `renderAscents()` |
| Pintado de Progreso | `js/ui.js` — `renderProgress()`, `renderLevelPanel()`, `renderStreakPair()` |
| Contador de la cabecera | `js/ui.js` — `renderStreakChip()`, `streakMessage()` |
| Motivos de un día | `js/utils.js` — `DAY_REASONS` |
| Estilos del panel de sistema | `css/styles.css`, sección 8d |
