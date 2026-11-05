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
    // completar un hábito del día: el valor de partida. Desde la 2.7.0 cada
    // hábito puede tener el suyo (XP_TIERS, habitXp()). 20 hasta la 2.5.0.
    habit: 25,
    // `exercise` y `workout` desaparecieron con la sección Ejercicios (2.2.0).
    // La EXP que ya dieron se queda: la XP guarda cuánta llevas, no de dónde.
    // Misiones semanales (2.6.0). Ocupan el sitio del antiguo `goal: 100`
    // ("cumplir un objetivo"), que nunca tuvo acción que lo disparara.
    mission: 50,        // cada misión cumplida
    missionsAll: 50,    // extra por cumplir las tres de la semana
    blankDay: 25,       // lo que resta un día que acaba sin ningún registro

    /* Los bonus ya no son cantidades fijas: son un porcentaje de lo que has
       ganado ese día. Con dos escalones, para que fallar un hábito no tire
       por tierra la jornada entera. */
    perfectDayPct: 0.50,   // 9 de 9  → la mitad de lo ganado
    goodDayPct:    0.25,   // 8 de 9  → un cuarto
    goodDayFrom:   0.80    // a partir de este cumplimiento
  };

  // Nombre anterior: el valor de partida de un hábito.
  const POINTS_PER_HABIT = XP.habit;

  /* Las dificultades que puede tener un hábito (2.7.0). El almacén solo
     acepta estos números; los nombres son para enseñarlos. */
  const XP_TIERS = [
    { xp: 10, name: 'Muy fácil' },
    { xp: 20, name: 'Fácil' },
    { xp: 25, name: 'Normal' },
    { xp: 40, name: 'Difícil' },
    { xp: 50, name: 'Muy difícil' }            // 2.7.1
  ];

  function tierName(xp) {
    const t = XP_TIERS.filter(function (x) { return x.xp === xp; })[0];
    return t ? t.name : xp + ' EXP';
  }

  /**
   * Lo que da un hábito al cumplirlo ESE día. Los cambios de dificultad
   * valen desde el día siguiente a hacerlos, y se guardan con su fecha: así
   * desmarcar un día pasado devuelve justo lo que dio entonces.
   */
  function habitXp(habit, dateKey) {
    let v = XP.habit;
    (habit.xp || []).forEach(function (e) { if (e.from <= dateKey) v = e.xp; });
    return v;
  }

  /** EXP de los hábitos cumplidos un día, sin bonos. */
  function earnedOn(dateKey) {
    return doHabitsFor(dateKey).reduce(function (s, h) {
      return isComplete(h, S.getLog(h.id, dateKey)) ? s + habitXp(h, dateKey) : s;
    }, 0);
  }

  /* Toda la EXP acaba en 0 o en 5. Con 20 por hábito salía sola (20·0,5 =
     10 y 20·0,25 = 5); con 25 ya no (25·0,5 = 12,5), y es este redondeo el
     que la mantiene: el bono de 7 hábitos perfectos es 87,5 → 90. */
  function round5(n) {
    return Math.round(n / 5) * 5;
  }

  /**
   * Bonus del día por cumplimiento. Se calcula sobre el estado completo del
   * día, no sobre la última acción: así app.js puede pedirlo antes y después
   * y pagar solo la diferencia, que es lo que impide duplicar EXP.
   */
  function dayBonus(dateKey) {
    const day = dayStats(dateKey);
    if (!day.total || !day.done) return 0;

    const ratio = day.done / day.total;
    if (ratio < XP.goodDayFrom) return 0;

    // Lo ganado de verdad ese día: cada hábito con su valor.
    return round5(earnedOn(dateKey) * (ratio >= 1 ? XP.perfectDayPct : XP.goodDayPct));
  }

  /**
   * Lo que todavía está en juego hoy: cuántos hábitos faltan y cuánta EXP
   * darían si se cumplieran todos. Es lo que pintan las barras en gris.
   *
   * El bonus no se suma entero: cumplirlos todos deja el día perfecto, así
   * que se calcula el bonus pleno y se resta el que ya esté ganado. Sin esa
   * resta, la previsión prometería EXP que ya tienes.
   */
  function pendingToday(dateKey) {
    const day = dayStats(dateKey);
    const faltan = day.total - day.done;
    if (faltan <= 0) return { habits: 0, xp: 0 };

    const habits = doHabitsFor(dateKey);
    const todo = habits.reduce(function (s, h) { return s + habitXp(h, dateKey); }, 0);
    const bonusPleno = round5(todo * XP.perfectDayPct);

    return {
      habits: faltan,
      xp: todo - earnedOn(dateKey) + (bonusPleno - dayBonus(dateKey))
    };
  }

  /* ── Completado y progreso ────────────────────────────────── */

  /** ¿Este hábito "toca" ese día? */
  function isActiveOn(habit, dateKey) {
    if (habit.createdAt > dateKey) return false;
    // Una pausa se comporta igual que un día que no toca: dayOutcome lo lee
    // como 'skip', así que no cuenta como cumplido ni corta la racha.
    if (S.isPausedOn(habit, dateKey)) return false;
    // Los días de esa semana concreta si tiene plan; si no, los de siempre.
    return S.activeDaysFor(habit, dateKey).indexOf(U.fromKey(dateKey).getDay()) >= 0;
  }

  /** ¿Es un hábito que se quiere dejar? Su lógica va al revés. */
  function isAvoid(habit) {
    return habit.type === 'avoid';
  }

  /**
   * Fallos apuntados en un día. Hay tres formas posibles: `true` (formato
   * de la primera versión), un número, o un objeto de franjas cuando el
   * hábito las tiene — ahí cada franja marcada cuenta como un fallo.
   */
  function failsOf(value) {
    if (value === true) return 1;

    if (value && typeof value === 'object') {
      return Object.keys(value).filter(function (k) { return value[k] === true; }).length;
    }

    const n = Number(value);
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  /**
   * Tope de fallos antes de considerarlo crítico. Con franjas lo marcan
   * ellas: fallar en todas es el peor día posible, y no hay más que fallar.
   */
  function limitOf(habit) {
    if (habit.slots && habit.slots.length) return habit.slots.length;
    const n = Math.floor(Number(habit.limit));
    return isFinite(n) && n > 0 ? n : 2;
  }

  /**
   * ¿Es un hábito a evitar con límite diario de cantidad? ("Redes: no más de
   * 90 min"). Se apunta lo que llevas y solo pasarse es fallar.
   */
  function isCapped(habit) {
    return isAvoid(habit) && !!habit.target;
  }

  /** A partir de qué parte del límite la tarjeta avisa de que te acercas. */
  const CAP_WARN_FROM = 0.75;

  /**
   * Fallos del día, sabiendo de qué hábito es. Con límite de cantidad,
   * pasarse es el único fallo posible: 45 de 90 minutos no son 45 fallos.
   * Todo lo que mire si un hábito a evitar ha fallado pasa por aquí, no por
   * failsOf(), que solo entiende el conteo de fallos.
   */
  function slipsOf(habit, value) {
    if (isCapped(habit)) return (Number(value) || 0) > habit.target.amount ? 1 : 0;
    return failsOf(value);
  }

  /** ¿El valor registrado cumple la meta del hábito? */
  function isComplete(habit, value) {
    // Un mal hábito se cumple por omisión: el día empieza limpio y solo deja
    // de estarlo si se registra una recaída. Por eso se mira ANTES del null:
    // "no hay nada apuntado" es precisamente el caso bueno.
    if (isAvoid(habit)) return !slipsOf(habit, value);

    if (value === null || value === undefined) return false;

    if (habit.type === 'check') return value === true;
    if (habit.type === 'quantity') return Number(value) >= habit.target.amount;

    return habit.slots.every(function (s) { return value[s] === true; });
  }

  /** Progreso 0–1 del hábito ese día (para barras y heatmap parcial). */
  function progressOf(habit, value) {
    // Barra inversa: llena mientras no haya fallos, y se vacía según se
    // acerca al límite. Es la lectura contraria a la de un hábito normal.
    if (isAvoid(habit)) {
      // Con límite, la barra se vacía según te comes el margen del día.
      if (isCapped(habit)) return U.clamp(1 - (Number(value) || 0) / habit.target.amount, 0, 1);
      return U.clamp(1 - failsOf(value) / limitOf(habit), 0, 1);
    }
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
      return slipsOf(h, S.getLog(h.id, dateKey)) > 0;
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

  /**
   * El estado con el que se pinta la tarjeta. Lo decide un solo sitio para
   * que el fondo, el borde y la barra no puedan contradecirse.
   *   positivos → 'done' | 'partial' | 'pending'
   *   a evitar  → 'clean' | 'warn' | 'critical'
   */
  function cardState(habit, dateKey) {
    const value = S.getLog(habit.id, dateKey);

    if (isAvoid(habit)) {
      // Con límite: crítico solo al pasarse, y aviso cuando ya te has comido
      // tres cuartas partes del margen — es cuando todavía se puede parar.
      if (isCapped(habit)) {
        const n = Number(value) || 0;
        if (n > habit.target.amount) return 'critical';
        return n >= habit.target.amount * CAP_WARN_FROM ? 'warn' : 'clean';
      }

      const fails = failsOf(value);
      if (!fails) return 'clean';
      return fails >= limitOf(habit) ? 'critical' : 'warn';
    }

    if (isComplete(habit, value)) return 'done';
    return progressOf(habit, value) > 0 ? 'partial' : 'pending';
  }

  /** Fallos sumados desde el primer día de la semana en curso hasta hoy. */
  function failsThisWeek(habit, todayKey, weekStart) {
    const today = todayKey || U.todayKey();
    const first = U.toKey(U.startOfWeek(U.fromKey(today), weekStart));

    let n = 0;
    daysFromTo(first, today).forEach(function (key) {
      n += slipsOf(habit, S.getLog(habit.id, key));
    });
    return n;
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

  /**
   * La racha viva más larga. Los malos hábitos quedan fuera: tienen su
   * propio bloque de días limpio, y colarlos aquí haría que la ficha
   * "Racha actual" enseñase un número que no viene de nada que hayas hecho.
   */
  function topStreak(todayKey) {
    return S.getHabits().reduce(function (max, h) {
      return isAvoid(h) ? max : Math.max(max, currentStreak(h, todayKey));
    }, 0);
  }

  /* ── Racha de constancia ──────────────────────────────────
     La racha de la app entera, no la de un hábito suelto: días seguidos
     cumpliendo ALGO. El listón es bajo a propósito. Una racha sirve para
     no romper la cadena, y una que exige el día perfecto se rompe la
     primera semana y deja de motivar; una que solo mide que abriste la
     app no mide nada. "Al menos un hábito" es lo que distingue un día en
     el que apareciste de uno en el que no. ───────────────────────────── */

  /**
   * Cuántos hábitos hay que cumplir ese día para sostener la racha. Los
   * modos proporcionales se calculan sobre los que tocaban ese día, que es
   * lo que hace justa la comparación entre un miércoles con nueve y un
   * domingo con tres.
   */
  function streakGoalFor(dateKey, total) {
    const n = total === undefined ? dayStats(dateKey).total : total;
    if (!n) return 0;

    const modo = S.getSettings().streakGoal;
    let meta;

    if (modo === 'half') meta = Math.ceil(n / 2);
    else if (modo === 'quarter') meta = Math.ceil(n / 4);
    else meta = Number(modo) || 2;

    // Nunca puede pedir más de los que hay, ni menos de uno.
    return U.clamp(meta, 1, n);
  }

  /**
   * Qué hace un día con la racha de hábitos:
   *   'done' la alarga · 'miss' la corta · 'skip' ni una cosa ni otra.
   *
   * Son neutros los días salvados con un comodín —existe justo para eso— y
   * aquellos en los que no tocaba ningún hábito, porque romper una racha
   * por un domingo sin nada programado sería castigarte por tu propio
   * calendario. Los hábitos a evitar no cuentan: están cumplidos desde las
   * 00:00 y harían que la racha corriera sola.
   */
  function streakValue(dateKey) {
    if (S.isFrozen(dateKey)) return 'skip';

    const day = dayStats(dateKey);        // dayStats ya deja fuera los de evitar
    if (!day.total) return 'skip';
    return day.done >= streakGoalFor(dateKey, day.total) ? 'done' : 'miss';
  }

  /* ── Racha de actividad ───────────────────────────────────
     Mide presentarse, no rendir. Cuenta cualquier registro del día:
     marcar un hábito, apuntar una cantidad o un fallo, el peso, una
     nota... o el propio motivo de por qué el día fue malo.

     Eso último es lo que la hace valiosa: un día malo, anotado con
     honestidad, mantiene la racha. No premia fingir — premia aparecer y
     contarlo. Y como la de hábitos sigue siendo estricta, las dos juntas
     dicen cosas distintas en vez de repetirse. ───────────────────── */

  function hasAnyRecord(dateKey) {
    if (S.getDayMark(dateKey)) return true;
    if (S.getNote(dateKey)) return true;
    if (S.getWeight(dateKey) !== null) return true;
    if (S.getMood(dateKey) !== null) return true;      // 2.7.4

    return S.getHabits(true).some(function (h) {
      return S.getLog(h.id, dateKey) !== null;
    });
  }

  function activityValue(dateKey) {
    if (hasAnyRecord(dateKey)) return 'done';
    // Mismo perdón que la otra racha: sin nada programado y sin registro,
    // el día no cuenta ni a favor ni en contra.
    return dayStats(dateKey).total ? 'miss' : 'skip';
  }

  /** Primer día con algún hábito ya creado: por debajo no hay nada que mirar. */
  function firstHabitDay() {
    return S.getHabits(true).reduce(function (min, h) {
      return !min || h.createdAt < min ? h.createdAt : min;
    }, null);
  }

  /** Recorre hacia atrás con la regla que se le pase. */
  function streakOf(valueFn, todayKey) {
    const today = todayKey || U.todayKey();
    const desde = firstHabitDay();
    if (!desde) return 0;

    let key = today;
    // El día en curso no corta: hasta medianoche sigues a tiempo.
    if (valueFn(key) === 'miss') key = U.addDaysKey(key, -1);

    let count = 0;
    for (let i = 0; i < MAX_LOOKBACK && key >= desde; i++) {
      const value = valueFn(key);
      if (value === 'miss') break;
      if (value === 'done') count++;
      key = U.addDaysKey(key, -1);
    }
    return count;
  }

  /* ── Peso ─────────────────────────────────────────────────
     El peso de un día suelto baila medio kilo o más por el agua, la sal o
     la hora a la que te peses. Comparar dos pesadas sueltas es comparar
     ruido; lo que dice si de verdad subes o bajas es la media de la
     semana. Por eso los cambios se calculan entre medias, nunca entre
     días aislados. ─────────────────────────────────────────────────── */

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function weightKeys() {
    return Object.keys(S.getWeights()).sort();
  }

  /** Media de lo apuntado en los 7 días que acaban en `dateKey`. */
  function weightAvg7(dateKey) {
    const w = S.getWeights();
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const v = w[U.addDaysKey(dateKey, -i)];
      if (v !== undefined) { sum += v; n++; }
    }
    return n ? round1(sum / n) : null;
  }

  /** El último peso apuntado en ese día o antes. */
  function weightOnOrBefore(dateKey) {
    const keys = weightKeys().filter(function (k) { return k <= dateKey; });
    if (!keys.length) return null;
    const k = keys[keys.length - 1];
    return { date: k, kg: S.getWeights()[k] };
  }

  /**
   * Un punto por día del periodo: el peso de ese día (o null) y la media de
   * la semana que acaba en él. `days` = 0 significa "desde el primer peso".
   */
  function weightSeries(todayKey, days) {
    const today = todayKey || U.todayKey();
    let n = days;

    if (!n) {
      const keys = weightKeys();
      if (!keys.length) return [];
      n = Math.max(2, U.daysBetween(keys[0], today) + 1);
    }

    return U.lastNDays(today, n).map(function (key) {
      return { key: key, kg: S.getWeight(key), avg: weightAvg7(key) };
    });
  }

  /**
   * El resumen que acompaña a la gráfica. Los cambios comparan la media de
   * la última semana con la de hace 7 y 30 días; si en esa semana no hubo
   * ninguna pesada, el cambio no se inventa: vale null.
   */
  function weightSummary(todayKey, days) {
    const today = todayKey || U.todayKey();
    const last = weightOnOrBefore(today);
    if (!last) return null;

    const avg = weightAvg7(last.date);
    const hace7 = weightAvg7(U.addDaysKey(last.date, -7));
    const hace30 = weightAvg7(U.addDaysKey(last.date, -30));

    const enRango = weightSeries(today, days)
      .map(function (p) { return p.kg; })
      .filter(function (kg) { return kg !== null; });

    return {
      last: last,
      avg: avg,
      change7: hace7 === null ? null : round1(avg - hace7),
      change30: hace30 === null ? null : round1(avg - hace30),
      min: enRango.length ? Math.min.apply(null, enRango) : null,
      max: enRango.length ? Math.max.apply(null, enRango) : null,
      entries: weightKeys().length
    };
  }

  /**
   * Peso objetivo y ritmo. El ritmo sale de comparar la media de la última
   * semana con la de hace 4 semanas (o 2, si aún no hay tanto histórico):
   * con medias el agua de un día no cambia la previsión.
   *   status: 'nodata'  sin pesos todavía
   *           'arrived' a ±0,3 kg del objetivo
   *           'norate'  aún no hay histórico para medir el ritmo
   *           'stable'  te mueves menos de 50 g por semana
   *           'toward'  vas hacia el objetivo (con `weeks` y `eta`)
   *           'away'    te alejas de él
   */
  function weightGoal(todayKey) {
    const goal = S.getSettings().weightGoal;
    if (goal === null || goal === undefined) return null;

    const last = weightOnOrBefore(todayKey || U.todayKey());
    if (!last) return { goal: goal, status: 'nodata' };

    const current = weightAvg7(last.date);
    const remaining = round1(goal - current);
    const out = { goal: goal, current: current, remaining: remaining,
                  rate: null, weeks: null, eta: null, status: 'norate' };

    if (Math.abs(remaining) <= 0.3) { out.status = 'arrived'; return out; }

    let span = 28;
    let past = weightAvg7(U.addDaysKey(last.date, -span));
    if (past === null) { span = 14; past = weightAvg7(U.addDaysKey(last.date, -span)); }
    if (past === null) return out;

    const rate = (current - past) / (span / 7);           // kg por semana
    out.rate = Math.round(rate * 100) / 100;

    if (Math.abs(rate) < 0.05) out.status = 'stable';
    else if ((rate < 0) === (remaining < 0)) {
      out.status = 'toward';
      out.weeks = Math.ceil(Math.abs(remaining) / Math.abs(rate));
      // Más de tres años no es una fecha, es un "a este paso, no".
      if (out.weeks <= 156) out.eta = U.addDaysKey(last.date, out.weeks * 7);
    } else out.status = 'away';

    return out;
  }

  /* ── Resumen de la semana ─────────────────────────────────
     Lo que se enseña en Hoy los primeros días de la semana siguiente.
     Solo lee: compara la semana que empieza en `weekKey` (un lunes) con
     la anterior. ──────────────────────────────────────────────────── */

  function weekSummary(weekKey) {
    const days = daysFromTo(weekKey, U.addDaysKey(weekKey, 6));
    const prevDays = days.map(function (k) { return U.addDaysKey(k, -7); });

    const rate = rateOver(days);
    const prev = rateOver(prevDays);
    let perfect = 0;
    let scheduled = 0;
    days.forEach(function (k) {
      const d = dayStats(k);
      if (d.total) scheduled++;
      if (d.perfect) perfect++;
    });

    // El hábito que más se escapó: el de menor cumplimiento entre los que
    // tocaban al menos dos días. Con uno solo, fallarlo no dice nada.
    let weakest = null;
    doHabitsList().forEach(function (h) {
      let tocaba = 0, hecho = 0;
      days.forEach(function (k) {
        const o = dayOutcome(h, k);
        if (o === 'skip') return;
        tocaba++;
        if (o === 'done') hecho++;
      });
      if (tocaba < 2 || hecho === tocaba) return;
      const r = hecho / tocaba;
      if (!weakest || r < weakest.ratio) weakest = { habit: h, done: hecho, total: tocaba, ratio: r };
    });

    // Los de "máximo al día" (Redes): total de la semana contra la anterior.
    const capped = S.getHabits().filter(isCapped).map(function (h) {
      return {
        habit: h,
        sum: habitSumOver(h, days),
        prev: habitSumOver(h, prevDays),
        over: days.filter(function (k) {
          return Number(S.getLog(h.id, k)) > h.target.amount;
        }).length
      };
    }).filter(function (c) { return c.sum || c.prev; });

    const sunday = days[6];
    const wNow = weightAvg7(sunday);
    const wPrev = weightAvg7(U.addDaysKey(sunday, -7));

    return {
      weekKey: weekKey,
      rate: rate,
      prevPct: prev.total ? prev.pct : null,
      perfect: perfect,
      scheduled: scheduled,
      weakest: weakest,
      capped: capped,
      weight: wNow === null ? null : { avg: wNow, change: wPrev === null ? null : round1(wNow - wPrev) }
    };
  }

  /** Hábitos positivos activos: los mismos que cuentan en los porcentajes. */
  function doHabitsList() {
    return S.getHabits().filter(function (h) { return !isAvoid(h); });
  }

  /** Días seguidos cumpliendo el listón de hábitos. */
  function dayStreak(todayKey) {
    return streakOf(streakValue, todayKey);
  }

  /** Días seguidos registrando algo, aunque fuera un mal día. */
  function activityStreak(todayKey) {
    return streakOf(activityValue, todayKey);
  }

  /**
   * La racha está en juego cuando hay algo que perder y hoy todavía no has
   * aportado nada. Es lo que pinta el contador en ámbar.
   */
  function streakAtRisk(todayKey) {
    const today = todayKey || U.todayKey();
    return streakValue(today) === 'miss' && dayStreak(today) >= 3;
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

  /* ── Rejilla semanal ──────────────────────────────────────
     Una fila por hábito y una columna por día, con el estado de
     cada casilla. Sirve de plan (qué toca cuándo) y de marcador
     (qué llevas hecho). ───────────────────────────────────── */

  function cellState(habit, dateKey, today) {
    if (!isActiveOn(habit, dateKey)) return 'off';
    if (isComplete(habit, S.getLog(habit.id, dateKey))) return 'done';
    if (S.isFrozen(dateKey)) return 'frozen';
    if (dateKey > today) return 'future';
    if (dateKey === today) return 'pending';
    // Fallado, pero con motivo apuntado: no es lo mismo que un hueco sin
    // explicación, y la rejilla no debería enseñarlos igual.
    return S.getDayMark(dateKey) ? 'marked' : 'missed';
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
   * Suma de lo registrado en un hábito por cantidad: semana, mes y toda su
   * historia. El valor exacto de cada día ya se guardaba —8 páginas de 10 se
   * apuntan como 8, no se redondean ni se descartan—, pero no había ningún
   * sitio donde verlo acumulado. Esto lo lee, no cambia nada.
   */
  function habitSums(habit, todayKey, weekStart) {
    const today = todayKey || U.todayKey();
    const logs = S.getHabitLogs(habit.id);
    const firstOfWeek = U.toKey(U.startOfWeek(U.fromKey(today), weekStart));
    const firstOfMonth = today.slice(0, 8) + '01';
    // La semana pasada entera, y la semana pasada "hasta el mismo día": un
    // martes, comparar dos días de esta semana con siete de la anterior
    // siempre diría que vas mejor. Lo justo es compararla a estas alturas.
    const firstOfLastWeek = U.addDaysKey(firstOfWeek, -7);
    const sameDayLastWeek = U.addDaysKey(today, -7);
    const cap = isCapped(habit) ? habit.target.amount : null;

    let week = 0, month = 0, total = 0, days = 0, best = 0, bestDay = null;
    let lastWeek = 0, lastWeekSoFar = 0, overMonth = 0;

    Object.keys(logs).forEach(function (key) {
      const n = Number(logs[key]);
      // Los días futuros no se suman aunque alguien los tenga apuntados.
      if (!isFinite(n) || n <= 0 || key > today) return;

      total += n;
      days++;
      if (n > best) { best = n; bestDay = key; }
      if (key >= firstOfMonth) {
        month += n;
        if (cap !== null && n > cap) overMonth++;
      }
      if (key >= firstOfWeek) week += n;
      if (key >= firstOfLastWeek && key < firstOfWeek) {
        lastWeek += n;
        if (key <= sameDayLastWeek) lastWeekSoFar += n;
      }
    });

    return {
      week: week, month: month, total: total,
      days: days, best: best, bestDay: bestDay,
      lastWeek: lastWeek, lastWeekSoFar: lastWeekSoFar,
      // Solo con máximo diario: días de este mes en que te pasaste.
      overMonth: overMonth,
      // Media sobre los días con registro, no sobre los días transcurridos:
      // "he leído 12 páginas los días que leí" dice más que diluirlo en ceros.
      avg: days ? Math.round(total / days) : 0
    };
  }

  /** Suma de un hábito por cantidad en un rango de días concreto. */
  /**
   * Lo acumulado de un hábito a evitar en toda su historia (2.3.2). "Días
   * sin" solo contaba rachas; esto suma lo que se ha ido apuntando:
   *   · con máximo al día (Redes) → la cantidad: minutos, euros…
   *   · por fallos o por franjas  → los fallos, uno por franja marcada.
   * `days` son los días con algo apuntado. Hasta hoy, sin días futuros.
   */
  function avoidTotal(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const logs = S.getHabitLogs(habit.id);
    const capped = isCapped(habit);
    let total = 0, days = 0;

    Object.keys(logs).forEach(function (key) {
      if (key > today) return;
      const n = capped ? Number(logs[key]) : failsOf(logs[key]);
      if (!isFinite(n) || n <= 0) return;
      total += n;
      days++;
    });

    return {
      total: Math.round(total * 10) / 10,
      days: days,
      unit: capped ? habit.target.unit : null
    };
  }

  function habitSumOver(habit, dateKeys) {
    let total = 0;
    dateKeys.forEach(function (key) {
      const n = Number(S.getLog(habit.id, key));
      if (isFinite(n) && n > 0) total += n;
    });
    return total;
  }

  /**
   * Días seguidos apuntando algo, aunque no llegue a la meta. En un hábito
   * como los pasos, la racha normal exige 10.000 y se corta constantemente;
   * esta mide la constancia de registrar, que es otra cosa.
   */
  function logStreak(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const apuntado = function (key) { return Number(S.getLog(habit.id, key)) > 0; };

    // Que hoy aún no esté apuntado no rompe la cuenta: se mira desde ayer.
    let key = apuntado(today) ? today : U.addDaysKey(today, -1);

    let count = 0;
    for (let i = 0; i < MAX_LOOKBACK && key >= habit.createdAt; i++) {
      if (!apuntado(key)) break;
      count++;
      key = U.addDaysKey(key, -1);
    }
    return count;
  }

  /* ── Totales y valores de los hábitos sin cantidad (2.7.2) ─
     Las fichas de "Totales acumulados" y "Valores de los últimos 30 días"
     eran solo de los hábitos por cantidad. Los demás también cuentan algo
     cada día, solo que en otra unidad:
       · check        → 1 si se cumplió (veces);
       · franjas      → cuántas franjas se cumplieron;
       · evitar por fallos (con o sin franjas) → los fallos.
     Aquí se cuenta en esa unidad, con lo que tocaba cada día al lado. ── */

  /**
   * EXP que ha dado un hábito al cumplirlo, con el valor de cada día (2.7.5).
   * Sin bonos de día bueno o perfecto: esos son del día, no del hábito. Los
   * días anteriores a la 2.5.1 pagaron 20 y aquí cuentan a 25, así que en un
   * hábito antiguo la cifra puede pasarse un poco.
   */
  function habitEarnedXp(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const logs = S.getHabitLogs(habit.id);
    return Object.keys(logs).reduce(function (s, k) {
      if (k > today || k < habit.createdAt || !isComplete(habit, logs[k])) return s;
      return s + habitXp(habit, k);
    }, 0);
  }

  /**
   * El próximo hito de un hábito a evitar (2.7.5): el primero que aún no se
   * ha cobrado —se cobran por la mejor racha— y cuántos días de la racha
   * actual faltan para él. null si ya están todos.
   */
  function nextAvoidMilestone(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const mejor = bestStreak(habit, today);
    const m = AVOID_MILESTONES.filter(function (x) { return x.days > mejor; })[0];
    if (!m) return null;
    return { milestone: m, left: Math.max(1, m.days - currentStreak(habit, today)) };
  }

  /** Lo que se apuntó un día, en la unidad del hábito. */
  function unitsOn(habit, key) {
    const v = S.getLog(habit.id, key);
    if (isAvoid(habit)) return failsOf(v);
    if (habit.type === 'schedule') {
      return v && typeof v === 'object'
        ? Object.keys(v).filter(function (k) { return v[k] === true; }).length : 0;
    }
    return v === true ? 1 : 0;
  }

  /** Lo que tocaba ese día: 1 vez, o todas sus franjas. 0 si no tocaba. */
  function plannedOn(habit, key) {
    if (!isActiveOn(habit, key)) return 0;
    return habit.type === 'schedule' ? habit.slots.length : 1;
  }

  /**
   * Totales de un hábito check, de franjas o a evitar por fallos. Cada cifra
   * va con lo que tocaba en el mismo periodo (`…Plan`), salvo en los de
   * evitar, donde lo que tocaba no significa nada.
   */
  function habitCounts(habit, todayKey, weekStart) {
    const today = todayKey || U.todayKey();
    const firstOfWeek = U.toKey(U.startOfWeek(U.fromKey(today), weekStart));
    const firstOfMonth = today.slice(0, 8) + '01';
    const firstOfLastWeek = U.addDaysKey(firstOfWeek, -7);
    const sameDayLastWeek = U.addDaysKey(today, -7);

    let desde = habit.createdAt;
    const limite = U.addDaysKey(today, -MAX_LOOKBACK);
    if (desde < limite) desde = limite;

    const out = {
      week: 0, weekPlan: 0, month: 0, monthPlan: 0, total: 0,
      lastWeek: 0, lastWeekPlan: 0, lastWeekSoFar: 0,
      best: 0, bestDay: null, bestWeek: 0, daysMonth: 0, span: 0
    };
    const porSemana = {};

    for (let k = desde; k <= today; k = U.addDaysKey(k, 1)) {
      const n = unitsOn(habit, k);
      const p = plannedOn(habit, k);
      out.span++;
      out.total += n;
      if (n > out.best) { out.best = n; out.bestDay = k; }

      const wk = U.toKey(U.startOfWeek(U.fromKey(k), weekStart));
      porSemana[wk] = (porSemana[wk] || 0) + n;

      if (k >= firstOfMonth) { out.month += n; out.monthPlan += p; if (n > 0) out.daysMonth++; }
      if (k >= firstOfWeek) { out.week += n; out.weekPlan += p; }
      if (k >= firstOfLastWeek && k < firstOfWeek) {
        out.lastWeek += n;
        out.lastWeekPlan += p;
        if (k <= sameDayLastWeek) out.lastWeekSoFar += n;
      }
    }

    Object.keys(porSemana).forEach(function (wk) {
      if (porSemana[wk] > out.bestWeek) out.bestWeek = porSemana[wk];
    });
    // Media por semana desde que existe: con menos de una semana, la semana.
    out.perWeek = Math.round(out.total / Math.max(1, out.span / 7) * 10) / 10;
    return out;
  }

  /**
   * Lo que pinta la gráfica de 30 días de cualquier hábito:
   *   { series, meta, unit, mode, over(v) }.
   * mode 'goal': la línea de guiones es un suelo (hay que llegar).
   * mode 'cap':  es un techo (pasarla es lo malo).
   * En un check un día vale 0 o 1 y la línea sería un serrucho, así que se
   * pinta cuántas veces se cumplió en los 7 días hasta cada uno, contra los
   * días por semana que tiene.
   */
  function habitChart(habit, todayKey, n) {
    const today = todayKey || U.todayKey();
    const dias = n || 30;

    if (habit.type === 'quantity' || isCapped(habit)) {
      const capped = isCapped(habit);
      return {
        series: habitValueSeries(habit, today, dias),
        meta: habit.target.amount, unit: habit.target.unit,
        mode: capped ? 'cap' : 'goal',
        over: function (v) { return capped ? v > habit.target.amount : v >= habit.target.amount; }
      };
    }

    const punto = function (key, value, hasData) {
      return {
        key: key, label: String(U.fromKey(key).getDate()), full: U.formatShort(U.fromKey(key)),
        value: value, hasData: hasData
      };
    };
    const keys = U.lastNDays(today, dias);

    if (habit.type === 'check') {
      return {
        series: keys.map(function (k) {
          let veces = 0;
          for (let i = 0; i < 7; i++) veces += unitsOn(habit, U.addDaysKey(k, -i));
          return punto(k, veces, k >= habit.createdAt);
        }),
        meta: habit.activeDays.length, unit: 'veces en 7 días', mode: 'goal',
        over: function (v) { return v >= habit.activeDays.length; }
      };
    }

    if (habit.type === 'schedule') {
      return {
        series: keys.map(function (k) {
          const v = unitsOn(habit, k);
          // Un día que no tocaba no es un cero: corta la línea.
          return punto(k, v, k >= habit.createdAt && (plannedOn(habit, k) > 0 || v > 0));
        }),
        meta: habit.slots.length, unit: 'franjas', mode: 'goal',
        over: function (v) { return v >= habit.slots.length; }
      };
    }

    // A evitar por fallos: un día limpio SÍ es un dato (cero fallos).
    const tope = limitOf(habit);
    return {
      series: keys.map(function (k) {
        return punto(k, unitsOn(habit, k), k >= habit.createdAt && !S.isPausedOn(habit, k));
      }),
      meta: tope, unit: 'fallos', mode: 'cap',
      over: function (v) { return v >= tope; }
    };
  }

  /**
   * Este mes contra el anterior A ESTAS ALTURAS (2.7.4): del día 1 a hoy,
   * contra del día 1 al mismo día del mes pasado (o su último día, si era
   * más corto). Comparar 5 días con un mes entero diría siempre que vas peor.
   * En los de evitar, menos es mejor.
   */
  function monthCompare(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const d = U.fromKey(today);
    const dia = d.getDate();
    const largoPrev = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    const iniPrev = U.toKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const finPrev = U.toKey(new Date(d.getFullYear(), d.getMonth() - 1, Math.min(dia, largoPrev)));
    const cantidad = habit.type === 'quantity' || isCapped(habit);

    const valor = function (k) {
      if (k < habit.createdAt) return 0;
      return cantidad ? (Number(S.getLog(habit.id, k)) || 0) : unitsOn(habit, k);
    };
    const suma = function (a, b) {
      return daysFromTo(a, b).reduce(function (s, k) { return s + valor(k); }, 0);
    };

    return {
      cur: Math.round(suma(today.slice(0, 8) + '01', today) * 10) / 10,
      prev: Math.round(suma(iniPrev, finPrev) * 10) / 10,
      hasPrev: habit.createdAt <= finPrev,
      day: dia,
      lessIsBetter: isAvoid(habit),
      unit: cantidad ? habit.target.unit : isAvoid(habit) ? 'fallos'
          : habit.type === 'schedule' ? 'franjas' : 'veces'
    };
  }

  /* ── Ánimo del día (2.7.4) ─────────────────────────────────
     Del 1 al 5. No es un hábito: se cruza con lo cumplido para ver si los
     días buenos de ánimo coinciden con los buenos de hábitos. ────────── */

  const MOODS = [
    { value: 1, icon: '😞', name: 'Muy mal' },
    { value: 2, icon: '🙁', name: 'Mal' },
    { value: 3, icon: '😐', name: 'Normal' },
    { value: 4, icon: '🙂', name: 'Bien' },
    { value: 5, icon: '😄', name: 'Muy bien' }
  ];

  function moodById(v) {
    return MOODS.filter(function (m) { return m.value === v; })[0] || null;
  }

  /** Media del ánimo en unos días, o null si no se apuntó en ninguno. */
  function moodAvg(dateKeys) {
    const vals = dateKeys.map(S.getMood).filter(function (v) { return v !== null; });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10;
  }

  /**
   * El ánimo de los últimos `n` días cruzado con el cumplimiento:
   *   · por cada ánimo, cuántos días y qué % de hábitos cumpliste de media;
   *   · el ánimo medio de los días buenos (80% o más) y de los demás.
   * Solo cuentan los días con ánimo apuntado y algún hábito que tocara.
   */
  function moodSummary(todayKey, n) {
    const today = todayKey || U.todayKey();
    const rows = MOODS.map(function (m) { return { mood: m, days: 0, sumPct: 0, pct: null }; });
    let total = 0, suma = 0;
    const alto = { days: 0, sum: 0 }, bajo = { days: 0, sum: 0 };

    U.lastNDays(today, n || 90).forEach(function (k) {
      const v = S.getMood(k);
      if (v === null) return;
      total++;
      suma += v;
      const day = dayStats(k);
      if (!day.total) return;
      const pct = day.done / day.total * 100;
      const row = rows[v - 1];
      row.days++;
      row.sumPct += pct;
      const grupo = pct >= XP.goodDayFrom * 100 ? alto : bajo;
      grupo.days++;
      grupo.sum += v;
    });

    rows.forEach(function (r) { if (r.days) r.pct = Math.round(r.sumPct / r.days); });
    const media = function (g) { return g.days ? Math.round(g.sum / g.days * 10) / 10 : null; };
    return {
      days: total,
      avg: total ? Math.round(suma / total * 10) / 10 : null,
      rows: rows,
      good: { days: alto.days, avg: media(alto) },
      rest: { days: bajo.days, avg: media(bajo) }
    };
  }

  /** Valores diarios de los últimos `n` días, para la gráfica de la ficha. */
  function habitValueSeries(habit, todayKey, n) {
    const today = todayKey || U.todayKey();

    return U.lastNDays(today, n).map(function (key) {
      const value = Number(S.getLog(habit.id, key)) || 0;
      return {
        key: key,
        label: String(U.fromKey(key).getDate()),
        full: U.formatShort(U.fromKey(key)),
        value: value,
        // Un día sin apuntar no es un día de cero: corta la línea en vez de
        // dibujar un valle que nunca ocurrió. Un 0 no llega a guardarse.
        hasData: value > 0
      };
    });
  }

  /* ── Niveles y rangos ─────────────────────────────────────
     La curva de experiencia vive entera en este bloque. Para cambiarla
     basta con tocar XP_TABLE y XP_STEP: ninguna vista calcula niveles
     por su cuenta, todas piden levelInfo(). ────────────────── */

  /* XP total con la que empieza cada nivel, del 0 al 9. El índice del array
     ES el nivel: se empieza en el 0, no en el 1. */
  const XP_TABLE = [0, 50, 125, 225, 350, 500, 675, 875, 1100, 1350];

  /* Del 9 en adelante sigue la misma progresión: subir al nivel n cuesta
     25·(n+1) de XP (50, 75, 100, 125…). La fórmula cerrada 12,5·n·(n+3)
     reproduce la tabla exactamente, así que la tabla y la continuación
     nunca pueden discrepar en el punto de empalme. n·(n+3) siempre es par,
     así que el resultado sigue siendo un múltiplo de 25.
     Hasta la 2.4.x el paso era 50: cada nivel costaba el doble y, con 6-7
     hábitos al día, el rango X quedaba a casi cuatro años. */
  const XP_STEP = 25;

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
  /* Once tramos de diez niveles cada uno. La escala sigue saliendo del
     nivel, que sale de la EXP: no hay una segunda contabilidad. */
  const RANKS = [
    { id: 'e',        from: 0,   letter: 'E',    name: 'Novato' },
    { id: 'd',        from: 10,  letter: 'D',    name: 'Aprendiz' },
    { id: 'c',        from: 20,  letter: 'C',    name: 'Combatiente' },
    { id: 'b',        from: 30,  letter: 'B',    name: 'Élite' },
    { id: 'a',        from: 40,  letter: 'A',    name: 'Maestro' },
    { id: 's',        from: 50,  letter: 'S',    name: 'Soberano' },
    { id: 'ss',       from: 60,  letter: 'SS',   name: 'Monarca' },
    { id: 'ss-plus',  from: 70,  letter: 'SS+',  name: 'Monarca supremo' },
    { id: 'sss',      from: 80,  letter: 'SSS',  name: 'Leyenda' },
    { id: 'sss-plus', from: 90,  letter: 'SSS+', name: 'Leyenda eterna' },
    { id: 'x',        from: 100, letter: 'X',    name: 'Fuera de escala' }
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
    // 50 / 150 / 400 hasta la 2.6.x. Al cambiar la tabla, app.js reajusta
    // una vez lo ya cobrado (S.rebaseAvoidXp) sin quitar EXP a nadie.
    { days: 7,   xp: 50,  name: 'Una semana limpio' },
    { days: 30,  xp: 100, name: 'Un mes limpio' },
    { days: 100, xp: 200, name: 'Cien días limpio' }
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

  /* ── Atributos del personaje ──────────────────────────────
     No son datos nuevos: cada atributo es una métrica que la app ya
     calculaba, presentada como estadística de RPG. Debajo de cada barra
     se enseña de dónde sale, para que ningún número parezca inventado.
     ──────────────────────────────────────────────────────── */

  /* Hasta la 2.3.x un atributo era solo el cumplimiento a 30 días, y con un
     hábito recién creado dos entrenos de dos ya daban 100. Desde la 2.4.0
     es constancia × experiencia:
       · constancia — el cumplimiento a 30 días de siempre: baja si lo dejas;
       · experiencia — cuánto historial lo respalda: llega al máximo tras
         ATTR_WEEKS semanas cumpliendo, contadas con los días que toca cada
         hábito (3 a la semana → 36 veces; diario → 84). En los de evitar
         cuentan los días limpios.
     Así sube poco a poco, como el nivel, y no se queda inflado si paras. */
  const ATTR_WEEKS = 12;

  /** Constancia, experiencia y valor del atributo para un solo hábito. */
  function habitAttr(habit, todayKey) {
    const r = habitRate(habit, todayKey, 30);
    const goal = ATTR_WEEKS * habit.activeDays.length;
    const exp = Math.min(goal, habitTotal(habit));
    const constancia = r.total ? r.pct : 0;
    return {
      counted: r.total > 0,
      constancia: constancia,
      exp: exp,
      goal: goal,
      value: Math.round(constancia * exp / goal)
    };
  }

  /** Media de los hábitos de una categoría. */
  function categoryScore(categoryId, todayKey) {
    const habits = S.getHabits().filter(function (h) { return h.category === categoryId; });
    if (!habits.length) return { value: 0, detail: 'Sin hábitos en esta rama' };

    const vivos = habits.map(function (h) { return habitAttr(h, todayKey); })
                        .filter(function (a) { return a.counted; });
    if (!vivos.length) return { value: 0, detail: 'Todavía sin días que contar' };

    function media(fn) {
      return Math.round(vivos.reduce(function (s, a) { return s + fn(a); }, 0) / vivos.length);
    }

    return {
      value: media(function (a) { return a.value; }),
      detail: habits.length + (habits.length === 1 ? ' hábito' : ' hábitos') +
              ' · Constancia ' + media(function (a) { return a.constancia; }) + '%' +
              ' · Experiencia ' + media(function (a) { return a.exp / a.goal * 100; }) + '%'
    };
  }

  /**
   * El hábito de entreno. Hasta la 2.2.0 contaba entrenos cerrados en la
   * sección Ejercicios; ahora el entreno se apunta en otra app y aquí solo
   * queda el hábito, que respeta su plan semanal.
   */
  function trainingScore(todayKey) {
    const habit = S.getTrainingHabit();
    if (!habit) return { value: 0, detail: 'Sin hábito de entreno' };

    const a = habitAttr(habit, todayKey);
    return {
      value: a.value,
      detail: habit.name + ' · Constancia ' + a.constancia + '%' +
              ' · Experiencia ' + a.exp + ' de ' + a.goal
    };
  }

  /**
   * Los cinco atributos. Códigos de RPG, datos reales: si una rama no
   * tiene hábitos, su atributo vale 0 y lo dice — no se rellena a ojo.
   */
  /* De dónde sale cada atributo. Fuerza es el hábito de entreno; los demás,
     la media de una categoría. Lo leen attributes() y, desde la 2.7.3, la
     ficha de cada hábito (habitAttributes), así que no pueden discrepar. */
  const ATTRS = [
    { code: 'STR', name: 'Fuerza',        training: true },
    { code: 'VIT', name: 'Vitalidad',     category: 'fisico' },
    { code: 'AGI', name: 'Agilidad',      category: 'evitar' },
    { code: 'INT', name: 'Inteligencia',  category: 'aprendizaje' },
    { code: 'SEN', name: 'Concentración', category: 'mental' }
  ];

  function attributes(todayKey) {
    const today = todayKey || U.todayKey();
    return ATTRS.map(function (a) {
      const r = a.training ? trainingScore(today) : categoryScore(a.category, today);
      return { code: a.code, name: a.name, value: r.value, detail: r.detail };
    });
  }

  /**
   * A qué atributos suma un hábito y cuánto (2.7.3). Puede ser a dos: el de
   * entreno suele ser también de Salud, así que da Fuerza y Vitalidad.
   * `own` es lo que vale el propio hábito (constancia × experiencia) y
   * `value` el atributo entero; `peers` cuántos hábitos hacen la media.
   * Un hábito archivado no suma: los atributos solo miran los activos.
   */
  function habitAttributes(habit, todayKey) {
    const today = todayKey || U.todayKey();
    const todos = attributes(today);
    const propio = habitAttr(habit, today);
    const entreno = S.getTrainingHabit();

    return ATTRS.map(function (a, i) {
      const suma = a.training ? !!entreno && entreno.id === habit.id : habit.category === a.category;
      if (!suma) return null;
      const peers = a.training ? 1 : S.getHabits().filter(function (h) { return h.category === a.category; }).length;
      return {
        code: a.code, name: a.name, training: !!a.training,
        value: todos[i].value, own: propio.value,
        constancia: propio.constancia, exp: propio.exp, goal: propio.goal,
        counted: propio.counted, peers: peers
      };
    }).filter(Boolean);
  }

  /* ── Misiones semanales (2.6.0) ───────────────────────────
     Hasta tres por semana, elegidas al planificar. Cada una paga
     XP.mission y las tres juntas XP.missionsAll más. Como todo lo demás,
     el estado se calcula a partir de los registros —no se guarda "cumplida"—
     y app.js paga la diferencia con lo ya cobrado.

     Dos familias:
       · "hacer" (cumplir un hábito N veces, N días perfectos): se cumplen
         en cuanto se llega, y se pierden si al acabar la semana no;
       · "no hacer" (semana limpia, media de un límite, registrar todos los
         días): fallan en cuanto ya no hay vuelta atrás, y solo se dan por
         cumplidas cuando la semana termina. ──────────────────────────── */

  const MISSIONS_MAX = 3;

  /** Los días que cuenta una misión: desde que se aceptó hasta el domingo. */
  function missionDays(m, weekKey) {
    return daysFromTo(m.from, U.addDaysKey(weekKey, 6));
  }

  /**
   * Cómo va una misión: { current, goal, pct, status, text }.
   * status: 'active' (en juego), 'done' o 'failed'.
   */
  function missionProgress(m, weekKey, todayKey) {
    const today = todayKey || U.todayKey();
    const days = missionDays(m, weekKey);
    const vistos = days.filter(function (k) { return k <= today; });
    const cerrada = today > days[days.length - 1];
    const habit = m.habitId ? S.getHabit(m.habitId) : null;
    const out = { current: 0, goal: m.target, pct: 0, status: 'active', text: '' };

    if (m.habitId && !habit) { out.status = 'failed'; out.text = 'Hábito borrado'; return out; }

    function sumLogs(fn) {
      return vistos.reduce(function (s, k) { return s + fn(S.getLog(habit.id, k)); }, 0);
    }

    if (m.type === 'habit_count' || m.type === 'perfect_days') {
      out.current = vistos.filter(function (k) {
        return m.type === 'habit_count'
          ? isComplete(habit, S.getLog(habit.id, k))
          : dayStats(k).perfect;
      }).length;
      out.status = out.current >= out.goal ? 'done' : cerrada ? 'failed' : 'active';
      out.pct = Math.min(100, Math.round(out.current / out.goal * 100));
      out.text = Math.min(out.current, out.goal) + ' / ' + out.goal;
    } else if (m.type === 'avoid_clean') {
      out.current = sumLogs(failsOf);
      out.status = out.current > out.goal ? 'failed' : cerrada ? 'done' : 'active';
      // La barra avanza con los días aguantados, no con los fallos.
      out.pct = out.status === 'active' ? Math.round(vistos.length / days.length * 100) : 100;
      out.text = out.current + (out.current === 1 ? ' fallo' : ' fallos') +
                 (out.goal ? ' · máx. ' + out.goal : '');
    } else if (m.type === 'cap_avg') {
      const sum = sumLogs(function (v) { return Number(v) || 0; });
      // Se mide sobre la semana entera: pasarse del total ya no tiene arreglo.
      out.current = vistos.length ? Math.round(sum / vistos.length * 10) / 10 : 0;
      out.status = sum > out.goal * days.length ? 'failed' : cerrada ? 'done' : 'active';
      out.pct = Math.min(100, Math.round(sum / (out.goal * days.length) * 100));
      out.text = 'media ' + out.current + ' / ' + out.goal + ' ' + habit.target.unit;
    } else if (m.type === 'log_all') {
      out.goal = days.length;
      out.current = vistos.filter(function (k) { return activityValue(k) !== 'miss'; }).length;
      // Hoy todavía no cuenta en contra: hasta medianoche hay tiempo.
      const hueco = vistos.some(function (k) { return k < today && activityValue(k) === 'miss'; });
      out.status = hueco ? 'failed' : out.current === out.goal ? 'done' : 'active';
      out.pct = Math.round(out.current / out.goal * 100);
      out.text = out.current + ' / ' + out.goal + ' días';
    }
    return out;
  }

  /** EXP que merecen ahora las misiones de una semana. */
  function missionXp(weekKey, todayKey) {
    const list = S.getMissions(weekKey);
    const done = list.filter(function (m) {
      return missionProgress(m, weekKey, todayKey).status === 'done';
    }).length;
    const all = list.length === MISSIONS_MAX && done === MISSIONS_MAX;
    return { done: done, total: list.length, all: all,
             xp: done * XP.mission + (all ? XP.missionsAll : 0) };
  }

  /** Cómo se lee una misión. */
  function missionLabel(m) {
    const h = m.habitId ? S.getHabit(m.habitId) : null;
    const quien = h ? h.icon + ' ' + h.name : '';
    switch (m.type) {
      case 'habit_count':  return quien + ': ' + m.target + (m.target === 1 ? ' vez' : ' veces');
      case 'avoid_clean':  return quien + (m.target ? ': como mucho ' + m.target +
                                  (m.target === 1 ? ' fallo' : ' fallos') : ': semana limpia');
      case 'cap_avg':      return quien + ': media por debajo de ' + m.target + ' ' + (h ? h.target.unit : '');
      case 'perfect_days': return '⭐ ' + m.target + (m.target === 1 ? ' día perfecto' : ' días perfectos');
      case 'log_all':      return '✎ Registrar todos los días';
    }
    return '';
  }

  /**
   * Lo que se puede elegir como misión, sacado de tus hábitos activos.
   * `unit` es lo que se escribe junto al número; null si no lleva número.
   */
  function missionOptions() {
    const out = [];
    doHabitsList().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); })
      .forEach(function (h) {
        out.push({ type: 'habit_count', habitId: h.id, label: h.icon + ' ' + h.name + ' · cumplir', unit: 'veces' });
      });
    S.getHabits().filter(isAvoid).forEach(function (h) {
      out.push(h.target
        ? { type: 'cap_avg', habitId: h.id, label: h.icon + ' ' + h.name + ' · media máxima', unit: h.target.unit + ' de media' }
        : { type: 'avoid_clean', habitId: h.id, label: h.icon + ' ' + h.name + ' · semana limpia', unit: 'fallos máx.' });
    });
    out.push({ type: 'perfect_days', habitId: null, label: '⭐ Días perfectos', unit: 'días' });
    out.push({ type: 'log_all', habitId: null, label: '✎ Registrar todos los días', unit: null });
    return out;
  }

  /** Días que contaría una misión aceptada hoy para esa semana. */
  function missionSpan(weekKey, todayKey) {
    const today = todayKey || U.todayKey();
    return daysFromTo(today > weekKey ? today : weekKey, U.addDaysKey(weekKey, 6));
  }

  /** El número que se propone al elegir un tipo de misión. */
  function missionDefault(type, habitId, weekKey, todayKey) {
    const days = missionSpan(weekKey, todayKey);
    const h = habitId ? S.getHabit(habitId) : null;
    if (type === 'habit_count') {
      return Math.max(1, days.filter(function (k) { return isActiveOn(h, k); }).length);
    }
    if (type === 'cap_avg') return h.target.amount;
    if (type === 'perfect_days') return Math.min(4, days.length);
    return 0;
  }

  /** El tope razonable del número: no se puede cumplir algo 6 veces en 4 días. */
  function missionMax(type, weekKey, todayKey) {
    if (type === 'habit_count' || type === 'perfect_days') return missionSpan(weekKey, todayKey).length;
    if (type === 'avoid_clean') return 20;
    return 100000;
  }

  /**
   * Tres misiones propuestas a partir de la semana anterior: el hábito que
   * más se escapó, el hábito a evitar que peor fue y un día perfecto más que
   * entonces. Con los de evitar ocultos, no se proponen.
   */
  function suggestMissions(weekKey, todayKey, sinEvitar) {
    const prev = weekSummary(U.addDaysKey(weekKey, -7));
    const prevDays = daysFromTo(prev.weekKey, U.addDaysKey(prev.weekKey, 6));
    const out = [];

    let h1 = prev.weakest ? prev.weakest.habit : S.getTrainingHabit();
    if (!h1 || isAvoid(h1) || h1.archived) h1 = doHabitsList()[0];
    if (h1) out.push({ type: 'habit_count', habitId: h1.id });

    if (!sinEvitar) {
      let peor = null;
      let peso = -1;
      S.getHabits().filter(isAvoid).forEach(function (h) {
        // Fallos de la semana, o en los de límite cuánto se comió del máximo.
        const p = prevDays.reduce(function (s, k) {
          const v = S.getLog(h.id, k);
          return s + (h.target ? (Number(v) || 0) / h.target.amount : failsOf(v));
        }, 0);
        if (p > peso) { peso = p; peor = h; }
      });
      if (peor) out.push({ type: peor.target ? 'cap_avg' : 'avoid_clean', habitId: peor.id });
    }

    const quedan = missionSpan(weekKey, todayKey).length;
    if (prev.perfect >= quedan || out.length < 2) out.push({ type: 'log_all', habitId: null });
    if (out.length < MISSIONS_MAX) {
      out.push({ type: 'perfect_days', habitId: null, target: Math.min(quedan, Math.max(1, prev.perfect + 1)) });
    }

    return out.slice(0, MISSIONS_MAX).map(function (m) {
      if (m.target === undefined) m.target = missionDefault(m.type, m.habitId, weekKey, todayKey);
      return m;
    });
  }

  /* ── Previsión hasta el rango más alto (2.7.0) ────────────
     Dos ritmos, porque responden a preguntas distintas:
       · ideal — si cumples todos tus hábitos, con lo que dará cada uno a
         partir de mañana y su bono de día perfecto. Es lo que mueves al
         cambiar dificultades;
       · real — lo que has ganado de verdad en los últimos 30 días: hábitos,
         bonos y misiones, menos los días en blanco. Los hitos de evitar no
         entran: son de una vez y no dicen nada del ritmo.
     La meta es fija: el nivel en que empieza el rango más alto. ──────── */

  const FORECAST_LEVEL = 100;

  function idealDailyXp(todayKey) {
    const manana = U.addDaysKey(todayKey, 1);
    const habits = doHabitsList();
    let total = 0;
    for (let dow = 0; dow < 7; dow++) {
      const suma = habits.reduce(function (s, h) {
        return h.activeDays.indexOf(dow) >= 0 ? s + habitXp(h, manana) : s;
      }, 0);
      total += suma + round5(suma * XP.perfectDayPct);
    }
    return total / 7;
  }

  /** Ritmo real: { rate, days }, o null con menos de una semana de historia. */
  function realDailyXp(todayKey) {
    const primero = firstHabitDay();
    if (!primero) return null;
    const fin = U.addDaysKey(todayKey, -1);                // hoy aún no ha terminado
    let ini = U.addDaysKey(todayKey, -30);
    if (primero > ini) ini = primero;
    if (ini > fin) return null;

    const days = daysFromTo(ini, fin);
    if (days.length < 7) return null;

    const multas = S.getPenalties();
    let xp = 0;
    days.forEach(function (k) {
      xp += earnedOn(k) + dayBonus(k) - (multas[k] || 0);
    });
    // Lo cobrado por misiones, repartido entre los días de su semana que
    // caen dentro de la ventana.
    S.getMissionWeeks().forEach(function (wk) {
      const pagado = S.getMissionPaid(wk);
      if (!pagado) return;
      const dentro = daysFromTo(wk, U.addDaysKey(wk, 6)).filter(function (k) {
        return k >= ini && k <= fin;
      }).length;
      xp += pagado * dentro / 7;
    });
    return { rate: xp / days.length, days: days.length };
  }

  function forecastMax(todayKey, points) {
    const today = todayKey || U.todayKey();
    const meta = xpForLevel(FORECAST_LEVEL);
    const falta = Math.max(0, meta - (Number(points) || 0));

    function eta(rate) {
      if (!(rate > 0)) return null;
      const dias = Math.ceil(falta / rate);
      return { rate: Math.round(rate), days: dias, date: U.addDaysKey(today, dias) };
    }

    const real = realDailyXp(today);
    return {
      level: FORECAST_LEVEL,
      rank: rankForLevel(FORECAST_LEVEL),
      target: meta,
      remaining: falta,
      reached: falta === 0,
      ideal: eta(idealDailyXp(today)),
      real: real ? eta(real.rate) : null,
      realDays: real ? real.days : 0
    };
  }

  /* ── Días en blanco (2.6.0) ───────────────────────────────
     Un día que tocaba algo y acabó sin ningún registro: ni hábitos, ni
     nota, ni peso, ni marca de día. Es la misma regla que corta la racha
     de registro, así que un comodín, una pausa o una ausencia lo salvan. */
  function isBlankDay(dateKey) {
    return activityValue(dateKey) === 'miss';
  }

  /* ── Logros ───────────────────────────────────────────────── */

  /* Los `id` son los que están guardados en el almacén: no se tocan nunca.
     Lo que cambia es el nombre con el que se enseñan, y `hint` sigue
     diciendo la condición real para que ninguno resulte un jeroglífico. */
  const ACHIEVEMENTS = [
    { id: 'first_step',   icon: '🌱', name: 'Primer despertar', hint: 'Completa tu primer hábito' },
    { id: 'quests_100',   icon: '⚔️', name: 'Cien misiones',    hint: 'Completa 100 hábitos' },
    { id: 'quests_1000',  icon: '🏹', name: 'Mil misiones',     hint: 'Completa 1000 hábitos' },
    { id: 'streak_7',     icon: '⛓️', name: 'Racha de 7 días',  hint: '7 días seguidos con un hábito' },
    { id: 'streak_30',    icon: '🏔️', name: 'Racha de 30 días', hint: '30 días seguidos con un hábito' },
    { id: 'streak_100',   icon: '💎', name: 'Centurión',        hint: '100 días seguidos con un hábito' },
    { id: 'perfect_day',  icon: '⭐', name: 'Día impecable',    hint: 'Cumple todos los hábitos de un día' },
    { id: 'perfect_week', icon: '🏆', name: 'Semana impecable', hint: '7 días perfectos seguidos' },
    { id: 'rank_d',       icon: '🔰', name: 'Primer ascenso',   hint: 'Alcanza el rango D' },
    { id: 'rank_s',       icon: '👑', name: 'Soberano',         hint: 'Alcanza el rango S' },
    { id: 'rank_x',       icon: '🌌', name: 'Fuera de escala',  hint: 'Alcanza el rango X' },
    { id: 'collector',    icon: '🗂️', name: 'Archimaestro',     hint: 'Crea 10 hábitos' },
    { id: 'points_1000',  icon: '⚡', name: 'Diez mil de EXP',  hint: 'Acumula 10 000 de EXP' },
    { id: 'historian',    icon: '📝', name: 'Cronista',         hint: 'Escribe 10 notas de día' },
    // Premia aparecer, no rendir: es el único que se gana en los días malos.
    { id: 'present_90',   icon: '🧭', name: 'Sin faltar un día', hint: '90 días seguidos registrando algo' }
  ];

  /** Nivel en el que empieza un rango. Los logros de rango lo leen de aquí
      para que mover un tramo en RANKS no deje el logro descolgado. */
  function rankFloor(id) {
    const rank = RANKS.filter(function (r) { return r.id === id; })[0];
    return rank ? rank.from : Infinity;
  }

  const PERFECT_WEEK_MIN_DAYS = 5;

  /**
   * Misiones cumplidas: veces que se ha completado un hábito. Los de evitar
   * quedan fuera — sus "días limpios" son cada día que pasa sin hacer nada,
   * y contarlos ahogaría el número real de cosas hechas.
   */
  function totalCompletions() {
    let n = 0;
    S.getHabits(true).forEach(function (h) {
      if (!isAvoid(h)) n += habitTotal(h);
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

    // Misiones: veces que se ha completado un hábito.
    const quests = totalCompletions();
    if (quests >= 1) earned.push('first_step');
    if (quests >= 100) earned.push('quests_100');
    if (quests >= 1000) earned.push('quests_1000');

    /* Un solo criterio para las rachas: las de los hábitos a evitar quedan
       fuera, igual que ya lo estaban en la ficha "Racha actual" y en el
       récord general. No se quedan sin premio — cobran sus propios hitos
       de EXP a los 7, 30 y 100 días sin caer. */
    const best = S.getHabits().reduce(function (max, h) {
      return isAvoid(h) ? max : Math.max(max, bestStreak(h, today));
    }, 0);
    if (best >= 7) earned.push('streak_7');
    if (best >= 30) earned.push('streak_30');
    if (best >= 100) earned.push('streak_100');

    if (dayStats(today).perfect) earned.push('perfect_day');
    if (hasPerfectWeek(today)) earned.push('perfect_week');

    const level = levelFromXp(game.points);
    if (level >= rankFloor('d')) earned.push('rank_d');
    if (level >= rankFloor('s')) earned.push('rank_s');
    if (level >= rankFloor('x')) earned.push('rank_x');

    if (activityStreak(today) >= 90) earned.push('present_90');

    if (game.habitsCreated >= 10) earned.push('collector');
    // Sube a 10 000 con la EXP nueva: 1000 se alcanzaba en cuatro días.
    // El `id` no cambia, así que a quien ya lo tuviera no se le retira.
    if (game.points >= 10000) earned.push('points_1000');
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
    dayBonus: dayBonus,
    ACHIEVEMENTS: ACHIEVEMENTS,

    xpForLevel: xpForLevel, levelFromXp: levelFromXp,
    rankForLevel: rankForLevel, leveledUp: leveledUp,
    attributes: attributes, totalCompletions: totalCompletions,
    MISSIONS_MAX: MISSIONS_MAX, missionProgress: missionProgress, missionXp: missionXp,
    missionLabel: missionLabel, missionOptions: missionOptions, missionDefault: missionDefault,
    missionMax: missionMax, missionSpan: missionSpan, suggestMissions: suggestMissions,
    isBlankDay: isBlankDay,
    XP_TIERS: XP_TIERS, tierName: tierName, habitXp: habitXp,
    habitCounts: habitCounts, habitChart: habitChart, habitAttributes: habitAttributes,
    monthCompare: monthCompare, MOODS: MOODS, moodById: moodById, moodAvg: moodAvg,
    habitEarnedXp: habitEarnedXp, nextAvoidMilestone: nextAvoidMilestone,
    moodSummary: moodSummary,
    forecastMax: forecastMax, idealDailyXp: idealDailyXp,

    AVOID_MILESTONES: AVOID_MILESTONES,
    isAvoid: isAvoid, failsOf: failsOf, limitOf: limitOf,
    isCapped: isCapped, slipsOf: slipsOf,
    weightSeries: weightSeries, weightSummary: weightSummary,
    weightAvg7: weightAvg7, weightOnOrBefore: weightOnOrBefore, weightGoal: weightGoal,
    weekSummary: weekSummary,
    cardState: cardState, failsThisWeek: failsThisWeek,
    avoidXpFor: avoidXpFor, avoidMilestoneAt: avoidMilestoneAt,
    doHabitsFor: doHabitsFor, avoidHabitsFor: avoidHabitsFor,

    isActiveOn: isActiveOn, isComplete: isComplete, progressOf: progressOf,
    dayOutcome: dayOutcome,
    dayStats: dayStats, pendingToday: pendingToday,
    heatLevel: heatLevel, habitDayLevel: habitDayLevel,
    currentStreak: currentStreak, bestStreak: bestStreak, topStreak: topStreak,
    dayStreak: dayStreak, streakAtRisk: streakAtRisk,
    activityStreak: activityStreak, streakGoalFor: streakGoalFor,
    weekRate: weekRate, monthRate: monthRate, rateOver: rateOver, levelInfo: levelInfo,
    weekMatrix: weekMatrix,
    monthSeries: monthSeries, yearSeries: yearSeries, seriesRate: seriesRate,
    habitRate: habitRate, habitTotal: habitTotal, habitSums: habitSums,
    habitSumOver: habitSumOver, avoidTotal: avoidTotal, logStreak: logStreak, habitValueSeries: habitValueSeries,
    earnedAchievements: earnedAchievements, achievementById: achievementById
  };
})();
