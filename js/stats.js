/* ============================================================
   stats.js — Reglas de negocio: qué cuenta como completado,
   rachas, porcentajes, niveles y logros. Funciones puras sobre
   los datos del store; no escriben nada ni tocan el DOM.
   ============================================================ */
window.HT = window.HT || {};

HT.stats = (function () {
  'use strict';

  const U = HT.utils;
  const S = HT.store;

  const SLOT_LABELS = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' };

  const MAX_LOOKBACK = 3650;     // 10 años: tope de seguridad en los bucles

  /* ── Tabla de recompensas de XP ───────────────────────────
     Único sitio donde se decide cuánta XP vale cada acción. Quien reparte
     la XP es app.js, siempre comparando el estado antes y después de la
     acción: así una acción ya cumplida no vuelve a pagar por reabrir una
     pantalla, y deshacerla devuelve exactamente lo mismo que dio.
     `habit` y `perfectDay` ya existían con estos valores desde la v1: no
     se tocan para que la XP acumulada siga significando lo mismo. ──── */
  const XP = {
    habit: 10,          // completar un hábito del día
    perfectDay: 5,      // cumplir todos los hábitos de un día
    exercise: 10,       // completar todas las series de un ejercicio
    workout: 50,        // cerrar un entrenamiento
    allExercises: 25,   // extra al completar todos los ejercicios del día
    goal: 100           // cumplir un objetivo — todavía sin acción que lo dispare
  };

  // Nombres anteriores, conservados porque app.js y otros los usan.
  const POINTS_PER_HABIT = XP.habit;
  const POINTS_PERFECT_DAY = XP.perfectDay;

  /* ── Completado y progreso ────────────────────────────────── */

  /** ¿Este hábito "toca" ese día? */
  function isActiveOn(habit, dateKey) {
    if (habit.createdAt > dateKey) return false;
    return habit.activeDays.indexOf(U.fromKey(dateKey).getDay()) >= 0;
  }

  /** ¿Es un hábito que se quiere dejar? Su lógica va al revés. */
  function isAvoid(habit) {
    return habit.type === 'avoid';
  }

  /** ¿El valor registrado cumple la meta del hábito? */
  function isComplete(habit, value) {
    // Un mal hábito se cumple por omisión: el día empieza limpio y solo deja
    // de estarlo si se registra una recaída. Por eso se mira ANTES del null:
    // "no hay nada apuntado" es precisamente el caso bueno.
    if (isAvoid(habit)) return value !== true;

    if (value === null || value === undefined) return false;

    if (habit.type === 'check') return value === true;
    if (habit.type === 'quantity') return Number(value) >= habit.target.amount;

    return habit.slots.every(function (s) { return value[s] === true; });
  }

  /** Progreso 0–1 del hábito ese día (para barras y heatmap parcial). */
  function progressOf(habit, value) {
    if (isAvoid(habit)) return value === true ? 0 : 1;
    if (value === null || value === undefined) return 0;

    if (habit.type === 'check') return value === true ? 1 : 0;

    if (habit.type === 'quantity') {
      return U.clamp(Number(value) / habit.target.amount, 0, 1);
    }

    const done = habit.slots.filter(function (s) { return value[s] === true; }).length;
    return habit.slots.length ? done / habit.slots.length : 0;
  }

  /**
   * Qué pasó con un hábito un día concreto:
   *   'done'   cumplido
   *   'skip'   no tocaba, o el día está congelado con un comodín
   *   'missed' tocaba y no se cumplió
   * Solo 'missed' corta una racha.
   */
  function dayOutcome(habit, dateKey) {
    if (!isActiveOn(habit, dateKey)) return 'skip';
    if (isComplete(habit, S.getLog(habit.id, dateKey))) return 'done';
    return S.isFrozen(dateKey) ? 'skip' : 'missed';
  }

  /* Los hábitos que se hacen y los que se dejan se cuentan por separado.
     Si los segundos entrasen en los porcentajes, el día empezaría ya con
     ellos cumplidos y las medias medirían lo que evitas, no lo que haces. */

  function doHabitsFor(dateKey) {
    return S.getHabitsForDate(dateKey).filter(function (h) { return !isAvoid(h); });
  }

  function avoidHabitsFor(dateKey) {
    return S.getHabitsForDate(dateKey).filter(isAvoid);
  }

  /** Resumen de un día: cuántos hábitos tocaban y cuántos se cumplieron. */
  function dayStats(dateKey) {
    const habits = doHabitsFor(dateKey);
    let done = 0;
    let partial = 0;

    habits.forEach(function (h) {
      const value = S.getLog(h.id, dateKey);
      if (isComplete(h, value)) done++;
      else partial += progressOf(h, value);
    });

    const total = habits.length;
    const avoid = avoidHabitsFor(dateKey);
    const slips = avoid.filter(function (h) {
      return S.getLog(h.id, dateKey) === true;
    }).length;

    return {
      total: total,
      done: done,
      pct: total ? Math.round((done / total) * 100) : 0,
      // El heatmap valora el esfuerzo parcial: 20/30 min tiñen la celda.
      ratio: total ? (done + partial) / total : 0,
      perfect: total > 0 && done === total,
      frozen: S.isFrozen(dateKey),
      // Aparte, y sin entrar en pct, ratio ni perfect.
      avoidTotal: avoid.length,
      slips: slips
    };
  }

  /** Los cuatro escalones de la escala "Menos → Más". 0 = nada hecho. */
  function levelFromRatio(ratio) {
    if (ratio <= 0) return 0;
    return U.clamp(Math.ceil(ratio * 4), 1, 4);
  }

  /** Nivel de color 0–4 de una celda del heatmap. `null` = día sin hábitos. */
  function heatLevel(day) {
    if (!day.total) return null;
    return levelFromRatio(day.ratio);
  }

  /** La misma escala, pero mirando un solo hábito. */
  function habitDayLevel(habit, dateKey) {
    if (!isActiveOn(habit, dateKey)) return null;
    return levelFromRatio(progressOf(habit, S.getLog(habit.id, dateKey)));
  }

  /* ── Rachas ───────────────────────────────────────────────── */

  /**
   * Días consecutivos cumplidos hasta hoy. Los días en que el hábito
   * no toca se saltan sin romper la racha, y el día en curso no la
   * rompe hasta que termina: si hoy aún está pendiente, se cuenta
   * hasta ayer en vez de devolver 0.
   */
  function currentStreak(habit, todayKey) {
    const today = todayKey || U.todayKey();
    let key = today;

    if (dayOutcome(habit, key) === 'missed') key = U.addDaysKey(key, -1);

    let count = 0;
    for (let i = 0; i < MAX_LOOKBACK && key >= habit.createdAt; i++) {
      const outcome = dayOutcome(habit, key);
      if (outcome === 'missed') break;
      if (outcome === 'done') count++;
      key = U.addDaysKey(key, -1);
    }
    return count;
  }

  /** Racha más larga desde que existe el hábito. */
  function bestStreak(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const span = U.daysBetween(habit.createdAt, today);
    if (span < 0) return 0;

    let best = 0;
    let run = 0;
    let key = habit.createdAt;

    for (let i = 0; i <= span && i < MAX_LOOKBACK; i++) {
      const outcome = dayOutcome(habit, key);
      if (outcome === 'done') {
        run++;
        if (run > best) best = run;
      } else if (outcome === 'missed' && key !== today) {
        run = 0;      // el día en curso no corta la racha
      }
      key = U.addDaysKey(key, 1);
    }
    return best;
  }

  /** La racha viva más larga entre todos los hábitos. */
  function topStreak(todayKey) {
    return S.getHabits().reduce(function (max, h) {
      return Math.max(max, currentStreak(h, todayKey));
    }, 0);
  }

  /* ── Porcentajes de cumplimiento ──────────────────────────── */

  function daysFromTo(firstKey, lastKey) {
    const out = [];
    for (let k = firstKey; k <= lastKey; k = U.addDaysKey(k, 1)) out.push(k);
    return out;
  }

  /** % de hábito-días cumplidos en un rango de fechas. */
  function rateOver(dateKeys) {
    let total = 0;
    let done = 0;

    dateKeys.forEach(function (key) {
      const d = dayStats(key);
      total += d.total;
      done += d.done;
    });

    return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  /** Semana en curso: desde su primer día hasta hoy (no cuenta el futuro). */
  function weekRate(todayKey, weekStart) {
    const today = todayKey || U.todayKey();
    const first = U.toKey(U.startOfWeek(U.fromKey(today), weekStart));
    return rateOver(daysFromTo(first, today));
  }

  /** Mes en curso: del día 1 a hoy. */
  function monthRate(todayKey) {
    const today = todayKey || U.todayKey();
    return rateOver(daysFromTo(today.slice(0, 8) + '01', today));
  }

  /* ── Entrenamiento ────────────────────────────────────────
     El volumen de un ejercicio de repes y el de uno de tiempo
     no son la misma unidad, así que se cuentan por separado.
     ──────────────────────────────────────────────────────── */

  /** ¿Se han hecho ya todas las series previstas de este ejercicio? */
  function exerciseDone(exercise, sets) {
    return sets.length >= exercise.sets;
  }

  function sessionSummary(dateKey, exercises) {
    let setCount = 0;
    let reps = 0;
    let seconds = 0;
    let complete = 0;

    exercises.forEach(function (ex) {
      const sets = S.getSets(dateKey, ex.id);
      setCount += sets.length;

      const sum = sets.reduce(function (a, b) { return a + b; }, 0);
      if (ex.kind === 'time') seconds += sum; else reps += sum;

      if (exerciseDone(ex, sets)) complete++;
    });

    return {
      sets: setCount,
      reps: reps,
      seconds: seconds,
      complete: complete,
      total: exercises.length,
      pct: exercises.length ? Math.round((complete / exercises.length) * 100) : 0
    };
  }

  /** Mejor serie y mejor sesión de un ejercicio, para ver si progresas. */
  function exerciseRecord(exerciseId) {
    let bestSet = 0;
    let bestSession = 0;
    let sessions = 0;

    const all = S.getState().sessions;
    Object.keys(all).forEach(function (dateKey) {
      const sets = all[dateKey].sets[exerciseId];
      if (!sets || !sets.length) return;

      sessions++;
      const top = Math.max.apply(null, sets);
      const sum = sets.reduce(function (a, b) { return a + b; }, 0);
      if (top > bestSet) bestSet = top;
      if (sum > bestSession) bestSession = sum;
    });

    return { bestSet: bestSet, bestSession: bestSession, sessions: sessions };
  }

  /* ── Rejilla semanal ──────────────────────────────────────
     Una fila por hábito y una columna por día, con el estado de
     cada casilla. Sirve de plan (qué toca cuándo) y de marcador
     (qué llevas hecho). ───────────────────────────────────── */

  function cellState(habit, dateKey, today) {
    if (!isActiveOn(habit, dateKey)) return 'off';
    if (isComplete(habit, S.getLog(habit.id, dateKey))) return 'done';
    if (S.isFrozen(dateKey)) return 'frozen';
    if (dateKey > today) return 'future';
    return dateKey === today ? 'pending' : 'missed';
  }

  function weekMatrix(dateKeys, todayKey) {
    const today = todayKey || U.todayKey();
    const last = dateKeys[dateKeys.length - 1];

    return S.getHabits()
      // Los de "dejar" no salen en la rejilla: no son un plan que cumplir,
      // y su fila saldría entera en verde sin haber hecho nada.
      .filter(function (habit) { return habit.createdAt <= last && !isAvoid(habit); })
      .map(function (habit) {
        const cells = dateKeys.map(function (key) {
          const state = cellState(habit, key, today);
          const ratio = state === 'off' ? 0 : progressOf(habit, S.getLog(habit.id, key));
          return {
            key: key,
            state: state,
            ratio: ratio,
            // Mismo escalonado que el heatmap: el relleno cuenta el avance
            // real, y el borde se reserva para el estado del día.
            level: state === 'off' ? 0 : levelFromRatio(ratio)
          };
        });

        return {
          habit: habit,
          cells: cells,
          due: cells.filter(function (c) { return c.state !== 'off'; }).length,
          done: cells.filter(function (c) { return c.state === 'done'; }).length
        };
      });
  }

  /* ── Series para la gráfica ───────────────────────────────
     `hasData` separa dos cosas que no deben verse igual: un día
     al 0% (tenía hábitos y no se cumplió ninguno) y un día sin
     nada que cumplir o todavía por llegar. ────────────────── */

  /** Un punto por día del mes. */
  function monthSeries(year, month, todayKey) {
    const today = todayKey || U.todayKey();
    const out = [];

    for (let d = 1; d <= U.daysInMonth(year, month); d++) {
      const key = U.toKey(new Date(year, month, d));
      const day = dayStats(key);
      out.push({
        key: key,
        label: String(d),
        full: U.formatShort(U.fromKey(key)),
        pct: day.pct,
        done: day.done,
        total: day.total,
        hasData: day.total > 0 && key <= today,
        // `touched` distingue "no cumpliste nada" de "no hay nada registrado":
        // lo segundo es lo que merece un estado vacío en vez de una rejilla.
        touched: day.ratio > 0
      });
    }
    return out;
  }

  /** Un punto por mes del año, agregando todos sus días. */
  function yearSeries(year, todayKey) {
    const today = todayKey || U.todayKey();
    const out = [];

    for (let m = 0; m < 12; m++) {
      let total = 0;
      let done = 0;
      let touched = false;

      for (let d = 1; d <= U.daysInMonth(year, m); d++) {
        const key = U.toKey(new Date(year, m, d));
        if (key > today) break;
        const day = dayStats(key);
        total += day.total;
        done += day.done;
        if (day.ratio > 0) touched = true;
      }

      out.push({
        key: year + '-' + String(m + 1).padStart(2, '0'),
        label: U.monthName(m),
        full: U.monthName(m) + ' ' + year,
        pct: total ? Math.round((done / total) * 100) : 0,
        done: done,
        total: total,
        hasData: total > 0,
        touched: touched
      });
    }
    return out;
  }

  /**
   * Cumplimiento agregado de la serie, para el resumen de la gráfica.
   * Solo cuenta los periodos ya vividos: incluir los que faltan haría
   * parecer fallado un mes que apenas ha empezado.
   */
  function seriesRate(series) {
    let total = 0;
    let done = 0;

    series.forEach(function (p) {
      if (!p.hasData) return;
      total += p.total;
      done += p.done;
    });

    return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  /* ── Análisis de un solo hábito ───────────────────────────── */

  /** % de días cumplidos por ese hábito en los últimos `n` días activos. */
  function habitRate(habit, todayKey, n) {
    const today = todayKey || U.todayKey();
    let total = 0;
    let done = 0;

    U.lastNDays(today, n).forEach(function (key) {
      const outcome = dayOutcome(habit, key);
      if (outcome === 'skip') return;
      total++;
      if (outcome === 'done') done++;
    });

    return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  /** Cuántas veces se ha cumplido en toda su historia. */
  function habitTotal(habit) {
    const logs = S.getHabitLogs(habit.id);

    // En un mal hábito el registro guarda recaídas, no logros: los días
    // limpios son los que han pasado menos las veces que se cayó.
    if (isAvoid(habit)) {
      const span = U.daysBetween(habit.createdAt, U.todayKey()) + 1;
      return Math.max(0, span - Object.keys(logs).length);
    }

    return Object.keys(logs).filter(function (key) {
      return isComplete(habit, logs[key]);
    }).length;
  }

  /**
   * Cumplimiento desglosado por día de la semana. Responde a la pregunta
   * útil de verdad: ¿qué día se me atraganta este hábito?
   */
  function habitWeekdayRates(habit, todayKey, weekStart) {
    const today = todayKey || U.todayKey();
    const span = U.daysBetween(habit.createdAt, today);
    const tally = {};

    U.weekdayOrder(weekStart).forEach(function (dow) {
      tally[dow] = { dow: dow, name: U.weekdayName(dow), total: 0, done: 0, pct: 0 };
    });

    let key = habit.createdAt;
    for (let i = 0; i <= span && i < MAX_LOOKBACK; i++) {
      const outcome = dayOutcome(habit, key);
      if (outcome !== 'skip') {
        const row = tally[U.fromKey(key).getDay()];
        row.total++;
        if (outcome === 'done') row.done++;
      }
      key = U.addDaysKey(key, 1);
    }

    return U.weekdayOrder(weekStart).map(function (dow) {
      const row = tally[dow];
      row.pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
      return row;
    });
  }

  /**
   * El día más flojo, si hay datos suficientes para que signifique algo.
   * Con dos registros por día la diferencia es ruido, no una tendencia.
   */
  function weakestWeekday(rows) {
    const usable = rows.filter(function (r) { return r.total >= 3; });
    if (usable.length < 2) return null;

    const worst = usable.reduce(function (min, r) { return r.pct < min.pct ? r : min; });
    const best = usable.reduce(function (max, r) { return r.pct > max.pct ? r : max; });

    return best.pct - worst.pct >= 25 ? { worst: worst, best: best } : null;
  }

  /* ── Niveles y rangos ─────────────────────────────────────
     La curva de experiencia vive entera en este bloque. Para cambiarla
     basta con tocar XP_TABLE y XP_STEP: ninguna vista calcula niveles
     por su cuenta, todas piden levelInfo(). ────────────────── */

  /* XP total con la que empieza cada nivel, del 0 al 9. El índice del array
     ES el nivel: se empieza en el 0, no en el 1. */
  const XP_TABLE = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

  /* Del 9 en adelante sigue la misma progresión: subir al nivel n cuesta
     50·(n+1) de XP (100, 150, 200, 250…). La fórmula cerrada 25·n·(n+3)
     reproduce la tabla exactamente, así que la tabla y la continuación
     nunca pueden discrepar en el punto de empalme. */
  const XP_STEP = 50;

  const MAX_LEVEL_SCAN = 9999;   // tope para no iterar sin fin con XP absurda

  /** XP total necesaria para alcanzar ese nivel. Nivel 0 → 0. */
  function xpForLevel(level) {
    const n = Math.floor(level);
    if (n <= 0) return 0;
    if (n < XP_TABLE.length) return XP_TABLE[n];
    return (XP_STEP / 2) * n * (n + 3);
  }

  /** Nivel que corresponde a una XP total acumulada. */
  function levelFromXp(totalXp) {
    const xp = Math.max(0, Math.floor(Number(totalXp) || 0));

    // Inversa de la fórmula, usada solo como punto de partida: el ajuste
    // posterior evita que un redondeo de coma flotante devuelva un nivel
    // que no case con xpForLevel().
    const base = 1.5 * XP_STEP;
    let level = Math.floor((Math.sqrt(base * base + 2 * XP_STEP * xp) - base) / XP_STEP);
    if (!isFinite(level) || level < 0) level = 0;

    let guard = 0;
    while (xpForLevel(level + 1) <= xp && guard++ < MAX_LEVEL_SCAN) level++;
    while (level > 0 && xpForLevel(level) > xp) level--;
    return level;
  }

  /* Rangos por tramos de nivel. Añadir uno nuevo es añadir una fila:
     siempre gana la última cuyo `from` no supera el nivel. El rango
     acompaña al nivel, no lo sustituye. */
  const RANKS = [
    { id: 'novato',      from: 0,  name: 'Novato' },
    { id: 'aprendiz',    from: 10, name: 'Aprendiz' },
    { id: 'combatiente', from: 20, name: 'Combatiente' },
    { id: 'elite',       from: 30, name: 'Élite' },
    { id: 'maestro',     from: 40, name: 'Maestro' },
    { id: 'desconocido', from: 50, name: '???' }
  ];

  function rankForLevel(level) {
    let found = RANKS[0];
    RANKS.forEach(function (r) { if (level >= r.from) found = r; });
    return found;
  }

  /**
   * Todo lo que una vista puede necesitar sobre la progresión, calculado
   * de una vez a partir de la XP total. Nadie más hace estas cuentas.
   */
  function levelInfo(totalXp) {
    const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
    const level = levelFromXp(xp);
    const floor = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const span = next - floor;

    return {
      level: level,
      rank: rankForLevel(level),
      xp: xp,
      points: xp,              // nombre anterior: la cabecera aún lo usa
      floor: floor,            // XP total con la que empezó este nivel
      next: next,              // XP total que abre el siguiente
      into: xp - floor,        // XP conseguida dentro del nivel
      needed: span,            // XP que cuesta el nivel entero
      remaining: next - xp,    // XP que falta para subir
      pct: span ? U.clamp(Math.round(((xp - floor) / span) * 100), 0, 100) : 0
    };
  }

  /* ── XP de los malos hábitos ──────────────────────────────
     No pagan a diario: el día empieza limpio y premiar "que no pase nada"
     cada 24 h no significa gran cosa. Pagan por aguantar, en hitos.
     Se calcula sobre la MEJOR racha histórica, que nunca baja: así lo ya
     cobrado nunca se puede reclamar dos veces ni retirar. ─────────── */
  const AVOID_MILESTONES = [
    { days: 7,   xp: 50,  name: 'Una semana limpio' },
    { days: 30,  xp: 150, name: 'Un mes limpio' },
    { days: 100, xp: 400, name: 'Cien días limpio' }
  ];

  /** XP acumulada que merece una racha limpia de `streak` días. */
  function avoidXpFor(streak) {
    return AVOID_MILESTONES.reduce(function (sum, m) {
      return streak >= m.days ? sum + m.xp : sum;
    }, 0);
  }

  /** El hito que se acaba de alcanzar con esa racha, si es justo hoy. */
  function avoidMilestoneAt(streak) {
    return AVOID_MILESTONES.filter(function (m) { return m.days === streak; })[0] || null;
  }

  /** ¿Este cambio de XP ha supuesto subir de nivel? Regla en un solo sitio. */
  function leveledUp(xpBefore, xpAfter) {
    return levelFromXp(xpAfter) > levelFromXp(xpBefore);
  }

  /* ── Logros ───────────────────────────────────────────────── */

  const ACHIEVEMENTS = [
    { id: 'first_step',   icon: '🌱', name: 'Primer paso',    hint: 'Completa tu primer hábito' },
    { id: 'streak_7',     icon: '🔥', name: 'Una semana',     hint: '7 días seguidos con un hábito' },
    { id: 'streak_30',    icon: '🏔️', name: 'Un mes',         hint: '30 días seguidos con un hábito' },
    { id: 'streak_100',   icon: '💎', name: 'Centenario',     hint: '100 días seguidos con un hábito' },
    { id: 'perfect_day',  icon: '⭐', name: 'Día perfecto',   hint: 'Cumple todos los hábitos de un día' },
    { id: 'perfect_week', icon: '🏆', name: 'Semana perfecta', hint: '7 días perfectos seguidos' },
    { id: 'collector',    icon: '🗂️', name: 'Coleccionista',  hint: 'Crea 10 hábitos' },
    { id: 'points_1000',  icon: '⚡', name: 'Mil de XP',      hint: 'Acumula 1000 de XP' },
    { id: 'historian',    icon: '📝', name: 'Cronista',       hint: 'Escribe 10 notas de día' }
  ];

  const PERFECT_WEEK_MIN_DAYS = 5;

  function totalCompletions() {
    let n = 0;
    S.getHabits(true).forEach(function (h) {
      n += habitTotal(h);
    });
    return n;
  }

  /**
   * Semana perfecta: en los últimos 7 días, todos los que tenían hábitos
   * salieron perfectos. Los días sin hábitos (un domingo con todo de L-V)
   * no cuentan como fallo — no había nada que cumplir. Se exige un mínimo
   * de días con actividad para que el logro signifique algo.
   */
  function hasPerfectWeek(today) {
    const days = U.lastNDays(today, 7).map(dayStats);
    const tracked = days.filter(function (d) { return d.total > 0; });
    return tracked.length >= PERFECT_WEEK_MIN_DAYS &&
           tracked.every(function (d) { return d.perfect; });
  }

  /** Ids de logros que el estado actual ya merece (desbloqueados o no). */
  function earnedAchievements(todayKey) {
    const today = todayKey || U.todayKey();
    const game = S.getGame();
    const earned = [];

    if (totalCompletions() >= 1) earned.push('first_step');

    const best = S.getHabits().reduce(function (max, h) {
      return Math.max(max, bestStreak(h, today));
    }, 0);
    if (best >= 7) earned.push('streak_7');
    if (best >= 30) earned.push('streak_30');
    if (best >= 100) earned.push('streak_100');

    if (dayStats(today).perfect) earned.push('perfect_day');
    if (hasPerfectWeek(today)) earned.push('perfect_week');

    if (game.habitsCreated >= 10) earned.push('collector');
    if (game.points >= 1000) earned.push('points_1000');
    if (Object.keys(S.getState().notes).length >= 10) earned.push('historian');

    return earned;
  }

  function achievementById(id) {
    return ACHIEVEMENTS.filter(function (a) { return a.id === id; })[0] || null;
  }

  return {
    SLOT_LABELS: SLOT_LABELS,
    XP: XP, RANKS: RANKS, XP_TABLE: XP_TABLE,
    POINTS_PER_HABIT: POINTS_PER_HABIT,
    POINTS_PERFECT_DAY: POINTS_PERFECT_DAY,
    ACHIEVEMENTS: ACHIEVEMENTS,

    xpForLevel: xpForLevel, levelFromXp: levelFromXp,
    rankForLevel: rankForLevel, leveledUp: leveledUp,

    AVOID_MILESTONES: AVOID_MILESTONES,
    isAvoid: isAvoid, avoidXpFor: avoidXpFor, avoidMilestoneAt: avoidMilestoneAt,
    doHabitsFor: doHabitsFor, avoidHabitsFor: avoidHabitsFor,

    isActiveOn: isActiveOn, isComplete: isComplete, progressOf: progressOf,
    dayStats: dayStats, heatLevel: heatLevel, habitDayLevel: habitDayLevel,
    currentStreak: currentStreak, bestStreak: bestStreak, topStreak: topStreak,
    weekRate: weekRate, monthRate: monthRate, rateOver: rateOver, levelInfo: levelInfo,
    weekMatrix: weekMatrix,
    exerciseDone: exerciseDone, sessionSummary: sessionSummary, exerciseRecord: exerciseRecord,
    monthSeries: monthSeries, yearSeries: yearSeries, seriesRate: seriesRate,
    habitRate: habitRate, habitTotal: habitTotal,
    habitWeekdayRates: habitWeekdayRates, weakestWeekday: weakestWeekday,
    earnedAchievements: earnedAchievements, achievementById: achievementById
  };
})();
