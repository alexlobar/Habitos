# Sistema de progresión — XP, niveles y rangos

Documento de referencia del sistema de experiencia. El `README.md` lo resume en
un par de párrafos; esto es el detalle completo, pensado para consultarlo cuando
haya que tocar la curva, añadir una recompensa o entender por qué la XP no se
duplica.

Versión de la app al escribirlo: **1.0.0**.

---

## 1. La pantalla Progreso, de arriba abajo

| Orden | Bloque | Qué muestra | ¿Nuevo en 1.0.0? |
|---|---|---|---|
| 1 | Panel de nivel | Nivel, rango, barra, XP actual / necesaria, XP restante | **Sí** |
| 2 | Cuatro fichas | Esta semana, este mes, racha actual, mejor racha | No |
| 3 | Calendario | Mes o año, coloreado por intensidad de cumplimiento | No |
| 4 | Evolución | Gráfica día a día o mes a mes, con tabla de datos | No |
| 5 | Rachas por hábito | Racha actual y récord de cada hábito | No |
| 6 | Logros | Nueve insignias, bloqueadas o desbloqueadas | No |

El panel de nivel se insertó **encima** de lo que ya había. No se quitó ni se
sustituyó ninguna estadística.

### Dentro del panel de nivel

```
                NIVEL
                  1
               NOVATO
        ████████░░░░░░░░░░░░░░
            125 / 250 XP
      125 XP para subir de nivel
```

Nivel y rango se muestran **por separado**, con jerarquías distintas: la cifra
manda y el rango la acompaña. El rango nunca sustituye al nivel.

---

## 2. La cadena de la experiencia

```
   Acciones que dan XP
   (hábito, ejercicio, entreno)
              │
              ▼
        grantXp()                  ← único punto de entrada  ·  js/app.js
              │
              ▼
       game.points                 ← lo único que se guarda  ·  localStorage
              │
              ▼
      levelInfo(xp)                ← consulta XP_TABLE y RANKS  ·  js/stats.js
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
   Nivel    Rango   Barra de XP
```

**Solo se guarda `game.points`.** El nivel, el rango y el porcentaje se calculan
al vuelo en cada pintado. Consecuencia práctica: cambiar la curva de experiencia
no obliga a migrar nada y no puede corromper datos de nadie.

---

## 3. La curva de niveles

Definida en `js/stats.js`:

- `XP_TABLE` — los niveles 0 a 9, escritos a mano. **El índice del array es el
  nivel**: se empieza en el 0, no en el 1.
- `XP_STEP` (50) — el paso de la progresión a partir de ahí.

| Nivel | XP total | Cuesta | Rango |
|---:|---:|---:|---|
| 0 | 0 | — | Novato |
| 1 | 100 | 100 | Novato |
| 2 | 250 | 150 | Novato |
| 3 | 450 | 200 | Novato |
| 4 | 700 | 250 | Novato |
| 5 | 1.000 | 300 | Novato |
| 6 | 1.350 | 350 | Novato |
| 7 | 1.750 | 400 | Novato |
| 8 | 2.200 | 450 | Novato |
| 9 | 2.700 | 500 | Novato |
| 10 | 3.250 | 550 | Aprendiz |
| 11 | 3.850 | 600 | Aprendiz |
| 20 | 11.500 | 1.050 | Combatiente |
| 30 | 24.750 | 1.550 | Élite |
| 40 | 43.000 | 2.050 | Maestro |
| 50 | 66.250 | 2.550 | ??? |

### Por qué hay tabla y fórmula a la vez

La columna "cuesta" sube siempre de 50 en 50: llegar al nivel *n* cuesta
`50·(n+1)`. Esa regularidad permite que del nivel 9 en adelante no haga falta
seguir escribiendo filas:

```
xpForLevel(n) = 25 · n · (n + 3)
```

Esa fórmula **reproduce las diez filas de la tabla al dígito**, así que tabla y
continuación empalman sin escalón. La tabla se conserva porque es la que se lee
de un vistazo; la fórmula es la que escala.

### Por qué se empieza en 0 y no en 1

Porque el nivel 0 es la casilla de salida: aún no has ganado nada. Y de paso
cuadra los rangos — antes Novato cubría nueve niveles y todos los demás diez;
ahora todos cubren diez.

`levelFromXp()` hace el camino inverso: parte de la solución de la ecuación y
después ajusta con un bucle corto, para que un redondeo de coma flotante nunca
pueda devolver un nivel que no case con `xpForLevel()`. Comprobado en las 400
fronteras hasta el nivel 200.

### Cambiar la curva

Se tocan `XP_TABLE` y `XP_STEP`, y nada más. Ninguna vista calcula niveles por su
cuenta: todas piden `levelInfo(xp)` y pintan lo que devuelve.

---

## 4. Rangos

| Niveles | Rango |
|---|---|
| 0 – 9 | Novato |
| 10 – 19 | Aprendiz |
| 20 – 29 | Combatiente |
| 30 – 39 | Élite |
| 40 – 49 | Maestro |
| 50 en adelante | ??? |

En `RANKS` (`js/stats.js`). Cada fila tiene `id`, `from` y `name`; gana la última
cuyo `from` no supera el nivel. Añadir un rango es añadir una fila — y el `id`
está ahí para poder colgarle después un color o un título propio.

---

## 5. Qué da XP

| Acción | XP | Estado |
|---|---:|---|
| Completar un hábito | +10 | Conectado |
| Día perfecto (todos los hábitos) | +5 | Conectado |
| Completar un ejercicio | +10 | Conectado |
| Completar todos los ejercicios del día | +25 | Conectado |
| Cerrar un entrenamiento | +50 | Conectado |
| Cumplir un objetivo | +100 | **Pendiente** |

Los malos hábitos (tipo `avoid`) **no dan XP a diario**: su día empieza limpio,
así que no hay ningún "pasó a cumplido" que premiar. Cobran por aguantar:

| Hito | XP |
|---|---:|
| 7 días limpio | +50 |
| 30 días limpio | +150 |
| 100 días limpio | +400 |

En `AVOID_MILESTONES`. Se calculan sobre la **mejor racha histórica**, que nunca
baja, y `game.avoidXpPaid` lleva la cuenta de lo ya cobrado. De ahí salen dos
garantías: un hito no se puede cobrar dos veces, y una recaída no retira XP que
ya te habías ganado.

Los valores viven en `XP`, en `js/stats.js`. Los de hábito y día perfecto ya
existían desde la v1 con esas cifras y se mantienen para que la XP acumulada
siga significando lo mismo.

### El pendiente

No existe en la app ningún concepto de "objetivo" distinto de la meta de un
hábito, que ya paga sus 10. El valor está definido en `XP.goal` y conectarlo será
una línea — `grantXp(St.XP.goal)` — en cuanto decidamos qué acción lo dispara.

---

## 6. Por qué la XP no se puede duplicar

Ninguna acción "paga" por sí misma. Lo que paga es **la diferencia** entre el
estado de antes y el de después:

- `withScoring()` — hábitos. Compara si el hábito estaba cumplido y si el día era
  perfecto, antes y después.
- `withWorkoutScoring()` — ejercicios. Compara cuántos ejercicios estaban
  completos, si lo estaban todos y si la sesión estaba cerrada.

De ahí salen tres garantías:

1. Repetir una acción ya cumplida vale 0. Una serie extra sobre un ejercicio
   completo no suma.
2. Deshacer devuelve exactamente lo que dio. Reabrir un entreno resta los mismos
   60 que dio al cerrarlo.
3. Volver a abrir una pantalla no cambia ningún estado, así que no paga nada.

Sin esto, marcar y desmarcar en bucle sería una máquina de fabricar niveles.

### Comprobado

| Prueba | Resultado |
|---|---|
| Reabrir Progreso 3 veces seguidas | 0 XP |
| Serie extra sobre un ejercicio ya completo | 0 XP |
| Quitar la serie que completó un ejercicio | −10 XP |
| Completar los 4 ejercicios de una rutina | 40 + 25 = 65 XP |
| Cerrar entreno / reabrir / cerrar | +60 / −60 / +60 |
| Tabla de niveles frente a la fórmula | 10 de 10 exactas |
| Inversa XP → nivel en cada frontera hasta el 200 | 400 de 400 |

---

## 7. Subida de nivel

La **detección** vive en `grantXp()`: compara el nivel antes y después de sumar,
y si ha crecido llama a `onLevelUp()`. Como toda la XP entra por ahí, la subida
se detecta una sola vez y sin depender de qué pantalla esté abierta.

La **presentación** es `UI.showLevelUp()`: aviso, destello en la chapa de la
cabecera y confeti si los efectos están activos. Están separadas a propósito —
cambiar la celebración no toca la regla de cuándo se ha subido.

---

## 8. Migración desde versiones anteriores

`game.points` ya era un acumulador de experiencia desde la v1, así que se
reutiliza tal cual: **cero migración, cero riesgo de pérdida**.

Lo que sí cambia es la curva, y además la numeración empieza en 0. Un usuario
que venía de antes verá un nivel más bajo que el que tenía: la curva vieja daba
el nivel 2 a los 50 puntos, y ahora con 50 de XP se sigue en el nivel 0.

**No se pierde XP** — solo se reinterpreta. Se decidió así antes que inventar
una conversión que falsease el historial. Y como el nivel no se guarda, la
próxima vez que cambiemos la curva pasará exactamente lo mismo: números
distintos, mismos datos.

---

## 9. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Curva, rangos y tabla de recompensas | `js/stats.js`, sección *Niveles y rangos* |
| Reparto de XP y detección de subida | `js/app.js`, `grantXp()` |
| Almacenamiento (`game.points`) | `js/store.js` |
| Pintado del panel y celebración | `js/ui.js`, `renderLevelPanel()` y `showLevelUp()` |
| Marcado del panel | `index.html`, dentro de `#view-progress` |
| Estilos | `css/styles.css`, sección 8d |
