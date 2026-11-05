/* ============================================================
   app.js — Arranque y orquestación: conecta los eventos del
   usuario con el store, reparte puntos, programa recordatorios
   y exporta datos. Es el único módulo que conoce a los demás.
   ============================================================ */
(function () {
  'use strict';

  const U = HT.utils;
  const S = HT.store;
  const St = HT.stats;
  const UI = HT.ui;

  let today = U.todayKey();
  let currentDate = today;                       // el día que se está viendo
  let viewPeriod = U.startOfMonth(new Date());   // mes o año del calendario
  let calScale = 'month';
  let weekAnchor = today;                        // cualquier día de la semana mostrada
  let habitId = null;                            // hábito abierto en la ficha
  let habitMonth = U.startOfMonth(new Date());
  let noteQuery = '';                            // filtro del buscador de Notas
  let noteEditing = null;                        // nota antigua abierta para editar
  let weightRange = 30;                          // días de la gráfica de peso (0 = todo)

  /* ── Repintado coalescido ─────────────────────────────────
     Un solo clic puede disparar varios eventos del store
     (log + puntos + logro). Se acumulan y se pinta una vez por
     frame, y solo la parte afectada. ───────────────────────── */

  const dirty = {
    all: false, header: false, progress: false, week: false,
    extras: false, habit: false, notes: false, cards: {},
    economy: false     // misiones y días en blanco por recalcular
  };
  let frame = null;

  function scheduleFlush() {
    if (frame !== null) return;
    frame = requestAnimationFrame(flush);
  }

  function flush() {
    frame = null;

    // Antes de pintar: cobrar o devolver puede cambiar la EXP, y así la
    // cabecera sale ya con la cifra buena.
    if (dirty.economy) {
      dirty.economy = false;
      syncEconomy();
    }

    if (dirty.all) {
      renderAll();
    } else {
      Object.keys(dirty.cards).forEach(function (id) { UI.updateCard(id, currentDate); });
      if (dirty.header) UI.renderHeader(currentDate, today);
      if (dirty.extras) UI.renderDayExtras(currentDate);
      // Semana, progreso y ficha son caros: solo se recalculan si están a la vista.
      if (dirty.week) renderWeekIfOpen();
      if (dirty.progress && !UI.els.views.progress.hidden) UI.renderProgress(currentDate);
      if (dirty.habit) renderHabitIfOpen();
      if (dirty.notes) renderNotesIfOpen();
    }

    dirty.all = false;
    dirty.header = false;
    dirty.progress = false;
    dirty.week = false;
    dirty.extras = false;
    dirty.habit = false;
    dirty.notes = false;
    dirty.cards = {};
  }

  function renderAll() {
    UI.renderHeader(currentDate, today);
    UI.renderHabitList(currentDate);
    UI.renderDayExtras(currentDate);
    UI.renderSettings();
    renderWeekIfOpen();
    if (!UI.els.views.progress.hidden) UI.renderProgress(currentDate);
    renderHabitIfOpen();
    renderNotesIfOpen();
    renderPlanIfOpen();
  }

  /** Los 7 días de la semana que contiene `weekAnchor`. */
  function weekDates() {
    const first = U.startOfWeek(U.fromKey(weekAnchor), S.getSettings().weekStart);
    const out = [];
    for (let i = 0; i < 7; i++) out.push(U.toKey(U.addDays(first, i)));
    return out;
  }

  /**
   * Histórico entero: la rejilla de la semana más lo que depende del periodo
   * —cumplimiento, calendario y evolución—, que se mudó aquí desde Progreso.
   */
  function renderWeekIfOpen() {
    if (UI.els.views.week.hidden) return;
    UI.renderWeek(weekDates(), today);
    UI.renderHistory(currentDate, viewPeriod, calScale);
    UI.renderWeight(today, weightRange);
  }

  function renderHabitIfOpen() {
    if (UI.els.views.habit.hidden || !habitId) return;

    const habit = S.getHabit(habitId);
    if (!habit) { closeHabit(); return; }        // lo han borrado desde el modal
    if (UI.isHiddenHabit(habit)) { closeHabit(); return; }   // se acaba de ocultar
    UI.renderHabitView(habit, habitMonth, today);
  }

  function onStoreEvent(event, payload) {
    // Cualquier cambio en los registros puede cumplir (o descumplir) una
    // misión o rellenar un día en blanco. Los de la EXP no: los provoca el
    // propio recálculo, y escucharlos lo haría girar en círculo.
    if (event.indexOf('game:') !== 0 && event !== 'error' && event !== 'outdated') {
      dirty.economy = true;
    }

    switch (event) {
      case 'log:change':
        dirty.cards[payload.habitId] = true;
        dirty.header = true;
        dirty.progress = true;
        dirty.week = true;
        dirty.extras = true;
        dirty.habit = true;
        // La etiqueta de cada nota dice cómo fue ese día, así que marcar
        // un hábito también la cambia.
        dirty.notes = true;
        break;
      case 'note:change':
        dirty.extras = true;
        dirty.progress = true;
        dirty.notes = true;
        break;
      case 'freenote:change':
        // Solo cambia la lista de Notas, y mientras se escribe ni eso.
        dirty.notes = true;
        break;
      case 'game:points':
      case 'game:achievement':
      case 'game:streak':
        dirty.header = true;
        dirty.progress = true;
        break;
      case 'error':
        UI.toast('No se pudieron guardar los cambios. ¿Sin espacio en el navegador?',
                 { type: 'error', icon: '⚠️' });
        break;
      case 'outdated':
        // Otra ventana ya tiene una versión más nueva: esta ha dejado de
        // guardar para no pisarla, así que se recarga para ponerse al día.
        UI.toast('Hay una versión más nueva abierta. Actualizando…', { icon: '🔄' });
        setTimeout(function () { window.location.reload(); }, 1500);
        return;
      default:
        // habit:*, settings, freeze y reemplazos tocan demasiadas cosas.
        dirty.all = true;
    }
    scheduleFlush();
  }

  /* ── XP, niveles y logros ─────────────────────────────────
     La XP se otorga y se retira de forma simétrica: si desmarcas
     un hábito o borras un registro, la pierdes. Así el total nunca
     se infla repitiendo una acción, y volver a abrir una pantalla
     no paga nada porque no cambia ningún estado. ───────────── */

  /**
   * Único punto por el que entra XP en la app. Que todo pase por aquí es
   * lo que permite detectar la subida de nivel una sola vez, sin depender
   * de quién reparta ni de qué pantalla esté abierta.
   */
  function grantXp(amount) {
    const delta = Math.floor(Number(amount) || 0);
    if (!delta) return false;

    const before = S.getGame().points;
    S.addPoints(delta);
    const after = S.getGame().points;

    if (!St.leveledUp(before, after)) return false;
    onLevelUp(St.levelInfo(after));
    return true;
  }

  /* La presentación va aparte de la detección: cambiar la celebración no
     toca la regla de cuándo se ha subido de nivel.
     Para conectar una recompensa nueva basta con llamar a grantXp() con el
     valor de la tabla, como hacen las misiones con St.XP.mission. */
  function onLevelUp(info) {
    // Primero se apunta y luego se celebra: la celebración es efímera y el
    // registro no, así que una excepción pintando la ventana no puede
    // llevarse por delante la fecha del ascenso.
    S.recordLevelUp(info.level, today);
    UI.showLevelUp(info.level, info.rank.name, info.rank);
  }

  function withScoring(habit, dateKey, mutate) {
    const beforeDone = St.isComplete(habit, S.getLog(habit.id, dateKey));
    const beforePerfect = St.dayStats(dateKey).perfect;
    // El bonus del día ya no es fijo: depende de cuántos hábitos lleves, así
    // que se mide entero antes y después y se paga solo la diferencia.
    const beforeBonus = St.dayBonus(dateKey);

    mutate();

    const afterDone = St.isComplete(habit, S.getLog(habit.id, dateKey));
    const afterPerfect = St.dayStats(dateKey).perfect;
    const afterBonus = St.dayBonus(dateKey);

    let delta = afterBonus - beforeBonus;
    // Cada hábito paga lo suyo ese día (2.7.0): desmarcar devuelve lo mismo.
    if (afterDone !== beforeDone) delta += (afterDone ? 1 : -1) * St.habitXp(habit, dateKey);
    if (delta) grantXp(delta);

    const effects = S.getSettings().effects;

    if (afterDone && !beforeDone) {
      UI.pulse(habit.id);
      if (effects) UI.buzz(25);

      const streak = St.currentStreak(habit, today);
      if (streak >= 3) {
        UI.toast('¡' + streak + ' días seguidos con ' + habit.name + '!',
                 { type: 'success', icon: '⛓️' });
      }
    }

    if (afterPerfect && !beforePerfect) {
      UI.toast('Día perfecto. Todos los hábitos cumplidos.', { type: 'success', icon: '⭐' });
      if (effects) { UI.celebrate(); UI.buzz([40, 60, 40]); }
    }

    syncProgressState();
  }

  /**
   * XP por aguantar sin caer. Se calcula sobre la MEJOR racha histórica, que
   * nunca baja, y se lleva la cuenta de lo ya cobrado: así una recaída no
   * retira XP ganada y ningún hito se puede cobrar dos veces. Se dispara al
   * arrancar y tras cada acción, así que un hito que se cumple solo con el
   * paso de los días también se paga.
   */
  function syncAvoidXp() {
    const debido = S.getHabits(true)
      .filter(St.isAvoid)
      .reduce(function (sum, h) {
        return sum + St.avoidXpFor(St.bestStreak(h, today));
      }, 0);

    // Tabla de hitos nueva (2.7.0): lo cobrado con la vieja se baja una vez
    // a lo que daría la nueva por las mismas rachas. No se quita EXP: solo
    // se rehace la cuenta, para que los hitos que vengan se paguen.
    if (S.getGame().avoidXpRebase) {
      S.rebaseAvoidXp(Math.min(S.getGame().avoidXpPaid, debido));
    }

    const pagado = S.getGame().avoidXpPaid;
    if (debido <= pagado) return;

    // Se apunta antes de pagar: si algo fallase, se cobra de menos y no de más.
    S.setAvoidXpPaid(debido);
    grantXp(debido - pagado);

    // La EXP se cobra igual, pero con los de evitar ocultos el aviso no
    // dice el nombre: sería justo lo que se quiere esconder.
    S.getHabits().filter(St.isAvoid).forEach(function (h) {
      if (UI.isHiddenHabit(h)) return;
      const hito = St.avoidMilestoneAt(St.currentStreak(h, today));
      if (hito) UI.toast(hito.name + ': ' + h.name, { type: 'achievement', icon: '💧' });
    });
  }

  /** Actualiza el récord de racha y desbloquea los logros nuevos. */
  function syncProgressState() {
    // Mismo criterio que topStreak(): los malos hábitos no entran en el
    // récord general, van en su propio bloque.
    const best = S.getHabits().reduce(function (max, h) {
      return St.isAvoid(h) ? max : Math.max(max, St.bestStreak(h, today));
    }, 0);
    S.setBestStreak(best);

    syncAvoidXp();
    syncGoals();

    St.earnedAchievements(today).forEach(function (id) {
      if (S.unlockAchievement(id)) {
        const ach = St.achievementById(id);
        UI.toast('Logro desbloqueado: ' + ach.name, { type: 'achievement', icon: ach.icon });
      }
    });
  }

  /* ── Objetivos a largo plazo (2.8.0) ──────────────────────
     Se celebran una vez, el día en que se alcanzan. Si luego dejan de
     estarlo (desmarcas un día), se olvida la celebración y, al volver a
     alcanzarlos, se celebra de nuevo. No dan EXP. ─────────────────────── */

  function syncGoals() {
    S.getGoals().forEach(function (g) {
      const p = St.goalProgress(g, today);
      if (!p) return;

      if (p.status === 'done' && !g.doneAt) {
        S.setGoalDone(g.id, today);
        dirty.progress = true;
        dirty.habit = true;
        if (UI.isHiddenHabit(p.habit)) return;
        UI.toast('Objetivo cumplido: ' + p.habit.name + ', ' +
                 new Intl.NumberFormat('es-ES').format(g.amount) + ' ' + St.goalUnit(p.habit, g.amount) + '.',
                 { type: 'achievement', icon: '🏁', duration: 6000 });
        if (S.getSettings().effects) { UI.celebrate(); UI.buzz([40, 60, 40]); }
      } else if (p.status !== 'done' && g.doneAt) {
        S.setGoalDone(g.id, null);
        dirty.progress = true;
        dirty.habit = true;
      }
    });
  }

  function onGoalSubmit(e) {
    e.preventDefault();
    const data = UI.readGoalForm();
    if (!data) return;

    const editing = UI.els.goalForm.dataset.editing;
    const r = editing ? S.updateGoal(editing, data) : S.addGoal(data);
    if (!r) {
      UI.toast('No se pudo guardar el objetivo' +
               (editing ? '.' : ': como mucho ' + S.MAX_GOALS + ' a la vez.'), { type: 'error', icon: '⚠️' });
      return;
    }
    UI.closeGoalModal();
    UI.toast(editing ? 'Objetivo actualizado.' : 'Objetivo creado.', { type: 'success', icon: '🏁' });
    syncProgressState();
  }

  function deleteGoal(id) {
    const g = S.getGoal(id);
    if (!g) return;
    if (!window.confirm('¿Eliminar este objetivo? Tus registros no se tocan.')) return;
    const snap = S.deleteGoal(id);
    UI.closeGoalModal();
    UI.toast('Objetivo eliminado.', {
      icon: '🗑️',
      action: { label: 'Deshacer', onClick: function () { S.restoreGoal(snap); syncProgressState(); } }
    });
  }

  /* ── Temporizador (2.8.0) ─────────────────────────────────
     Uno a la vez. Se guarda la hora de inicio y no un contador: así sigue
     contando bien aunque el móvil congele la app o se recargue la página.
     Vive en su propia clave, fuera del almacén: es de este dispositivo, no
     un dato tuyo. Lo apuntado al terminar sí va al almacén. ─────────────── */

  const TIMER_KEY = 'habitTracker.timer';
  // Más de esto en marcha suele ser un temporizador olvidado: se pregunta
  // antes de apuntarlo.
  const TIMER_SUSPECT_MS = 3 * 3600 * 1000;

  let timer = null;          // { habitId, date, startedAt (ms) | null si en pausa, accMs, reached }
  let timerInterval = null;
  let wakeLock = null;

  function loadTimer() {
    timer = null;
    try {
      const t = JSON.parse(localStorage.getItem(TIMER_KEY));
      if (t && typeof t.habitId === 'string' && U.isValidKey(t.date) && S.getHabit(t.habitId)) {
        timer = {
          habitId: t.habitId,
          date: t.date,
          startedAt: typeof t.startedAt === 'number' && isFinite(t.startedAt) ? t.startedAt : null,
          accMs: Math.max(0, Number(t.accMs) || 0),
          reached: t.reached === true
        };
      }
    } catch (e) { timer = null; }
  }

  function saveTimer() {
    try {
      if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
      else localStorage.removeItem(TIMER_KEY);
    } catch (e) { /* sin almacenamiento: sigue en memoria */ }
  }

  function timerElapsed() {
    return timer ? timer.accMs + (timer.startedAt ? Math.max(0, Date.now() - timer.startedAt) : 0) : 0;
  }

  function timerGoalMs(habit) {
    return Math.round(St.timerGoalMinutes(habit) * 60000);
  }

  /** Repinta la barra, arranca o para el tic y pide (o suelta) la pantalla. */
  function paintTimer() {
    const habit = timer && S.getHabit(timer.habitId);
    if (timer && !habit) { timer = null; saveTimer(); }

    if (!timer) {
      if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
      releaseWake();
      UI.renderTimer(null, currentDate);
      return;
    }

    const corre = timer.startedAt !== null;
    if (corre && timerInterval === null) timerInterval = setInterval(tickTimer, 1000);
    if (!corre && timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
    if (corre) requestWake(); else releaseWake();

    UI.renderTimer({
      habit: habit, elapsed: timerElapsed(), goal: timerGoalMs(habit),
      running: corre, reached: timer.reached
    }, currentDate);
  }

  function tickTimer() {
    if (!timer) return;
    const habit = S.getHabit(timer.habitId);
    if (!habit) { clearTimer(); return; }

    const meta = timerGoalMs(habit);
    if (meta && !timer.reached && timerElapsed() >= meta) {
      timer.reached = true;
      saveTimer();
      onTimerGoal(habit);
      if (!timer) return;          // un check se cierra solo al llegar
    }
    paintTimer();
  }

  /** Llega al tiempo: un check se marca y se cierra; uno de cantidad sigue. */
  function onTimerGoal(habit) {
    if (S.getSettings().effects) { chime(); UI.buzz([200, 100, 200]); }

    if (habit.type === 'check') {
      const fecha = timer.date;
      clearTimer();
      if (!St.isComplete(habit, S.getLog(habit.id, fecha))) {
        withScoring(habit, fecha, function () { S.setLog(habit.id, fecha, true); });
      }
      UI.toast('¡Tiempo! ' + habit.name + ' hecho.', { type: 'success', icon: '⏱️' });
      return;
    }
    UI.toast('Meta del día alcanzada en ' + habit.name + '. Sigue si quieres o pulsa Terminar.',
             { type: 'success', icon: '⏱️', duration: 6000 });
  }

  function onTimerButton(habit) {
    if (timer && timer.habitId === habit.id) {
      if (timer.startedAt === null) toggleTimerPause();
      return;
    }
    if (timer) {
      const otro = S.getHabit(timer.habitId);
      UI.toast('Ya hay un temporizador en marcha' + (otro ? ' con ' + otro.name : '') +
               '. Termínalo o descártalo antes.', { icon: '⏱️' });
      return;
    }
    if (habit.type === 'check' && St.isComplete(habit, S.getLog(habit.id, today))) {
      UI.toast(habit.name + ' ya está hecho hoy.', { icon: '✓' });
      return;
    }
    timer = { habitId: habit.id, date: today, startedAt: Date.now(), accMs: 0, reached: false };
    saveTimer();
    paintTimer();
  }

  function toggleTimerPause() {
    if (!timer) return;
    if (timer.startedAt === null) {
      timer.startedAt = Date.now();
    } else {
      timer.accMs = timerElapsed();
      timer.startedAt = null;
    }
    saveTimer();
    paintTimer();
  }

  function clearTimer() {
    timer = null;
    saveTimer();
    paintTimer();
  }

  /** Terminar: en cantidad suma lo cronometrado; en un check, avisa si faltaba. */
  function finishTimer() {
    if (!timer) return;
    const habit = S.getHabit(timer.habitId);
    if (!habit) { clearTimer(); return; }

    const ms = timerElapsed();
    const fecha = timer.date;

    if (habit.type === 'check') {
      const falta = Math.ceil((timerGoalMs(habit) - ms) / 60000);
      clearTimer();
      if (St.isComplete(habit, S.getLog(habit.id, fecha))) return;
      UI.toast('Faltaba' + (falta === 1 ? ' 1 minuto' : 'n ' + falta + ' minutos') + ': no se ha marcado.', {
        icon: '⏱️',
        action: {
          label: 'Marcar igual',
          onClick: function () {
            if (!St.isComplete(habit, S.getLog(habit.id, fecha))) {
              withScoring(habit, fecha, function () { S.setLog(habit.id, fecha, true); });
            }
          }
        }
      });
      return;
    }

    const factor = St.timeUnitFactor(habit) || 1;
    const minutos = ms / 60000;
    // En minutos, a minuto entero; en horas, con dos decimales; en segundos, enteros.
    const cantidad = factor === 1 ? Math.round(minutos)
                   : factor > 1 ? Math.round(minutos / factor * 100) / 100
                   : Math.round(minutos / factor);

    if (cantidad <= 0) {
      clearTimer();
      UI.toast('Menos de un minuto: no se apunta nada.', { icon: '⏱️' });
      return;
    }
    if (ms > TIMER_SUSPECT_MS &&
        !window.confirm('El temporizador lleva ' + Math.round(minutos / 60 * 10) / 10 +
                        ' horas en marcha. ¿Apuntar ' + cantidad + ' ' + habit.target.unit + ' en ' +
                        habit.name + '?')) return;

    clearTimer();
    withScoring(habit, fecha, function () { S.addQuantity(habit.id, fecha, cantidad); });
    UI.toast('+' + cantidad + ' ' + habit.target.unit + ' en ' + habit.name +
             (fecha !== today ? ' (el día que lo empezaste)' : '') + '.', { type: 'success', icon: '⏱️' });
  }

  function cancelTimer() {
    if (!timer) return;
    const min = Math.floor(timerElapsed() / 60000);
    if (min >= 1 && !window.confirm('¿Descartar ' + (min === 1 ? '1 minuto' : min + ' minutos') +
                                    ' sin apuntarlos?')) return;
    clearTimer();
  }

  /* Pantalla encendida mientras corre: con ella apagada, el móvil congela la
     app y el aviso de "¡Tiempo!" llegaría al volver, no a su hora. El tiempo
     se cuenta bien igualmente. */
  function requestWake() {
    if (wakeLock || document.hidden || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
      // Si el temporizador se paró mientras se concedía, se suelta ya.
      if (!timer || timer.startedAt === null) releaseWake();
    }).catch(function () { /* sin permiso o sin batería: da igual */ });
  }

  function releaseWake() {
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(function () { /* ya suelto */ });
  }

  /** Dos notas suaves. Sin archivos de sonido: lo genera el navegador. */
  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [[0, 660], [0.35, 880]].forEach(function (n) {
        const t0 = ctx.currentTime + n[0];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n[1];
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 1.3);
      });
      setTimeout(function () { ctx.close(); }, 2000);
    } catch (e) { /* sin audio: queda la vibración y el aviso */ }
  }

  /* ── Misiones y días en blanco ────────────────────────────
     Los dos funcionan como los hitos de evitar: lo que toca se calcula a
     partir de los registros y se apunta en un libro lo ya cobrado o
     restado. Se paga solo la diferencia, en los dos sentidos, así que nada
     se cobra dos veces y deshacer devuelve lo justo. Se recalcula al
     arrancar, al cambiar de día y tras cualquier cambio en los datos. ── */

  function syncEconomy() {
    syncMissionXp();
    syncBlankDays();
  }

  function syncMissionXp() {
    S.getMissionWeeks().forEach(function (wk) {
      const r = St.missionXp(wk, today);
      const pagado = S.getMissionPaid(wk);
      if (r.xp === pagado) return;

      S.setMissionPaid(wk, r.xp);
      grantXp(r.xp - pagado);

      if (r.xp > pagado) {
        UI.toast(r.all ? '¡Las tres misiones cumplidas! +' + (r.xp - pagado) + ' EXP'
                       : 'Misión cumplida: +' + (r.xp - pagado) + ' EXP',
                 { type: 'achievement', icon: '🎯' });
      } else {
        UI.toast('Una misión ha dejado de cumplirse: −' + (pagado - r.xp) + ' EXP', { icon: '🎯' });
      }
    });
  }

  // Cuántos días hacia atrás se revisan como mucho: si la app pasa meses
  // sin abrirse, no hace falta recorrer años enteros.
  const BLANK_SCAN_DAYS = 400;

  function syncBlankDays() {
    let devuelto = 0;
    let restado = 0;
    const nuevos = [];

    // Primero las devoluciones: un día penalizado que ya tiene algo apuntado.
    // Se devuelven aunque la penalización esté apagada: es EXP tuya.
    const libro = S.getPenalties();
    Object.keys(libro).forEach(function (k) {
      if (St.isBlankDay(k)) return;
      const n = libro[k];
      S.clearPenalty(k);
      if (n) { grantXp(n); devuelto += n; }
    });

    if (S.getSettings().blankPenalty) {
      const limite = U.addDaysKey(today, -BLANK_SCAN_DAYS);
      const desde = S.getGame().penaltyFrom > limite ? S.getGame().penaltyFrom : limite;

      // Hoy no: hasta medianoche todavía estás a tiempo.
      for (let k = desde; k < today; k = U.addDaysKey(k, 1)) {
        if (k in S.getPenalties() || !St.isBlankDay(k)) continue;

        // Nunca por debajo del inicio del nivel en que estás.
        const pts = S.getGame().points;
        const suelo = St.xpForLevel(St.levelFromXp(pts));
        const n = Math.max(0, Math.min(St.XP.blankDay, pts - suelo));

        S.setPenalty(k, n);
        if (n) grantXp(-n);
        restado += n;
        nuevos.push(k);
      }
    }

    if (nuevos.length) {
      const ayer = U.addDaysKey(today, -1);
      const cuando = nuevos.length === 1
        ? (nuevos[0] === ayer ? 'Ayer quedó' : 'El ' + U.formatShort(U.fromKey(nuevos[0])) + ' quedó') + ' en blanco'
        : nuevos.length + ' días en blanco';
      UI.toast(cuando + (restado ? ': −' + restado + ' EXP.' : ' (sin EXP que quitar en este nivel).') +
               (nuevos.length === 1 ? ' Si lo rellenas' : ' Si los rellenas') + ', se devuelven.', {
        icon: '⬜',
        duration: 9000,
        action: { label: 'Ir al día', onClick: function () { goToDate(nuevos[nuevos.length - 1]); UI.setView('today'); } }
      });
    }
    if (devuelto) {
      UI.toast('Día rellenado: +' + devuelto + ' EXP devueltos.', { type: 'success', icon: '↩' });
    }
  }

  /* ── Navegación entre días ────────────────────────────────── */

  function goToDate(key) {
    if (key > today) return;      // no se registra en el futuro
    currentDate = key;
    UI.toggleDayPicker(false);
    dirty.all = true;
    scheduleFlush();
  }

  function stepDay(delta) {
    goToDate(U.addDaysKey(currentDate, delta));
  }

  /* ── Selector de día ──────────────────────────────────────── */

  let pickerMonth = U.startOfMonth(new Date());

  function openPickerAt(dateKey) {
    pickerMonth = U.startOfMonth(U.fromKey(dateKey));
    UI.renderDayPicker(pickerMonth, currentDate, today);
  }

  function stepPickerMonth(delta) {
    pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + delta, 1);
    UI.renderDayPicker(pickerMonth, currentDate, today);
  }

  /* ── Acciones sobre las tarjetas ──────────────────────────── */

  function onHabitListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.habit-card');
    if (!card) return;

    const habit = S.getHabit(card.dataset.id);
    if (!habit) return;

    const action = btn.dataset.action;

    if (action === 'detail') { openHabit(habit.id); return; }
    if (action === 'timer') { onTimerButton(habit); return; }

    // Una franja de un hábito a evitar apunta un fallo, no un logro: va por
    // el mismo camino que el ✗, fuera de withScoring.
    if (action === 'slot' && St.isAvoid(habit)) {
      S.toggleSlot(habit.id, currentDate, btn.dataset.slot);
      syncProgressState();
      return;
    }

    // Con ratón o dedo, el paso ya lo ha dado onStepperPointerDown. Aquí solo
    // debe entrar el teclado, que activa el botón con un click de detail 0.
    if (action === 'plus' || action === 'minus') {
      if (e.detail !== 0) return;
      applyStep(btn);
      return;
    }

    withScoring(habit, currentDate, function () {
      if (action === 'check') S.toggleCheck(habit.id, currentDate);
      else if (action === 'slot') S.toggleSlot(habit.id, currentDate, btn.dataset.slot);
    });
  }

  /* ── Pulsación mantenida en + y − ─────────────────────────
     Un toque suma un paso. Mantener pulsado repite, con un margen previo
     para no disparar la repetición en un toque normal.
     Se usan eventos de puntero, que cubren ratón y táctil por un solo
     camino; el teclado sigue llegando por 'click', que no genera
     pointerdown. ──────────────────────────────────────────── */

  const HOLD_DELAY = 500;   // margen antes de empezar a repetir
  const HOLD_RATE = 100;    // un paso cada 100 ms mientras se aguanta

  let holdTimer = null;
  let holdInterval = null;
  let holdButton = null;

  /** Corta la repetición y deja los temporizadores a cero. */
  function stopHold() {
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdInterval !== null) { clearInterval(holdInterval); holdInterval = null; }
    if (holdButton) {
      holdButton.classList.remove('is-holding', 'is-repeating');
      holdButton = null;
    }
  }

  /**
   * Aplica un paso del stepper. Devuelve false cuando ya no tiene sentido
   * seguir: el hábito ha desaparecido o restar ya no baja de 0.
   */
  function applyStep(btn) {
    const card = btn.closest('.habit-card');
    const habit = card && S.getHabit(card.dataset.id);
    if (!habit) return false;

    const suma = btn.dataset.action === 'plus';
    const actual = Number(S.getLog(habit.id, currentDate)) || 0;
    if (!suma && !actual) return false;          // restar de 0 no hace nada

    // En un hábito a evitar, "+" apunta un fallo. No pasa por withScoring:
    // su XP va por hitos de racha, y restarle 10 por caer se comería XP que
    // nunca se le dio.
    if (St.isAvoid(habit)) {
      const antes = St.currentStreak(habit, today);
      S.addQuantity(habit.id, currentDate, suma ? 1 : -1);

      if (suma && antes > 1 && !St.failsOf(actual)) {
        UI.toast('Anotado. Llevabas ' + antes + ' días sin caer: eso no se borra.',
                 { icon: '💧' });
      }
      syncProgressState();
      return true;
    }

    if (habit.type !== 'quantity') return false;

    withScoring(habit, currentDate, function () {
      S.addQuantity(habit.id, currentDate, suma ? habit.target.step : -habit.target.step);
    });
    return true;
  }

  function onStepperPointerDown(e) {
    if (e.button) return;                       // solo el botón principal

    const btn = e.target.closest('[data-action="plus"], [data-action="minus"]');
    if (!btn) return;

    stopHold();

    // El paso inmediato: mantener pulsado es un atajo, no un requisito.
    if (!applyStep(btn)) return;

    holdButton = btn;
    btn.classList.add('is-holding');

    // Capturar el puntero evita que un dedo que se mueve un milímetro
    // corte la repetición.
    if (btn.setPointerCapture) {
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* da igual */ }
    }

    holdTimer = setTimeout(function () {
      holdTimer = null;
      btn.classList.add('is-repeating');

      holdInterval = setInterval(function () {
        // Si la tarjeta se ha repintado entera, este nodo ya no existe.
        if (!btn.isConnected || !applyStep(btn)) stopHold();
      }, HOLD_RATE);
    }, HOLD_DELAY);
  }

  /** Valor escrito a mano: sustituye el total del día, no lo suma. */
  function applyAmount(input) {
    const card = input.closest('.habit-card');
    const habit = card && S.getHabit(card.dataset.id);
    if (!habit) return;

    const value = Number(input.value);
    if (input.value !== '' && (!isFinite(value) || value < 0)) {
      UI.toast('Escribe un número válido.', { type: 'error', icon: '⚠️' });
      input.value = Number(S.getLog(habit.id, currentDate)) || '';
      return;
    }

    // Un hábito a evitar con máximo no pasa por withScoring: no paga EXP por
    // día, sino por hitos de racha. Si pasara, pasarse del límite le
    // restaría 25 de EXP que nunca se le dieron.
    if (St.isCapped(habit)) {
      const antes = St.isComplete(habit, S.getLog(habit.id, currentDate));
      const racha = St.currentStreak(habit, today);

      S.setLog(habit.id, currentDate, input.value === '' ? null : value);

      const despues = St.isComplete(habit, S.getLog(habit.id, currentDate));
      if (antes && !despues) {
        UI.toast('Te has pasado de ' + habit.target.amount + ' ' + habit.target.unit +
                 (racha > 1 ? '. Llevabas ' + racha + ' días sin pasarte: eso no se borra.' : '.'),
                 { icon: '💧' });
      }
      syncProgressState();
      return;
    }

    withScoring(habit, currentDate, function () {
      S.setLog(habit.id, currentDate, input.value === '' ? null : value);
    });
  }

  /* ── Ficha de un hábito ───────────────────────────────────── */

  function openHabit(id) {
    habitId = id;
    habitMonth = U.startOfMonth(U.fromKey(currentDate));
    UI.setView('habit');
    renderHabitIfOpen();
    window.scrollTo(0, 0);
  }

  function closeHabit() {
    habitId = null;
    UI.setView('today');
  }

  function toggleArchive() {
    const habit = S.getHabit(habitId);
    if (!habit) return;

    const wasArchived = habit.archived;
    S.setArchived(habit.id, !wasArchived);

    if (wasArchived) {
      UI.toast('"' + habit.name + '" vuelve a estar activo.', { type: 'success', icon: '↩' });
      renderHabitIfOpen();
    } else {
      UI.toast('"' + habit.name + '" archivado. Su histórico se conserva.', { icon: '🗄️' });
      closeHabit();
    }
  }

  /**
   * Pausa un hábito con el motivo elegido. No se pregunta a confirmar: es
   * reversible de un toque y sin pérdida, al revés que archivar o borrar.
   */
  function onPauseSubmit(e) {
    e.preventDefault();

    const data = UI.readPauseForm();
    const habit = S.getHabit(data.habitId);
    if (!habit) { UI.closePauseModal(); return; }

    const pausa = S.pauseHabit(habit.id, data.reason, data.note);
    UI.closePauseModal();

    if (!pausa) {
      UI.toast('Ese hábito ya estaba en pausa.', { type: 'error', icon: '⚠️' });
      return;
    }

    UI.toast('"' + habit.name + '" en pausa · ' + UI.pauseLabel(pausa) +
             '. Tu racha se queda como está.', { icon: '⏸' });
  }

  function resumeHabit(id) {
    const habit = S.getHabit(id);
    if (!habit) return;

    const pausa = S.pauseInfo(habit);
    if (!pausa) return;

    const dias = U.daysBetween(pausa.from, today);
    S.resumeHabit(id);

    UI.toast('"' + habit.name + '" vuelve' +
             (dias > 0 ? ' tras ' + dias + (dias === 1 ? ' día' : ' días') + ' en pausa' : '') + '.',
             { type: 'success', icon: '▶' });
  }

  /* ── Plan de la semana ────────────────────────────────────
     Se planifica cualquier día: la semana en curso desde hoy, o la que
     viene. Al confirmar, la semana se bloquea hasta el domingo. Planificar
     no da EXP: es una herramienta, no un hábito. ───────────────────── */

  // Vista a la que vuelve "Volver" de Plan: la que estaba abierta al entrar.
  let planBack = 'week';

  /** Abre Plan. Sin semana indicada, el domingo ofrece ya la que viene. */
  function showPlan(offset) {
    const abierta = Object.keys(UI.els.views).filter(function (k) {
      return !UI.els.views[k].hidden;
    })[0];
    if (abierta && abierta !== 'plan') planBack = abierta;

    const o = offset === undefined ? (U.fromKey(today).getDay() === 0 ? 1 : 0) : offset;
    UI.setPlanOffset(o);
    UI.resetPlanDraft();
    UI.setView('plan');
    UI.renderPlanView();
    window.scrollTo(0, 0);
  }

  function renderPlanIfOpen() {
    if (UI.els.views.plan.hidden) return;
    UI.renderPlanView();
  }

  /**
   * Cambiar qué toca hoy —un plan, una ausencia que empieza hoy— puede
   * dejar el día perfecto o quitarle el bonus. Se mide entero antes y
   * después y se paga la diferencia, igual que en withScoring(). Los días
   * pasados no cambian y los futuros aún no tienen bonus.
   */
  function withTodayBonus(mutate) {
    const antes = St.dayBonus(today);
    const result = mutate();
    const delta = St.dayBonus(today) - antes;
    if (delta) grantXp(delta);
    syncProgressState();
    return result;
  }

  /** El único desbloqueo de una semana confirmada (2.7.0). */
  function unlockPlan() {
    const wk = UI.readPlan().weekKey;
    if (S.wasWeekUnlocked(wk)) return;
    if (!window.confirm('Solo puedes desbloquear esta semana una vez. Los días que ya han pasado ' +
                        'se quedan como estaban. Al volver a confirmar, quedará bloqueada hasta el domingo.\n\n' +
                        '¿Desbloquearla?')) return;

    if (!S.unlockWeekPlan(wk)) {
      UI.toast('Esta semana no se puede desbloquear.', { type: 'error', icon: '⚠️' });
      return;
    }
    UI.resetPlanDraft();
    UI.renderPlanView();
    UI.toast('Semana desbloqueada. Cambia lo que necesites y vuelve a confirmar.', { icon: '🔓' });
  }

  function acceptMissions() {
    const data = UI.readMissions();
    if (!data.list.length) {
      UI.toast('Elige al menos una misión, o pulsa "Sugerir".', { type: 'error', icon: '🎯' });
      return;
    }
    if (!window.confirm('Una vez aceptadas, las misiones no se cambian hasta el domingo. ¿Aceptarlas?')) return;

    const ok = S.acceptMissions(data.weekKey, data.list);
    if (!ok) {
      UI.toast('Esa semana ya tiene misiones.', { type: 'error', icon: '⚠️' });
      return;
    }
    UI.renderPlanView();
    UI.toast(ok.length === 1 ? 'Misión aceptada.' : ok.length + ' misiones aceptadas. ¡A por ellas!',
             { type: 'success', icon: '🎯' });
  }

  function confirmPlan() {
    const data = UI.readPlan();
    const snapshot = withTodayBonus(function () {
      return S.confirmWeekPlan(data.weekKey, data.draft);
    });
    if (!snapshot) {
      UI.toast('Esa semana ya está planificada.', { type: 'error', icon: '⚠️' });
      return;
    }

    UI.resetPlanDraft();
    // Planificada la semana en curso, el resumen de la pasada ya cumplió.
    if (data.weekKey === S.planWeeks()[0]) {
      S.dismissWeekSummary(data.weekKey);
      UI.els.weekRecap.hidden = true;
    }

    UI.toast('Semana planificada y bloqueada hasta el domingo.', {
      icon: '🔒',
      action: {
        label: 'Deshacer',
        onClick: function () {
          withTodayBonus(function () { return S.undoWeekPlan(snapshot); });
          UI.toast('Plan deshecho: la semana vuelve a estar abierta.', { icon: '↩' });
        }
      }
    });
  }

  /* ── Ausencias programadas ────────────────────────────────── */

  const ABSENCE_ERRORS = {
    fechas: 'Elige las dos fechas.',
    pasado: 'Una ausencia no puede empezar antes de hoy.',
    orden: 'La fecha final va antes que la inicial.',
    larga: 'Como mucho 180 días. Para algo más largo, pausa o archiva el hábito.',
    vacia: 'Marca al menos un hábito (los que ya están en pausa no cuentan).'
  };

  function onAbsenceSubmit(e) {
    e.preventDefault();

    const data = UI.readAbsenceForm();
    const res = withTodayBonus(function () { return S.addAbsence(data); });
    if (res.error) {
      UI.toast(ABSENCE_ERRORS[res.error] || 'No se pudo programar.', { type: 'error', icon: '⚠️' });
      return;
    }

    UI.closeAbsenceModal();
    UI.toast('Ausencia programada: ' + res.count + (res.count === 1 ? ' hábito' : ' hábitos') +
             ' en pausa del ' + U.formatShort(U.fromKey(data.from)) + ' al ' +
             U.formatShort(U.fromKey(data.to)) + '.', { type: 'success', icon: '✈️' });
  }

  function cancelAbsence(id) {
    const a = S.getAbsences().filter(function (x) { return x.id === id; })[0];
    if (!a) return;

    const enCurso = a.from <= today;
    const pregunta = enCurso
      ? '¿Terminar la ausencia hoy? Desde hoy tus hábitos vuelven a contar; los días ya pasados siguen sin contar.'
      : '¿Cancelar esta ausencia? Esos días volverán a contar con normalidad.';
    if (!window.confirm(pregunta)) return;

    withTodayBonus(function () { return S.cancelAbsence(id); });
    UI.toast(enCurso ? 'Ausencia terminada: desde hoy todo vuelve a contar.' : 'Ausencia cancelada.',
             { icon: '↩' });
  }

  /* ── Anotar un día ────────────────────────────────────────
     El motivo es gratis; salvar el día del todo sigue costando
     comodín. El almacén cobra o devuelve, aquí solo se cuenta. ──── */

  function onDaySubmit(e) {
    e.preventDefault();

    const data = UI.readDayForm();
    if (!data.dateKey) { UI.closeDayModal(); return; }

    if (!data.reason && !data.skip) {
      UI.toast('Elige un motivo, o marca que el día no cuente.', { type: 'error', icon: '⚠️' });
      return;
    }

    const antes = S.getDayMark(data.dateKey);
    const eraSkip = !!(antes && antes.skip);
    const mark = S.setDayMark(data.dateKey, data.reason, data.note, data.skip);
    UI.closeDayModal();
    syncProgressState();

    if (!mark) return;

    // Si se pidió salvar el día y no había comodín, hay que decirlo: el
    // motivo se ha guardado igual, pero el día sigue contando.
    if (data.skip && !mark.skip) {
      UI.toast('Motivo guardado. Sin comodines, así que el día sigue contando.',
               { type: 'error', icon: '⚠️' });
      return;
    }

    if (mark.skip && !eraSkip) {
      UI.toast('Día salvado: no romperá tus rachas.', { type: 'success', icon: '🧊' });
      return;
    }
    if (!mark.skip && eraSkip) {
      UI.toast('Recuperas el comodín. El día vuelve a contar.');
      return;
    }
    UI.toast('Anotado: ' + UI.dayMarkLabel(mark) + '.', { icon: '✎' });
  }

  function clearDayMark() {
    const key = UI.els.dayForm.dataset.day;
    if (!key) return;

    const era = S.getDayMark(key);
    S.clearDayMark(key);
    UI.closeDayModal();
    syncProgressState();
    UI.toast(era && era.skip ? 'Quitado. Recuperas el comodín.' : 'Nota del día quitada.');
  }

  /**
   * Si ayer quedó a medias y no dijiste por qué, se ofrece una vez al
   * arrancar. Una vez: insistir con esto sería exactamente la clase de
   * recordatorio que quitamos en la 1.6.8.
   */
  function checkYesterdayMark() {
    const ayer = U.addDaysKey(today, -1);
    if (S.getDayMark(ayer)) return;
    // Quedó en blanco y ya lo ha dicho el aviso de la penalización.
    if (ayer in S.getPenalties()) return;

    const day = St.dayStats(ayer);
    if (!day.total || day.done >= St.streakGoalFor(ayer, day.total)) return;

    UI.toast('Ayer quedó a medias. ¿Qué pasó?', {
      icon: '✎',
      action: { label: 'Anotar', onClick: function () { UI.openDayModal(ayer); } }
    });
  }

  /* ── Modal de hábito ──────────────────────────────────────── */

  function onFormSubmit(e) {
    e.preventDefault();
    const data = UI.readForm();
    if (!data) return;

    const editingId = UI.els.habitForm.dataset.editing;

    if (editingId) {
      const previous = S.getHabit(editingId);
      // Mismo criterio que el almacén para borrar el histórico: cambia el
      // tipo, o un hábito a evitar pasa de contar fallos a tener un máximo.
      const modo = function (h) { return h.type === 'avoid' && h.target ? 'avoid-cap' : h.type; };
      const reinicia = previous && modo(previous) !== modo(data);

      S.updateHabit(editingId, data);

      // La dificultad va aparte: vale desde mañana, no desde hoy.
      const actualizado = S.getHabit(editingId);
      const manana = U.addDaysKey(today, 1);
      const cambiaXp = data.xpValue && actualizado && !St.isAvoid(actualizado) &&
                       St.habitXp(actualizado, manana) !== data.xpValue;
      if (cambiaXp) S.setHabitXp(editingId, data.xpValue);

      UI.toast(
        reinicia
          ? 'Hábito actualizado. Su histórico se ha reiniciado porque ahora se mide distinto.'
          : cambiaXp
            ? 'Hábito actualizado. Desde mañana da ' + data.xpValue + ' EXP (' + St.tierName(data.xpValue) + ').'
            : 'Hábito actualizado.',
        { type: 'success', icon: '✓' }
      );
    } else {
      // Un hábito nuevo no tiene días pasados que devolver: su dificultad
      // vale desde hoy mismo.
      if (data.xpValue) data.xp = [{ from: today, xp: data.xpValue }];
      S.addHabit(data);
      UI.toast('Hábito creado.', { type: 'success', icon: '✓' });
    }

    UI.closeModal();
    syncProgressState();
  }

  /** Borrado con red: pide confirmación y deja 7 segundos para deshacerlo. */
  function confirmDelete(id) {
    const habit = S.getHabit(id);
    if (!habit) return;

    if (!window.confirm('¿Eliminar "' + habit.name + '"? Se borrará también todo su histórico.')) return;

    const snapshot = S.deleteHabit(id);
    UI.closeModal();
    if (habitId === id) closeHabit();

    UI.toast('"' + habit.name + '" eliminado.', {
      icon: '🗑️',
      action: {
        label: 'Deshacer',
        onClick: function () {
          if (S.restoreHabit(snapshot)) {
            UI.toast('Hábito restaurado con su histórico.', { type: 'success', icon: '↩' });
          }
        }
      }
    });
  }

  /** Atrapa el foco dentro del modal mientras está abierto. */
  function onModalKeydown(e) {
    if (e.key === 'Escape') { UI.closeModal(); return; }
    if (e.key !== 'Tab') return;

    const focusables = U.$$(
      'button:not([hidden]):not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
      UI.els.habitModal
    ).filter(function (n) { return n.offsetParent !== null; });

    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ── Recordatorios: retirados en la 1.6.8 ─────────────────
     Una página web solo puede avisar mientras está abierta, así que el
     recordatorio de las 8:00 no llegaba nunca si la app estaba cerrada —
     que es justo cuando haría falta. Era una promesa que no se podía
     cumplir, y se ha quitado entera: interruptor, hora por hábito y los
     timers que lo programaban.

     Los campos `settings.notificationsEnabled` y `habit.reminder` siguen
     saneándose en el almacén, vacíos y sin uso: quitarlos obligaría a una
     migración y no gana nada. Si algún día hay un service worker que pueda
     avisar de verdad, el hueco está. ───────────────────────────────── */

  /* ── Exportación e importación ────────────────────────────── */

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJson() {
    download('habitos-' + today + '.json',
             JSON.stringify(S.getState(), null, 2),
             'application/json');
    S.markExported();
    UI.renderSettings();
    UI.toast('Copia descargada: habitos-' + today + '.json, en tu carpeta de descargas.',
             { type: 'success', icon: '↓' });
  }

  /**
   * Guardar copia (2.6.0): abre el menú de compartir del sistema para
   * mandarla a Drive, WhatsApp, el correo… Donde no se puede compartir
   * un archivo (casi todo el escritorio), se descarga como siempre.
   *
   * Chrome solo deja compartir ciertos tipos de archivo, y .json no está
   * entre ellos: si no lo acepta, va como .txt con el mismo contenido.
   * Importar acepta los dos.
   *
   * La copia solo cuenta como hecha si llegas a compartirla: cancelar el
   * menú no apaga el aviso.
   *
   * 2.6.1: se comparte SOLO el archivo. Con un texto al lado, varias apps de
   * Android (Drive, entre otras) se quedaban con el texto y tiraban el
   * archivo: el menú salía, pero la copia no llegaba. Y solo en pantallas
   * táctiles: en Windows el menú de compartir no tiene "guardar", así que
   * en el ordenador se descarga, que es lo que se espera ahí.
   */
  /*
   * 2.8.1: siempre como .txt. Antes se probaba primero .json, y Chrome para
   * Android dice que sí en canShare() pero luego lo rechaza al compartir con
   * NotAllowedError: su lista de tipos permitidos solo se mira en ese
   * momento, y .json no está en ella (.txt sí, en todas partes).
   */
  function shareBackup(reintento) {
    const tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const puede = tactil && navigator.share && navigator.canShare && typeof File === 'function';
    if (!puede) { exportJson(); return; }

    // Sin un toque reciente el navegador no abre el menú. Pasa si se llama
    // desde fuera de un clic, o si el anterior intento ya gastó ese toque:
    // se pide uno nuevo en vez de fallar.
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      if (reintento === true) exportJson(); else askShareAgain();
      return;
    }

    const json = JSON.stringify(S.getState());
    const file = new File([json], 'habitos-' + today + '.txt', { type: 'text/plain' });

    let vale = false;
    try { vale = navigator.canShare({ files: [file] }); } catch (e) { vale = false; }
    if (!vale) { exportJson(); return; }

    navigator.share({ files: [file] })
      .then(function () {
        S.markExported();
        UI.renderSettings();
        UI.toast('Copia enviada: ' + file.name + '.', { type: 'success', icon: '💾' });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;     // cerraste el menú: no pasa nada
        console.warn('No se pudo compartir la copia:', err);
        // Un NotAllowedError a la primera suele ser el toque caducado: se
        // ofrece otro intento. A la segunda, se descarga diciendo por qué.
        if (err && err.name === 'NotAllowedError' && reintento !== true) {
          askShareAgain();
          return;
        }
        UI.toast('No se pudo abrir el menú de compartir (' + ((err && err.name) || 'error') +
                 '). Se descarga en su lugar.', { type: 'error', icon: '⚠️', duration: 9000 });
        exportJson();
      });
  }

  function askShareAgain() {
    UI.toast('El móvil pide tocar otra vez para abrir el menú de compartir.', {
      icon: '💾',
      duration: 9000,
      action: { label: 'Compartir', onClick: function () { shareBackup(true); } }
    });
  }

  /**
   * Aviso de copia. Los datos viven solo en este navegador: si nunca exportas
   * y se borran, no hay de dónde recuperarlos. Se avisa una vez al arrancar.
   */
  function checkBackupReminder() {
    const dias = S.getSettings().backupDays;
    if (!dias) return;

    const last = S.getGame().lastExport;
    if (last && U.daysBetween(last, today) < dias) return;

    UI.toast(last
      ? 'Llevas ' + U.daysBetween(last, today) + ' días sin guardar una copia.'
      : 'Aún no has guardado ninguna copia de tus datos.', {
      icon: '💾',
      action: { label: 'Guardar copia', onClick: shareBackup }
    });
  }

  /** Reinicia la progresión dejando los hábitos y su histórico intactos. */
  function resetProgressOnly() {
    if (!window.confirm('Se pondrán a cero la EXP, el nivel, el rango y los logros.\n\n' +
                        'Tus hábitos y todo su histórico se conservan. ¿Continuar?')) return;

    S.resetProgress();
    UI.toast('Progresión reiniciada. Tus hábitos siguen intactos.', { type: 'success', icon: '↺' });
  }

  function csvCell(value) {
    const s = String(value === null || value === undefined ? '' : value);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const rows = [];

    S.getHabits(true).forEach(function (habit) {
      const logs = S.getHabitLogs(habit.id);

      Object.keys(logs).sort().forEach(function (dateKey) {
        const value = logs[dateKey];
        let shown;
        let goal;

        if (habit.type === 'check') {
          shown = 'sí';
          goal = '';
        } else if (habit.type === 'quantity') {
          shown = value + ' ' + habit.target.unit;
          goal = habit.target.amount + ' ' + habit.target.unit;
        } else if (St.isCapped(habit)) {
          shown = value + ' ' + habit.target.unit;
          goal = 'máximo ' + habit.target.amount + ' ' + habit.target.unit;
        } else if (habit.type === 'avoid' && !habit.slots) {
          // Un hábito a evitar sin franjas guarda un número de fallos, no un
          // objeto: aquí se colaba en la rama de franjas y rompía la exportación.
          const fallos = St.failsOf(value);
          shown = fallos + (fallos === 1 ? ' fallo' : ' fallos');
          goal = 'máximo ' + St.limitOf(habit);
        } else {
          shown = Object.keys(value).map(function (s) { return St.SLOT_LABELS[s]; }).join(' + ');
          goal = (habit.slots || []).map(function (s) { return St.SLOT_LABELS[s]; }).join(' + ');
        }

        rows.push([
          dateKey, habit.name, habit.type, shown, goal,
          St.isComplete(habit, value) ? 'sí' : 'no'
        ]);
      });
    });

    // El peso va en el mismo archivo, como una fila más por día: así una
    // hoja de cálculo puede cruzarlo con los hábitos sin juntar dos ficheros.
    const pesos = S.getWeights();
    Object.keys(pesos).forEach(function (dateKey) {
      rows.push([dateKey, 'Peso', 'peso', pesos[dateKey] + ' kg', '', '']);
    });

    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    rows.unshift(['fecha', 'habito', 'tipo', 'valor', 'meta', 'completado']);

    const csv = rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');

    // BOM + separador ';': así Excel en español abre el archivo con los
    // acentos correctos y cada campo en su columna.
    download('habitos-' + today + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    UI.toast('Datos exportados en CSV.', { type: 'success', icon: '↓' });
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    // .txt también: es como sale la copia compartida desde el móvil.
    input.accept = 'application/json,.json,text/plain,.txt';

    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function () {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (err) {
          UI.toast('El archivo no es un JSON válido.', { type: 'error', icon: '⚠️' });
          return;
        }

        if (!parsed || !Array.isArray(parsed.habits)) {
          UI.toast('El archivo no parece una copia de Hábitos.', { type: 'error', icon: '⚠️' });
          return;
        }

        if (!window.confirm('Esto reemplazará todos tus datos actuales. ¿Continuar?')) return;

        S.replaceState(parsed);
        UI.applyAccent(S.getSettings().accent);
        closeHabit();
        UI.toast('Datos importados.', { type: 'success', icon: '↑' });
      };
      reader.onerror = function () {
        UI.toast('No se pudo leer el archivo.', { type: 'error', icon: '⚠️' });
      };
      reader.readAsText(file);
    });

    // Firefox exige que el input esté en el documento para abrir el diálogo.
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  }

  function resetAll() {
    if (!window.confirm('Se borrarán todos tus hábitos y su histórico. Esta acción no se puede deshacer.\n\n¿Seguro?')) return;
    S.reset();
    UI.applyAccent(S.getSettings().accent);
    currentDate = today;
    closeHabit();
    UI.toast('Todo restablecido.');
  }

  /* ── Cambio de día ────────────────────────────────────────
     La app puede quedarse abierta toda la noche o el portátil
     suspenderse: se comprueba por temporizador y al volver a
     la pestaña. ──────────────────────────────────────────── */

  function refreshDate() {
    const key = U.todayKey();
    if (key === today) return;

    const wasOnToday = currentDate === today;
    today = key;
    if (wasOnToday) currentDate = key;   // si mirabas otro día, ahí te quedas

    weekAnchor = key;
    viewPeriod = U.startOfMonth(U.fromKey(key));
    dirty.all = true;
    dirty.economy = true;        // ayer acaba de cerrarse, y quizá una semana
    scheduleFlush();
  }

  function scheduleMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(function () {
      refreshDate();
      scheduleMidnight();
    }, next - now);
  }

  /* ── Enlazado de eventos ──────────────────────────────────── */

  function showProgress() {
    UI.setView('progress');
    UI.renderProgress(currentDate);
  }

  function showWeek() {
    UI.setView('week');
    renderWeekIfOpen();
  }

  function showNotes() {
    saveOpenNote();                      // por si se salió a mitad de una nota libre vacía
    noteEditing = null;                  // se entra siempre leyendo, no a medio editar
    UI.setView('notes');
    renderNotesIfOpen();
  }

  function renderNotesIfOpen() {
    if (UI.els.views.notes.hidden) return;
    // Con una nota antigua abierta no se repinta la lista por su cuenta:
    // guardar dispara un repintado, y reconstruir la lista te quitaría el
    // cursor a mitad de frase. Peor aún, al pulsar ✓ el campo pierde el foco
    // y se guarda justo antes del clic; si el repintado llega en medio, el
    // botón ya no existe y el clic se pierde. Solo repinta toggleNoteEdit().
    if (noteEditing) return;
    UI.renderNotes(currentDate, noteQuery, noteEditing);
  }

  /**
   * Guarda lo que haya abierto en Notas, sea una nota de un día o una libre
   * ('free:<id>'). Una nota libre que se cierra vacía se descarta: crearla
   * y arrepentirse no debe dejar una tarjeta "Sin título" en la lista.
   */
  function saveOpenNote() {
    if (!noteEditing) return;

    if (noteEditing.indexOf('free:') !== 0) {
      const campo = UI.els.notesList.querySelector('.note-entry__input');
      if (campo) S.setNote(campo.dataset.note, campo.value);
      return;
    }

    const id = noteEditing.slice(5);
    const titulo = UI.els.freeNotesList.querySelector('.free-note__title-input');
    const texto = UI.els.freeNotesList.querySelector('.free-note__input');
    if (titulo && texto) S.updateFreeNote(id, { title: titulo.value, text: texto.value });

    const nota = S.getFreeNote(id);
    if (nota && !nota.title && !nota.text.trim()) S.deleteFreeNote(id);
  }

  /** Abre una nota para editarla, o la cierra si ya estaba abierta. */
  function toggleNoteEdit(key) {
    noteEditing = noteEditing === key ? null : key;
    UI.renderNotes(currentDate, noteQuery, noteEditing);

    if (!noteEditing) return;

    // En una nota libre sin título se empieza por el título; si ya lo
    // tiene, por el texto, que es lo que se viene a cambiar.
    let campo = UI.els.notesList.querySelector('.note-entry__input');
    if (noteEditing.indexOf('free:') === 0) {
      const t = UI.els.freeNotesList.querySelector('.free-note__title-input');
      campo = t && !t.value ? t : UI.els.freeNotesList.querySelector('.free-note__input');
    }
    if (campo) {
      campo.focus();
      const fin = campo.value.length;
      campo.setSelectionRange(fin, fin);   // el cursor al final, para seguir escribiendo
    }
  }

  function stepWeek(delta) {
    weekAnchor = U.addDaysKey(weekAnchor, delta * 7);
    renderWeekIfOpen();
  }

  function stepPeriod(delta) {
    viewPeriod = calScale === 'year'
      ? new Date(viewPeriod.getFullYear() + delta, 0, 1)
      : new Date(viewPeriod.getFullYear(), viewPeriod.getMonth() + delta, 1);
    renderWeekIfOpen();
  }

  /** Cualquier celda del calendario lleva a ese día en la vista Hoy. */
  function onCalendarClick(e) {
    const cell = e.target.closest('[data-date]');
    if (!cell || cell.disabled) return;
    goToDate(cell.dataset.date);
    UI.setView('today');
    window.scrollTo(0, 0);
  }

  function bind() {
    const els = UI.els;
    const byId = function (id) { return document.getElementById(id); };

    // Navegación de secciones
    els.navItems.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.view === 'progress') showProgress();
        else if (btn.dataset.view === 'week') showWeek();
        else if (btn.dataset.view === 'notes') showNotes();
        else UI.setView(btn.dataset.view);
      });
    });
    els.levelBadge.addEventListener('click', showProgress);

    // La racha se explica sola al tocarla: un número suelto en la cabecera
    // invita a preguntar qué cuenta, y ahí no cabe la respuesta.
    els.streakChip.addEventListener('click', function () {
      UI.toast(UI.streakMessage(today), { icon: '◈' });
    });
    els.activityChip.addEventListener('click', function () {
      UI.toast(UI.streakMessage(today), { icon: '◈' });
    });

    // El aviso de nivel se quita al tocarlo o con Escape; no hay que esperar.
    els.levelUp.addEventListener('click', UI.hideLevelUp);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.levelUp.hidden) UI.hideLevelUp();
    });

    // Semana
    byId('prevWeek').addEventListener('click', function () { stepWeek(-1); });
    byId('nextWeek').addEventListener('click', function () { stepWeek(1); });
    els.btnThisWeek.addEventListener('click', function () {
      weekAnchor = today;
      renderWeekIfOpen();
    });
    els.weekGrid.addEventListener('click', onCalendarClick);

    // Navegación de días
    els.prevDay.addEventListener('click', function () { stepDay(-1); });
    els.nextDay.addEventListener('click', function () { stepDay(1); });
    els.btnToday.addEventListener('click', function () { goToDate(today); });

    // Selector de día
    els.btnPickDay.addEventListener('click', function () {
      // Se abre siempre por el mes del día que estés mirando, no por donde
      // lo dejaste la última vez.
      if (UI.toggleDayPicker()) openPickerAt(currentDate);
    });
    byId('dpPrev').addEventListener('click', function () { stepPickerMonth(-1); });
    byId('dpNext').addEventListener('click', function () { stepPickerMonth(1); });
    els.dpToday.addEventListener('click', function () {
      UI.toggleDayPicker(false);
      goToDate(today);
    });
    els.dpGrid.addEventListener('click', function (e) {
      const cell = e.target.closest('[data-date]');
      if (!cell || cell.disabled) return;
      UI.toggleDayPicker(false);
      goToDate(cell.dataset.date);
      window.scrollTo(0, 0);
    });

    // Cerrarlo: con Escape o pulsando fuera. Un desplegable que solo se
    // cierra con su propio botón se queda enganchado.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !UI.isDayPickerOpen()) return;
      UI.toggleDayPicker(false);
      els.btnPickDay.focus();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!UI.isDayPickerOpen()) return;
      if (e.target.closest('#dayPicker') || e.target.closest('#btnPickDay')) return;
      UI.toggleDayPicker(false);
    });

    // Tarjetas (delegación: un listener para toda la lista)
    els.habitList.addEventListener('click', onHabitListClick);

    // Mantener pulsado en + y −. La suelta se escucha en window y no en el
    // botón: así un puntero que se levanta fuera también para el intervalo.
    els.habitList.addEventListener('pointerdown', onStepperPointerDown);
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('pointercancel', stopHold);
    // Redes de seguridad: cambiar de pestaña o de ventana no debe dejar un
    // setInterval sumando de fondo.
    window.addEventListener('blur', stopHold);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopHold();
    });

    // El valor manual se guarda solo mientras escribes: no depende de que
    // pulses Enter ni de que salgas del campo.
    const commitAmount = U.debounce(applyAmount, 500);
    els.habitList.addEventListener('input', function (e) {
      if (e.target.dataset.action === 'amount') commitAmount(e.target);
    });
    els.habitList.addEventListener('change', function (e) {
      if (e.target.dataset.action === 'amount') applyAmount(e.target);
    });
    els.habitList.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.dataset.action === 'amount') e.target.blur();
    });

    // Extras del día
    els.btnFreeze.addEventListener('click', function () { UI.openDayModal(currentDate); });

    els.dayReasons.addEventListener('change', UI.syncDayNote);
    els.dayForm.addEventListener('submit', onDaySubmit);
    els.btnClearDay.addEventListener('click', clearDayMark);
    els.dayModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeDayModal();
    });
    els.dayModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeDayModal();
    });
    // Ánimo del día: tocar la cara elegida otra vez la quita.
    els.moodPicker.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-mood]');
      if (!btn) return;
      const v = Number(btn.dataset.mood);
      S.setMood(currentDate, S.getMood(currentDate) === v ? null : v);
    });

    const saveNote = U.debounce(function () { S.setNote(currentDate, els.dayNote.value); }, 400);
    els.dayNote.addEventListener('input', function () { UI.growField(els.dayNote); saveNote(); });
    els.dayNote.addEventListener('blur', function () { S.setNote(currentDate, els.dayNote.value); });

    // Peso. Mientras escribes solo se guarda si el número ya es válido: si
    // no, escribir "7" camino de "72" borraría el peso que hubiera.
    const saveWeight = function (avisar) {
      const raw = els.weightInput.value.trim();
      if (raw === '') { S.setWeight(currentDate, null); return; }

      const n = Number(raw.replace(',', '.'));
      if (!isFinite(n) || n < 20 || n > 400) {
        if (avisar) {
          UI.toast('Escribe el peso en kg, entre 20 y 400.', { type: 'error', icon: '⚠️' });
          const previo = S.getWeight(currentDate);
          els.weightInput.value = previo === null ? '' : previo;
        }
        return;
      }
      S.setWeight(currentDate, n);
    };
    const saveWeightSoon = U.debounce(function () { saveWeight(false); }, 600);
    els.weightInput.addEventListener('input', saveWeightSoon);
    els.weightInput.addEventListener('change', function () {
      saveWeightSoon.cancel();
      saveWeight(true);
    });
    els.weightInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') e.target.blur();
    });

    // Peso de un mes (2.7.5): se guarda como el día 1 de ese mes. Al elegir
    // el mes se dice qué hay ya en él, para no pisar nada sin saberlo.
    const mesElegido = function () {
      const v = els.weightMonthInput.value;
      return /^\d{4}-\d{2}$/.test(v) && v <= today.slice(0, 7) ? v : null;
    };
    const pistaMes = function () {
      const mes = mesElegido();
      if (!mes) {
        els.weightMonthHint.textContent = 'Elige un mes que ya haya pasado o el actual.';
        return;
      }
      const dia1 = S.getWeight(mes + '-01');
      const pesadas = Object.keys(S.getWeights()).filter(function (k) { return k.slice(0, 7) === mes; }).length;
      els.weightMonthKg.value = dia1 === null ? '' : String(dia1);
      els.weightMonthHint.textContent = dia1 !== null
        ? 'El día 1 ya tiene ' + String(dia1).replace('.', ',') + ' kg: si guardas, se sustituye.'
        : pesadas
          ? 'Ese mes ya tiene ' + pesadas + (pesadas === 1 ? ' pesada' : ' pesadas') + '. Esta se añade el día 1.'
          : 'Para los meses en que no te pesaste a diario. Se guarda como el día 1 de ese mes.';
    };
    els.weightMonthInput.addEventListener('change', pistaMes);
    els.btnWeightMonth.addEventListener('click', function () {
      const mes = mesElegido();
      if (!mes) { pistaMes(); return; }
      const raw = els.weightMonthKg.value.trim();
      const n = Number(raw.replace(',', '.'));
      if (!raw || !isFinite(n) || n < 20 || n > 400) {
        UI.toast('Escribe el peso en kg, entre 20 y 400.', { type: 'error', icon: '⚠️' });
        return;
      }
      const guardado = S.setWeight(mes + '-01', n);
      UI.toast('Guardado: ' + String(guardado).replace('.', ',') + ' kg el 1 de ' +
               U.formatMonth(U.fromKey(mes + '-01')).toLowerCase() + '.', { type: 'success', icon: '⚖️' });
      els.weightMonthKg.value = '';
      pistaMes();
    });

    UI.els.weightCard.addEventListener('change', function (e) {
      if (e.target.name !== 'weightRange') return;
      weightRange = Number(e.target.value) || 0;
      renderWeekIfOpen();
    });

    // Notas. El campo de arriba escribe siempre en hoy, se esté mirando el
    // día que se esté mirando: un diario se escribe en presente.
    const saveToday = U.debounce(function () { S.setNote(today, els.notesToday.value); }, 400);
    els.notesToday.addEventListener('input', function () { UI.growField(els.notesToday); saveToday(); });
    els.notesToday.addEventListener('blur', function () { S.setNote(today, els.notesToday.value); });

    els.notesSearch.addEventListener('input', U.debounce(function () {
      noteQuery = els.notesSearch.value;
      saveOpenNote();
      noteEditing = null;                // buscar cierra la edición: la lista cambia
      renderNotesIfOpen();
    }, 200));

    els.notesList.addEventListener('click', function (e) {
      const editar = e.target.closest('[data-edit]');
      if (editar) {
        // Si había otra abierta, se guarda antes de cambiar.
        saveOpenNote();
        toggleNoteEdit(editar.dataset.edit);
        return;
      }

      const btn = e.target.closest('[data-day]');
      if (!btn) return;
      goToDate(btn.dataset.day);
      UI.setView('today');
    });

    // Editar una nota antigua: se guarda mientras escribes y al salir del
    // campo. Vaciarla del todo la borra, igual que en el resto de la app.
    const saveOldNote = U.debounce(function (campo) {
      S.setNote(campo.dataset.note, campo.value);
    }, 400);
    els.notesList.addEventListener('input', function (e) {
      if (!e.target.classList.contains('note-entry__input')) return;
      UI.growField(e.target);
      saveOldNote(e.target);
    });
    els.notesList.addEventListener('focusout', function (e) {
      if (!e.target.classList.contains('note-entry__input')) return;
      saveOldNote.cancel();
      S.setNote(e.target.dataset.note, e.target.value);
    });
    els.notesList.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !e.target.classList.contains('note-entry__input')) return;
      S.setNote(e.target.dataset.note, e.target.value);
      toggleNoteEdit(e.target.dataset.note);
    });

    // Notas libres. Mismo trato que las del día: se guardan mientras
    // escribes y al salir del campo, y ✓ o Escape las cierran.
    els.btnAddFreeNote.addEventListener('click', function () {
      saveOpenNote();
      const nota = S.addFreeNote();
      if (!nota) {
        UI.toast('Has llegado al máximo de notas libres. Borra alguna para crear otra.',
                 { type: 'error', icon: '⚠️' });
        return;
      }
      // Una búsqueda activa podría esconder la nota recién creada.
      if (noteQuery) { noteQuery = ''; els.notesSearch.value = ''; }
      noteEditing = null;
      toggleNoteEdit('free:' + nota.id);
    });

    const saveFreeSoon = U.debounce(function (campo) {
      const patch = campo.classList.contains('free-note__title-input')
        ? { title: campo.value } : { text: campo.value };
      S.updateFreeNote(campo.dataset.free, patch);
    }, 400);

    // Los campos guardan un instante después de dejar de escribir. Recargar o
    // salir de la app justo entonces perdía lo último tecleado: al esconderse
    // o cerrarse, se guarda ya lo que estuviera esperando y se escribe.
    const fieldSaves = [commitAmount, saveNote, saveWeightSoon, saveToday, saveOldNote, saveFreeSoon];
    function flushFields() {
      fieldSaves.forEach(function (f) { f.flush(); });
      S.flush();
    }
    window.addEventListener('pagehide', flushFields);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flushFields();
    });

    els.freeNotesList.addEventListener('click', function (e) {
      const editar = e.target.closest('[data-free-edit]');
      if (editar) {
        saveFreeSoon.cancel();
        saveOpenNote();
        toggleNoteEdit('free:' + editar.dataset.freeEdit);
        return;
      }

      const borrar = e.target.closest('[data-free-delete]');
      if (!borrar) return;
      saveFreeSoon.cancel();
      const nota = S.getFreeNote(borrar.dataset.freeDelete);
      noteEditing = null;
      S.deleteFreeNote(borrar.dataset.freeDelete);
      UI.renderNotes(currentDate, noteQuery, null);
      if (nota && (nota.title || nota.text.trim())) {
        UI.toast('Nota eliminada.', {
          icon: '🗑️',
          action: { label: 'Deshacer', onClick: function () { S.restoreFreeNote(nota); } }
        });
      }
    });
    els.freeNotesList.addEventListener('input', function (e) {
      if (!e.target.dataset.free) return;
      if (e.target.tagName === 'TEXTAREA') UI.growField(e.target);
      saveFreeSoon(e.target);
    });
    els.freeNotesList.addEventListener('focusout', function (e) {
      if (!e.target.dataset.free) return;
      saveFreeSoon.cancel();
      const patch = e.target.tagName === 'TEXTAREA' ? { text: e.target.value } : { title: e.target.value };
      S.updateFreeNote(e.target.dataset.free, patch);
    });
    els.freeNotesList.addEventListener('keydown', function (e) {
      if (!e.target.dataset.free) return;
      // Enter en el título pasa al texto, como en cualquier editor de notas.
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        const texto = els.freeNotesList.querySelector('.free-note__input');
        if (texto) texto.focus();
        return;
      }
      if (e.key !== 'Escape') return;
      saveFreeSoon.cancel();
      const id = e.target.dataset.free;
      saveOpenNote();
      toggleNoteEdit('free:' + id);
    });

    // Plan de la semana
    els.btnPlanWeek.addEventListener('click', function () { showPlan(); });
    els.btnBackFromPlan.addEventListener('click', function () {
      if (planBack === 'week') showWeek();
      else if (planBack === 'notes') showNotes();
      else UI.setView(planBack === 'habit' ? 'today' : planBack);
      window.scrollTo(0, 0);
    });
    els.btnRecapPlan.addEventListener('click', function () { showPlan(0); });
    els.planNote.addEventListener('click', function () { showPlan(Number(els.planNote.dataset.week) || 0); });
    els.btnRecapClose.addEventListener('click', function () {
      S.dismissWeekSummary(els.weekRecap.dataset.week || S.weekKeyOf(today));
      els.weekRecap.hidden = true;
      UI.renderDayExtras(currentDate);      // ahora puede tocar el aviso de "sin planificar"
    });
    U.$$('input[name="planWeek"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        UI.setPlanOffset(Number(radio.value));
        UI.renderPlanView();
      });
    });
    els.planList.addEventListener('click', function (e) {
      const btn = e.target.closest('.plan-day');
      if (!btn || btn.disabled) return;
      UI.togglePlanDay(btn.closest('.plan-row').dataset.id, Number(btn.dataset.dow));
    });
    els.btnPlanReset.addEventListener('click', UI.resetPlanWeek);
    els.btnPlanConfirm.addEventListener('click', confirmPlan);
    els.btnPlanUnlock.addEventListener('click', unlockPlan);

    // Recompensas del Sistema: la dificultad de cada hábito, desde mañana.
    els.rewardList.addEventListener('change', function (e) {
      const id = e.target.dataset.reward;
      if (!id) return;
      const v = Number(e.target.value);
      const h = S.getHabit(id);
      if (!h || !S.setHabitXp(id, v)) return;
      const manana = St.habitXp(S.getHabit(id), U.addDaysKey(today, 1));
      UI.toast(manana === St.habitXp(h, today)
        ? h.name + ' sigue dando ' + manana + ' EXP.'
        : 'Desde mañana, ' + h.name + ' da ' + manana + ' EXP (' + St.tierName(manana) + ').',
        { icon: '⚖️' });
    });

    // Misiones
    els.missionSlots.addEventListener('change', function (e) {
      const tipo = e.target.dataset.missionType;
      if (tipo !== undefined) { UI.setMissionSlot(Number(tipo), e.target.value); return; }
      const meta = e.target.dataset.missionTarget;
      if (meta !== undefined) UI.setMissionTarget(Number(meta), e.target.value);
    });
    els.missionSlots.addEventListener('input', function (e) {
      const meta = e.target.dataset.missionTarget;
      // Mientras escribes solo se guarda si ya es un número: "" camino de "3" no.
      if (meta !== undefined && e.target.value !== '') UI.setMissionTarget(Number(meta), e.target.value);
    });
    els.btnMissionSuggest.addEventListener('click', UI.suggestMissionDraft);
    els.btnMissionAccept.addEventListener('click', acceptMissions);
    els.missionNote.addEventListener('click', function () { showPlan(0); });
    els.missionCard.addEventListener('click', function () { showPlan(0); });

    // Ausencias
    els.btnAddAbsence.addEventListener('click', UI.openAbsenceModal);
    els.absenceForm.addEventListener('submit', onAbsenceSubmit);
    els.absenceFrom.addEventListener('change', function () {
      // El final nunca antes del principio: se arrastra con él.
      if (els.absenceTo.value < els.absenceFrom.value) els.absenceTo.value = els.absenceFrom.value;
      els.absenceTo.min = els.absenceFrom.value;
      UI.syncAbsenceLength();
    });
    els.absenceTo.addEventListener('change', UI.syncAbsenceLength);
    els.absenceModal.addEventListener('click', function (e) {
      const todos = e.target.closest('[data-absence-all]');
      if (todos) { UI.setAbsenceAll(todos.dataset.absenceAll === '1'); return; }
      if (e.target.closest('[data-close]')) UI.closeAbsenceModal();
    });
    els.absenceModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeAbsenceModal();
    });
    els.absenceList.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-absence-cancel]');
      if (btn) cancelAbsence(btn.dataset.absenceCancel);
    });

    // Peso objetivo. Vacío lo quita; fuera de rango se avisa y no se toca.
    els.weightGoalInput.addEventListener('change', function () {
      const raw = els.weightGoalInput.value.trim();
      if (raw === '') { S.setSettings({ weightGoal: null }); return; }

      const n = Number(raw.replace(',', '.'));
      if (!isFinite(n) || n < 20 || n > 400) {
        UI.toast('Escribe el objetivo en kg, entre 20 y 400.', { type: 'error', icon: '⚠️' });
        const previo = S.getSettings().weightGoal;
        els.weightGoalInput.value = previo === null ? '' : previo;
        return;
      }
      S.setSettings({ weightGoal: n });
    });
    els.weightGoalInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') e.target.blur();
    });

    els.btnBackFromProgress.addEventListener('click', function () { UI.setView('today'); });

    // Alta de hábitos
    byId('btnAddHabit').addEventListener('click', function () { UI.openModal(null); });
    els.emptyToday.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-habit"]')) UI.openModal(null);
    });

    // Modal
    els.habitForm.addEventListener('submit', onFormSubmit);
    els.habitForm.addEventListener('change', function (e) {
      if (e.target.name === 'type' || e.target.name === 'entry' ||
          e.target.name === 'avoidMode') UI.syncTypeFields();
    });

    // Selector de emojis
    els.btnEmoji.addEventListener('click', function () { UI.toggleEmojiPicker(); });
    els.emojiPicker.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-emoji]');
      if (!btn) return;
      els.habitForm.elements.namedItem('icon').value = btn.dataset.emoji;
      UI.markSelectedEmoji(btn.dataset.emoji);
    });
    document.getElementById('fIcon').addEventListener('input', function (e) {
      UI.markSelectedEmoji(e.target.value.trim());
    });
    els.btnDeleteHabit.addEventListener('click', function () {
      confirmDelete(els.habitForm.dataset.editing);
    });
    els.habitModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeModal();
    });
    els.habitModal.addEventListener('keydown', onModalKeydown);

    // Objetivos a largo plazo (2.8.0)
    els.btnAddGoal.addEventListener('click', function () { UI.openGoalModal(null); });
    els.btnAddHabitGoal.addEventListener('click', function () { UI.openGoalModal(null, habitId); });
    [els.goalList, els.goalPastList, els.hGoalList].forEach(function (list) {
      list.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-goal-edit]');
        if (btn) UI.openGoalModal(S.getGoal(btn.dataset.goalEdit));
      });
    });
    els.goalForm.addEventListener('submit', onGoalSubmit);
    els.goalForm.addEventListener('input', UI.syncGoalForm);
    els.goalForm.addEventListener('change', UI.syncGoalForm);
    els.goalForm.addEventListener('click', function (e) {
      const b = e.target.closest('[data-goal-range]');
      if (b) UI.setGoalRange(b.dataset.goalRange);
    });
    els.btnDeleteGoal.addEventListener('click', function () {
      deleteGoal(els.goalForm.dataset.editing);
    });
    els.goalModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeGoalModal();
    });
    els.goalModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeGoalModal();
    });

    // Temporizador (2.8.0)
    els.btnTimerPause.addEventListener('click', toggleTimerPause);
    els.btnTimerFinish.addEventListener('click', finishTimer);
    els.btnTimerCancel.addEventListener('click', cancelTimer);
    // Arrancado o parado en otra ventana: se trae aquí.
    window.addEventListener('storage', function (e) {
      if (e.key !== TIMER_KEY) return;
      loadTimer();
      paintTimer();
    });
    // Al volver a la app, el reloj se pone al día al momento (y si llegó
    // a la meta con la pantalla apagada, se avisa ahora).
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { releaseWake(); return; }
      if (timer) tickTimer();
    });

    // Calendario general
    byId('prevPeriod').addEventListener('click', function () { stepPeriod(-1); });
    byId('nextPeriod').addEventListener('click', function () { stepPeriod(1); });
    els.heatmap.addEventListener('click', onCalendarClick);
    els.yearGrid.addEventListener('click', onCalendarClick);

    U.$$('input[name="calScale"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        calScale = radio.value;
        viewPeriod = calScale === 'year'
          ? new Date(viewPeriod.getFullYear(), 0, 1)
          : U.startOfMonth(U.fromKey(currentDate));
        renderWeekIfOpen();
      });
    });

    // Abrir la ficha desde la lista de rachas
    els.streakList.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-id]');
      if (btn) openHabit(btn.dataset.id);
    });

    // Ficha del hábito
    byId('btnBackFromHabit').addEventListener('click', closeHabit);
    byId('btnEditFromHabit').addEventListener('click', function () {
      const habit = S.getHabit(habitId);
      if (habit) UI.openModal(habit);
    });
    els.btnArchiveHabit.addEventListener('click', toggleArchive);
    els.btnPauseHabit.addEventListener('click', function () {
      const habit = S.getHabit(habitId);
      if (habit) UI.openPauseModal(habit);
    });
    els.btnResumeHabit.addEventListener('click', function () { resumeHabit(habitId); });

    els.pauseReasons.addEventListener('change', UI.syncPauseNote);
    els.pauseForm.addEventListener('submit', onPauseSubmit);
    els.pauseModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closePauseModal();
    });
    els.pauseModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closePauseModal();
    });

    els.pausedNote.addEventListener('click', function () {
      if (els.pausedNote.dataset.go === 'plan') showPlan();
      else UI.setView('settings');
    });
    byId('btnDeleteFromHabit').addEventListener('click', function () { confirmDelete(habitId); });
    els.habitHeatmap.addEventListener('click', onCalendarClick);

    byId('hPrevMonth').addEventListener('click', function () {
      habitMonth = new Date(habitMonth.getFullYear(), habitMonth.getMonth() - 1, 1);
      renderHabitIfOpen();
    });
    byId('hNextMonth').addEventListener('click', function () {
      habitMonth = new Date(habitMonth.getFullYear(), habitMonth.getMonth() + 1, 1);
      renderHabitIfOpen();
    });

    // Ajustes
    els.setStreakGoal.addEventListener('change', function () {
      S.setSettings({ streakGoal: els.setStreakGoal.value });
    });
    els.setAccent.addEventListener('input', function () {
      UI.applyAccent(els.setAccent.value);
    });
    els.setAccent.addEventListener('change', function () {
      S.setSettings({ accent: els.setAccent.value });
    });
    els.btnResetAccent.addEventListener('click', function () {
      S.setSettings({ accent: U.DEFAULT_ACCENT });
      UI.applyAccent(U.DEFAULT_ACCENT);
      UI.toast('Color predeterminado restaurado.', { type: 'success', icon: '✓' });
    });
    els.setEffects.addEventListener('click', function () {
      S.setSettings({ effects: !S.getSettings().effects });
    });
    els.setBlankPenalty.addEventListener('click', function () {
      const on = !S.getSettings().blankPenalty;
      S.setSettings({ blankPenalty: on });
      UI.toast(on ? 'Los días en blanco restan EXP a partir de hoy.'
                  : 'Los días en blanco ya no restan EXP. Lo ya restado se devuelve si rellenas el día.',
               { icon: on ? '⬜' : '✓' });
    });

    // Los ajustes de apariencia se aplican ya, sin esperar al repintado:
    // un cambio de aspecto que tarda en verse parece que no ha funcionado.
    els.setControls.addEventListener('change', function () {
      UI.applyControls(els.setControls.value);
      S.setSettings({ controls: els.setControls.value });
    });
    els.setTheme.addEventListener('change', function () {
      UI.applyTheme(els.setTheme.value);
      S.setSettings({ theme: els.setTheme.value });
      // El acento se aclara sobre oscuro y se oscurece sobre claro.
      UI.applyAccent(S.getSettings().accent);
    });
    els.setFontSize.addEventListener('change', function () {
      UI.applyFontSize(els.setFontSize.value);
      S.setSettings({ fontSize: els.setFontSize.value });
    });
    els.setBackup.addEventListener('change', function () {
      S.setSettings({ backupDays: Number(els.setBackup.value) });
    });

    const toggle = function (node, key) {
      node.addEventListener('click', function () {
        const patch = {};
        patch[key] = node.getAttribute('aria-checked') !== 'true';
        S.setSettings(patch);
      });
    };
    toggle(els.setHideDone, 'hideDone');
    toggle(els.setDayBar, 'showDayBar');
    toggle(els.setShowFreeze, 'showFreeze');
    toggle(els.setShowNotes, 'showNotes');
    toggle(els.setShowWeight, 'showWeight');
    toggle(els.setHideWeight, 'hideWeight');
    toggle(els.setHideAvoid, 'hideAvoid');
    toggle(els.setHideNotes, 'hideNotes');

    els.btnResetProgress.addEventListener('click', resetProgressOnly);

    els.archiveList.addEventListener('click', function (e) {
      const abrir = e.target.closest('[data-open]');
      if (abrir) { openHabit(abrir.dataset.open); return; }

      const reanudar = e.target.closest('[data-resume]');
      if (reanudar) { resumeHabit(reanudar.dataset.resume); return; }

      const btn = e.target.closest('[data-restore]');
      if (!btn) return;
      const habit = S.getHabit(btn.dataset.restore);
      S.setArchived(btn.dataset.restore, false);
      if (habit) UI.toast('"' + habit.name + '" restaurado.', { type: 'success', icon: '↩' });
    });

    els.btnBackupNow.addEventListener('click', shareBackup);
    byId('btnExportJson').addEventListener('click', exportJson);
    byId('btnExportCsv').addEventListener('click', exportCsv);
    byId('btnImport').addEventListener('click', importJson);
    byId('btnReset').addEventListener('click', resetAll);

    // Cambio de día tras suspender el equipo o dejar la pestaña de fondo
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshDate();
    });
    window.addEventListener('focus', refreshDate);

    // La gráfica se dibuja al ancho real, así que hay que rehacerla al redimensionar
    window.addEventListener('resize', U.debounce(function () {
      if (!UI.els.views.week.hidden) renderWeekIfOpen();
    }, 200));
  }

  /* ── Arranque ─────────────────────────────────────────────── */

  /**
   * En file:// el origen es "null" y pedir el manifest da un error de CORS que
   * asusta sin ser nada. Se enlaza solo cuando sirve de algo.
   */
  function linkManifest() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.json';
    document.head.appendChild(link);
  }

  /* ── Instalar desde la propia app ─────────────────────────
     Chrome para Android (hasta la 157) comprueba por DOMINIO si una app ya
     está instalada. Con varias apps en alexlobar.github.io, la primera que
     instalas bloquea el menú ⋮ → "Instalar app" para las demás.
     Hábitos fue la primera, así que hoy no le afecta; esto la cubre si un
     día se instala en otro orden (otro móvil, o reinstalando).
     El aviso `beforeinstallprompt` sí mira la carpeta: se guarda y se
     ofrece con un botón propio, que solo aparece cuando hay algo que
     instalar. Tiene que escucharse antes de enlazar el manifest. ───── */

  let installPrompt = null;

  function listenInstall() {
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();               // sin la mini-barra de Chrome: botón propio
      installPrompt = ev;
      UI.els.installRow.hidden = false;
    });

    UI.els.btnInstall.addEventListener('click', function () {
      if (!installPrompt) return;
      const ev = installPrompt;
      installPrompt = null;              // cada aviso solo se puede usar una vez
      UI.els.installRow.hidden = true;
      ev.prompt();
      if (ev.userChoice) ev.userChoice.catch(function () { /* cancelado */ });
    });

    window.addEventListener('appinstalled', function () {
      installPrompt = null;
      UI.els.installRow.hidden = true;
      UI.toast('App instalada. Ya la tienes en la pantalla de inicio.', { type: 'success', icon: '📲' });
      // Instalada, Chrome ya suele conceder la protección que antes negó.
      requestPersist();
    });
  }

  /* ── Datos protegidos ─────────────────────────────────────
     Sin esto el almacenamiento es "best-effort": el navegador puede
     borrarlo si le falta espacio y, en Safari, tras siete días sin abrir
     la web. persist() lo marca como persistente. Chrome lo concede sin
     preguntar si la app está instalada o se usa a menudo; Firefox pregunta
     una vez y recuerda la respuesta. No amplía el límite de 5 MB: protege
     lo que ya hay. Se pide en cada arranque mientras no esté concedido,
     porque las condiciones de Chrome cambian con el uso. ────────────── */
  function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return;

    navigator.storage.persisted()
      .then(function (yes) { return yes || navigator.storage.persist(); })
      .catch(function () { /* sin permiso para preguntar: se queda como esté */ })
      .then(function () { UI.renderPersist(); });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Un service worker necesita origen seguro: abierto con file:// no aplica.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

    // Si ya había un service worker al cargar, el relevo puede pillar la
    // página a medias: el anterior sirve de su caché lo que ya ha pedido y
    // el nuevo borra esa caché, así que lo que falte se baja de la red ya
    // actualizado. Resultado: index.html de una versión y .js de otra, y la
    // app pintada sin manejadores. Recargar una vez al cambiar de dueño
    // deja el conjunto coherente.
    if (navigator.serviceWorker.controller) {
      let recargando = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (recargando) return;      // el evento puede llegar más de una vez
        recargando = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker no registrado:', err);
    });
  }

  /**
   * Si el arranque falla, una pantalla muerta parece pérdida de datos. Mejor
   * decir qué ha pasado, dejar claro que el almacén no se ha tocado y dar el
   * error listo para copiar.
   */
  function showStartupError(err) {
    const main = document.getElementById('main') || document.body;
    main.textContent = '';

    const box = document.createElement('div');
    box.className = 'fatal';

    const title = document.createElement('h1');
    title.className = 'fatal__title';
    title.textContent = 'La app no ha podido arrancar';

    const text = document.createElement('p');
    text.className = 'fatal__text';
    text.textContent = 'Tus hábitos siguen guardados: este fallo ocurre antes de ' +
                       'escribir nada. No borres los datos del navegador.';

    const pre = document.createElement('pre');
    pre.className = 'fatal__detail';
    pre.textContent = (err && (err.stack || err.message)) || String(err);

    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(pre);
    main.appendChild(box);
  }

  /**
   * Avisa si el navegador ha mezclado versiones: un index.html de una y unos
   * .js de otra. Pasa al actualizar, porque el service worker sirve de su
   * caché lo que ya tiene y pide a la red lo que le falta, y el resultado
   * puede ser mitad y mitad.
   *
   * Antes eso dejaba la app pintada y muerta, sin decir nada. Ahora lo dice,
   * y con el arranque tolerante de UI.init() además sigue funcionando.
   */
  function checkBuildMatch() {
    const html = document.documentElement.dataset.build || null;
    const faltan = UI.getMissingIds();

    if (html === U.version && !faltan.length) return;

    console.error('Versiones descuadradas · index.html:', html, '· js:', U.version,
                  '· elementos que faltan:', faltan);

    UI.toast('El navegador ha mezclado versiones (' + (html || 'desconocida') +
             ' y ' + U.version + '). Recarga forzando: Ctrl + Mayús + R.',
             { type: 'error', icon: '⚠️', duration: 12000 });
  }

  function boot() {
    UI.init();
    S.load();
    S.subscribe(onStoreEvent);

    // El registro de ascensos nace aquí, no en el almacén: quien ya tenía
    // nivel antes de la 1.6.3 empieza a contar desde él, y así la primera
    // subida no rellena de golpe fechas que nunca se guardaron.
    const nivel = St.levelInfo(S.getGame().points).level;
    S.initLevelLogFrom(nivel);

    // Si el nivel que da la EXP va por delante del registro —la curva se
    // abarató en la 2.5.0 y la misma EXP vale más niveles—, los que faltan
    // se apuntan con fecha de hoy, una sola vez y sin una celebración por
    // cada uno. En un arranque normal no hay nada que apuntar.
    const saltados = S.recordLevelUp(nivel, today);

    UI.applyAccent(S.getSettings().accent);
    renderAll();
    bind();
    loadTimer();
    if (timer) tickTimer();

    syncProgressState();
    syncEconomy();
    scheduleMidnight();
    listenInstall();                     // antes del manifest: si no, el aviso puede perderse
    linkManifest();
    registerServiceWorker();
    requestPersist();

    const err = S.getLastError();
    if (err && err.type === 'corrupt') {
      UI.toast('Había datos dañados: se empezó de cero y se guardó una copia del original.',
               { type: 'error', icon: '⚠️' });
    } else if (err && err.type === 'unavailable') {
      UI.toast('El navegador bloquea el almacenamiento: los cambios no se guardarán.',
               { type: 'error', icon: '⚠️' });
    } else if (err && err.type === 'outdated') {
      UI.toast('Tus datos son de una versión más nueva de la app. Esta no guardará ' +
               'nada hasta que la cierres del todo y la vuelvas a abrir.',
               { type: 'error', icon: '⚠️', duration: 12000 });
    } else {
      // Solo si no hay ya un aviso más urgente en pantalla.
      checkBackupReminder();
    }

    if (saltados.length) {
      UI.toast('Curva de niveles nueva: tu EXP vale más y subes al nivel ' + nivel +
               ' (+' + saltados.length + '). Quedan apuntados en tus ascensos.',
               { type: 'achievement', icon: '⬆️', duration: 9000 });
    }

    checkYesterdayMark();

    // El último, porque es el que hay que ver aunque haya salido otro.
    checkBuildMatch();

    openShortcut();
  }

  /* ── Atajos del icono (2.6.0) ─────────────────────────────
     Mantener pulsado el icono de la app instalada ofrece los atajos del
     manifest. Cada uno abre index.html?go=… y aquí se lleva a su sitio.
     Con lo que apunta oculto en Privacidad, se queda en Hoy sin más. ── */
  function openShortcut() {
    let go = null;
    try { go = new URLSearchParams(location.search).get('go'); } catch (e) { return; }
    if (!go) return;

    // Que recargar no repita el atajo.
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* da igual */ }

    const s = S.getSettings();
    if (go === 'plan') { showPlan(); return; }

    if (go === 'nota' && !s.hideNotes) {
      showNotes();
      focusSoon(UI.els.notesToday);
      return;
    }

    UI.setView('today');
    if (go === 'peso' && s.showWeight && !s.hideWeight) {
      focusSoon(UI.els.weightInput);
    } else if (go === 'fallo' && !s.hideAvoid) {
      // La primera tarjeta de un hábito a evitar que toque hoy.
      const card = U.$$('.habit-card', UI.els.habitList).filter(function (c) {
        const h = S.getHabit(c.dataset.id);
        return h && St.isAvoid(h);
      })[0];
      // Salto directo y no suave: el suave depende de que la pantalla se
      // esté pintando, y al abrir desde el icono a veces aún no.
      if (card) setTimeout(function () { card.scrollIntoView({ block: 'center' }); }, 150);
    }
  }

  function focusSoon(node) {
    setTimeout(function () {
      node.scrollIntoView({ block: 'center' });
      try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
    }, 150);
  }

  function start() {
    try {
      boot();
    } catch (err) {
      console.error('Fallo al arrancar:', err);
      showStartupError(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
