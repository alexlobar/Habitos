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
  let reminderTimers = [];

  /* ── Repintado coalescido ─────────────────────────────────
     Un solo clic puede disparar varios eventos del store
     (log + puntos + logro). Se acumulan y se pinta una vez por
     frame, y solo la parte afectada. ───────────────────────── */

  const dirty = {
    all: false, header: false, progress: false, week: false, workout: false,
    extras: false, habit: false, cards: {}
  };
  let frame = null;

  function scheduleFlush() {
    if (frame !== null) return;
    frame = requestAnimationFrame(flush);
  }

  function flush() {
    frame = null;

    if (dirty.all) {
      renderAll();
    } else {
      Object.keys(dirty.cards).forEach(function (id) { UI.updateCard(id, currentDate); });
      if (dirty.header) UI.renderHeader(currentDate, today);
      if (dirty.extras) UI.renderDayExtras(currentDate);
      // Semana, progreso y ficha son caros: solo se recalculan si están a la vista.
      if (dirty.week) renderWeekIfOpen();
      if (dirty.workout) renderExercisesIfOpen();
      if (dirty.progress && !UI.els.views.progress.hidden) UI.renderProgress(currentDate);
      if (dirty.habit) renderHabitIfOpen();
    }

    dirty.all = false;
    dirty.header = false;
    dirty.progress = false;
    dirty.week = false;
    dirty.workout = false;
    dirty.extras = false;
    dirty.habit = false;
    dirty.cards = {};
  }

  function renderAll() {
    UI.renderHeader(currentDate, today);
    UI.renderHabitList(currentDate);
    UI.renderDayExtras(currentDate);
    UI.renderSettings();
    renderWeekIfOpen();
    renderExercisesIfOpen();
    if (!UI.els.views.progress.hidden) UI.renderProgress(currentDate);
    renderHabitIfOpen();
  }

  function renderExercisesIfOpen() {
    if (UI.els.views.exercises.hidden) return;
    UI.renderExercises(currentDate, S.routineForDate(currentDate), currentDate === today);
    if (!UI.els.workoutManager.hidden) UI.renderRoutineTable();
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
  }

  function renderHabitIfOpen() {
    if (UI.els.views.habit.hidden || !habitId) return;

    const habit = S.getHabit(habitId);
    if (!habit) { closeHabit(); return; }        // lo han borrado desde el modal
    UI.renderHabitView(habit, habitMonth, today);
  }

  function onStoreEvent(event, payload) {
    switch (event) {
      case 'log:change':
        dirty.cards[payload.habitId] = true;
        dirty.header = true;
        dirty.progress = true;
        dirty.week = true;
        dirty.extras = true;
        dirty.habit = true;
        break;
      case 'note:change':
        dirty.extras = true;
        dirty.progress = true;
        break;
      case 'session:change':
      case 'workout:change':
        dirty.workout = true;
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
      default:
        // habit:*, settings, freeze y reemplazos tocan demasiadas cosas.
        dirty.all = true;
    }
    scheduleFlush();
  }

  /* ── XP, niveles y logros ─────────────────────────────────
     La XP se otorga y se retira de forma simétrica: si desmarcas
     un hábito o quitas una serie, la pierdes. Así el total nunca
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
     valor de la tabla — por ejemplo grantXp(St.XP.goal) al cumplir un
     objetivo, cuando esa acción exista. */
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
    if (afterDone !== beforeDone) delta += (afterDone ? 1 : -1) * St.POINTS_PER_HABIT;
    if (delta) grantXp(delta);

    const effects = S.getSettings().effects;

    if (afterDone && !beforeDone) {
      UI.pulse(habit.id);
      if (effects) UI.buzz(25);

      const streak = St.currentStreak(habit, today);
      if (streak >= 3) {
        UI.toast('¡' + streak + ' días seguidos con ' + habit.name + '!',
                 { type: 'success', icon: '🔥' });
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

    const pagado = S.getGame().avoidXpPaid;
    if (debido <= pagado) return;

    // Se apunta antes de pagar: si algo fallase, se cobra de menos y no de más.
    S.setAvoidXpPaid(debido);
    grantXp(debido - pagado);

    S.getHabits().filter(St.isAvoid).forEach(function (h) {
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

    St.earnedAchievements(today).forEach(function (id) {
      if (S.unlockAchievement(id)) {
        const ach = St.achievementById(id);
        UI.toast('Logro desbloqueado: ' + ach.name, { type: 'achievement', icon: ach.icon });
      }
    });
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

    withScoring(habit, currentDate, function () {
      S.setLog(habit.id, currentDate, input.value === '' ? null : value);
    });
  }

  /* ── Ejercicios ───────────────────────────────────────────── */

  /** Foto del avance del entreno de un día, para comparar antes/después. */
  function workoutSnapshot(dateKey) {
    const exercises = S.getExercises(S.routineForDate(dateKey));
    const summary = St.sessionSummary(dateKey, exercises);
    const session = S.getSession(dateKey);

    return {
      complete: summary.complete,
      bonus: St.exerciseBonus(dateKey, exercises),
      done: !!(session && session.done)
    };
  }

  /**
   * Misma contabilidad que withScoring(), pero para el entreno: compara el
   * estado antes y después de la acción y paga solo la diferencia. Un
   * ejercicio ya completado no vuelve a dar XP por añadirle otra serie, y
   * quitar la serie que lo completó devuelve exactamente lo que dio.
   */
  function withWorkoutScoring(dateKey, mutate) {
    const before = workoutSnapshot(dateKey);
    mutate();
    const after = workoutSnapshot(dateKey);

    let delta = (after.complete - before.complete) * St.XP.exercise;
    delta += after.bonus - before.bonus;
    if (after.done !== before.done) delta += (after.done ? 1 : -1) * St.XP.workout;

    if (delta) grantXp(delta);
    return after;
  }

  function showExercises() {
    UI.setView('exercises');
    renderExercisesIfOpen();
  }

  function onExerciseListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const row = btn.closest('.exercise');
    if (!row) return;

    const exerciseId = row.dataset.id;

    if (btn.dataset.action === 'remove-set') {
      withWorkoutScoring(currentDate, function () {
        S.removeSet(currentDate, exerciseId, Number(btn.dataset.index));
      });
      return;
    }

    if (btn.dataset.action === 'add-set') {
      const input = row.querySelector('[data-action="set-value"]');
      const value = Math.floor(Number(input && input.value));

      if (!isFinite(value) || value <= 0) {
        UI.toast('Escribe cuántas repeticiones o segundos has hecho.', { type: 'error', icon: '⚠️' });
        return;
      }

      let added = null;
      withWorkoutScoring(currentDate, function () {
        added = S.addSet(currentDate, exerciseId, value);
      });

      if (!added) {
        UI.toast('No se pudo añadir la serie.', { type: 'error', icon: '⚠️' });
        return;
      }

      const exercise = S.getExercise(exerciseId);
      if (S.getSettings().effects) UI.buzz(20);

      if (exercise && St.exerciseDone(exercise, S.getSets(currentDate, exerciseId))) {
        UI.toast(exercise.name + ' completado.', { type: 'success', icon: '✓' });
      }
    }
  }

  /**
   * Cerrar el entreno marca el hábito enlazado, así que pasa por el mismo
   * reparto de puntos que cualquier otro hábito: una sola contabilidad.
   */
  function toggleSession() {
    const session = S.getSession(currentDate);
    const wasDone = !!(session && session.done);
    const routineId = S.routineForDate(currentDate);
    const summary = St.sessionSummary(currentDate, S.getExercises(routineId));

    if (!wasDone && !summary.sets) {
      UI.toast('Apunta al menos una serie antes de cerrar el entreno.', { type: 'error', icon: '⚠️' });
      return;
    }

    const linked = S.getWorkout().linkedHabitId;
    const habit = linked && S.getHabit(linked);

    // Cerrar el entreno da su XP propia; el hábito enlazado sigue pasando
    // por withScoring(), así que cada cosa se cobra una sola vez.
    withWorkoutScoring(currentDate, function () {
      if (!wasDone && !S.getSession(currentDate)) S.setSessionRoutine(currentDate, routineId);

      S.setSessionDone(currentDate, !wasDone);

      if (habit) {
        withScoring(habit, currentDate, function () {
          S.setLog(habit.id, currentDate, wasDone ? null : true);
        });
      }
    });

    if (wasDone) {
      UI.toast('Entreno reabierto.');
    } else {
      UI.toast('Entreno cerrado: ' + summary.sets + ' series.', { type: 'success', icon: '💪' });
      if (!habit && S.getSettings().effects) UI.celebrate();
    }
  }

  function onRoutineTableClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.dataset.action === 'edit-exercise') {
      const exercise = S.getExercise(id);
      if (exercise) UI.openExerciseModal(exercise);
      return;
    }

    if (btn.dataset.action === 'rename-routine') {
      const routine = S.getRoutine(id);
      if (!routine) return;
      const name = window.prompt('Nuevo nombre de la rutina:', routine.name);
      if (name && name.trim()) S.renameRoutine(id, name);
      return;
    }

    if (btn.dataset.action === 'delete-routine') {
      const routine = S.getRoutine(id);
      if (!routine) return;

      const count = S.getExercises(id).length;
      const warning = count
        ? '¿Eliminar la rutina "' + routine.name + '" y sus ' + count + ' ejercicios? Se perderá su histórico de series.'
        : '¿Eliminar la rutina "' + routine.name + '"?';

      if (!window.confirm(warning)) return;
      S.deleteRoutine(id);
      UI.toast('Rutina eliminada.', { icon: '🗑️' });
    }
  }

  function onExerciseFormSubmit(e) {
    e.preventDefault();
    const data = UI.readExerciseForm();
    if (!data) return;

    const editing = UI.els.exerciseForm.dataset.editing;

    if (editing) {
      // Cambiar el número de series puede dar por completado (o no) un
      // ejercicio del día: pasa por la misma contabilidad que las series.
      withWorkoutScoring(currentDate, function () {
        S.updateExercise(editing, data);
      });
      UI.toast('Ejercicio actualizado.', { type: 'success', icon: '✓' });
    } else if (S.addExercise(data)) {
      UI.toast('Ejercicio añadido.', { type: 'success', icon: '✓' });
    } else {
      UI.toast('Necesitas una rutina antes de añadir ejercicios.', { type: 'error', icon: '⚠️' });
      return;
    }

    UI.closeExerciseModal();
  }

  function onDeleteExercise() {
    const id = UI.els.exerciseForm.dataset.editing;
    const exercise = S.getExercise(id);
    if (!exercise) return;

    if (!window.confirm('¿Eliminar "' + exercise.name + '"? Se borrarán también sus series registradas.')) return;

    S.deleteExercise(id);
    UI.closeExerciseModal();
    UI.toast('Ejercicio eliminado.', { icon: '🗑️' });
  }

  function newRoutine() {
    const name = window.prompt('Nombre de la rutina nueva:', '');
    if (!name || !name.trim()) return;
    S.addRoutine(name);
    UI.toast('Rutina creada. Se alterna al final de la rotación.', { type: 'success', icon: '✓' });
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

  /* ── Comodines de racha ───────────────────────────────────── */

  function toggleFreeze() {
    if (S.isFrozen(currentDate)) {
      S.unfreezeDay(currentDate);
      UI.toast('Día descongelado. Recuperas el comodín.');
    } else if (S.freezeDay(currentDate)) {
      UI.toast('Día congelado: no romperá ninguna racha.', { type: 'success', icon: '🧊' });
    } else {
      UI.toast('No te quedan comodines. Recuperas uno cada mes.', { type: 'error', icon: '⚠️' });
      return;
    }
    syncProgressState();
  }

  /* ── Modal de hábito ──────────────────────────────────────── */

  function onFormSubmit(e) {
    e.preventDefault();
    const data = UI.readForm();
    if (!data) return;

    const editingId = UI.els.habitForm.dataset.editing;

    if (editingId) {
      const previous = S.getHabit(editingId);
      S.updateHabit(editingId, data);
      UI.toast(
        previous && previous.type !== data.type
          ? 'Hábito actualizado. Su histórico se ha reiniciado por el cambio de tipo.'
          : 'Hábito actualizado.',
        { type: 'success', icon: '✓' }
      );
    } else {
      S.addHabit(data);
      UI.toast('Hábito creado.', { type: 'success', icon: '✓' });
    }

    UI.closeModal();
    scheduleReminders();
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
    scheduleReminders();

    UI.toast('"' + habit.name + '" eliminado.', {
      icon: '🗑️',
      action: {
        label: 'Deshacer',
        onClick: function () {
          if (S.restoreHabit(snapshot)) {
            scheduleReminders();
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

  /* ── Recordatorios ────────────────────────────────────────
     Sin service worker no hay notificaciones con la pestaña
     cerrada: se programan timers para los avisos que quedan
     hoy y se reprograman al cambiar de día. ───────────────── */

  function clearReminders() {
    reminderTimers.forEach(clearTimeout);
    reminderTimers = [];
  }

  function scheduleReminders() {
    clearReminders();

    if (!S.getSettings().notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();

    S.getHabitsForDate(today).forEach(function (habit) {
      if (!habit.reminder.enabled) return;

      const parts = habit.reminder.time.split(':');
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                            Number(parts[0]), Number(parts[1]), 0, 0);
      const delay = when - now;
      if (delay <= 0) return;

      reminderTimers.push(setTimeout(function () {
        // Si para entonces ya está hecho, no molestamos.
        if (St.isComplete(habit, S.getLog(habit.id, U.todayKey()))) return;
        try {
          new Notification(habit.icon + '  ' + habit.name, {
            body: 'Aún no lo has marcado hoy.',
            tag: 'habit-' + habit.id
          });
        } catch (err) {
          console.warn('No se pudo notificar:', err);
        }
      }, delay));
    });
  }

  function toggleNotifications() {
    if (S.getSettings().notificationsEnabled) {
      S.setSettings({ notificationsEnabled: false });
      clearReminders();
      UI.toast('Recordatorios desactivados.');
      return;
    }

    if (!('Notification' in window)) {
      UI.toast('Este navegador no admite notificaciones.', { type: 'error', icon: '⚠️' });
      return;
    }

    Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') {
        UI.renderSettings();
        UI.toast('Permiso denegado. Actívalo en los ajustes del navegador.',
                 { type: 'error', icon: '⚠️' });
        return;
      }
      S.setSettings({ notificationsEnabled: true });
      scheduleReminders();
      UI.toast('Recordatorios activados.', { type: 'success', icon: '🔔' });
    });
  }

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
    UI.toast('Copia exportada en JSON.', { type: 'success', icon: '↓' });
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
      ? 'Llevas ' + U.daysBetween(last, today) + ' días sin exportar una copia.'
      : 'Aún no has exportado ninguna copia de tus datos.', {
      icon: '💾',
      action: { label: 'Exportar', onClick: exportJson }
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
    input.accept = 'application/json,.json';

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
        scheduleReminders();
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
    scheduleReminders();
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
    scheduleFlush();
    scheduleReminders();
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
        else if (btn.dataset.view === 'exercises') showExercises();
        else UI.setView(btn.dataset.view);
      });
    });
    els.levelBadge.addEventListener('click', showProgress);

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

    // Ejercicios
    els.exerciseList.addEventListener('click', onExerciseListClick);
    els.exerciseList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.dataset.action !== 'set-value') return;
      e.preventDefault();
      const add = e.target.closest('.exercise').querySelector('[data-action="add-set"]');
      if (add) add.click();
    });
    els.routinePick.addEventListener('change', function () {
      S.setSessionRoutine(currentDate, els.routinePick.value);
    });
    els.btnFinishSession.addEventListener('click', toggleSession);
    els.btnManageWorkout.addEventListener('click', function () { UI.toggleWorkoutManager(); });
    els.routineTable.addEventListener('click', onRoutineTableClick);
    byId('btnNewExercise').addEventListener('click', function () { UI.openExerciseModal(null); });
    byId('btnNewRoutine').addEventListener('click', newRoutine);

    els.exerciseForm.addEventListener('submit', onExerciseFormSubmit);
    els.btnDeleteExercise.addEventListener('click', onDeleteExercise);
    els.exerciseModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeExerciseModal();
    });
    els.exerciseModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeExerciseModal();
    });

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
    els.btnFreeze.addEventListener('click', toggleFreeze);
    const saveNote = U.debounce(function () { S.setNote(currentDate, els.dayNote.value); }, 400);
    els.dayNote.addEventListener('input', saveNote);
    els.dayNote.addEventListener('blur', function () { S.setNote(currentDate, els.dayNote.value); });

    // Alta de hábitos
    byId('btnAddHabit').addEventListener('click', function () { UI.openModal(null); });
    els.emptyToday.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-habit"]')) UI.openModal(null);
    });

    // Modal
    els.habitForm.addEventListener('submit', onFormSubmit);
    els.habitForm.addEventListener('change', function (e) {
      if (e.target.name === 'type' || e.target.name === 'entry') UI.syncTypeFields();
    });
    els.fReminderSwitch.addEventListener('click', function () {
      UI.setReminder(!UI.isReminderOn());
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
    els.setStartWeek.addEventListener('change', function () {
      S.setSettings({ weekStart: Number(els.setStartWeek.value) });
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
    els.setNotifications.addEventListener('click', toggleNotifications);
    els.setEffects.addEventListener('click', function () {
      S.setSettings({ effects: !S.getSettings().effects });
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

    els.btnResetProgress.addEventListener('click', resetProgressOnly);

    els.archiveList.addEventListener('click', function (e) {
      const abrir = e.target.closest('[data-open]');
      if (abrir) { openHabit(abrir.dataset.open); return; }

      const btn = e.target.closest('[data-restore]');
      if (!btn) return;
      const habit = S.getHabit(btn.dataset.restore);
      S.setArchived(btn.dataset.restore, false);
      if (habit) UI.toast('"' + habit.name + '" restaurado.', { type: 'success', icon: '↩' });
    });

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

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Un service worker necesita origen seguro: abierto con file:// no aplica.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

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

  function boot() {
    UI.init();
    S.load();
    S.subscribe(onStoreEvent);

    // El registro de ascensos nace aquí, no en el almacén: quien ya tenía
    // nivel antes de la 1.6.3 empieza a contar desde él, y así la primera
    // subida no rellena de golpe fechas que nunca se guardaron.
    S.initLevelLogFrom(St.levelInfo(S.getGame().points).level);

    UI.applyAccent(S.getSettings().accent);
    renderAll();
    bind();

    syncProgressState();
    scheduleReminders();
    scheduleMidnight();
    linkManifest();
    registerServiceWorker();

    const err = S.getLastError();
    if (err && err.type === 'corrupt') {
      UI.toast('Había datos dañados: se empezó de cero y se guardó una copia del original.',
               { type: 'error', icon: '⚠️' });
    } else if (err && err.type === 'unavailable') {
      UI.toast('El navegador bloquea el almacenamiento: los cambios no se guardarán.',
               { type: 'error', icon: '⚠️' });
    } else {
      // Solo si no hay ya un aviso más urgente en pantalla.
      checkBackupReminder();
    }
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
