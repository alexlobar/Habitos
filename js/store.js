/* ============================================================
   store.js — Persistencia y CRUD. Única capa que habla con
   localStorage. No toca el DOM: notifica cambios por suscripción.
   ============================================================ */
window.HT = window.HT || {};

HT.store = (function () {
  'use strict';

  const U = HT.utils;

  const KEY = 'habitTracker.v1';
  const BACKUP_KEY = 'habitTracker.corrupt-backup';
  const VERSION = 3;
  const SLOTS = ['morning', 'afternoon', 'night'];
  const MAX_NAME = 40;
  const MAX_NOTE = 500;
  const MAX_FREEZES = 3;
  const MAX_SETS = 20;

  let state = null;
  let listeners = [];
  let lastError = null;      // lo consulta la UI tras arrancar
  let writable = true;       // false en modo incógnito con cuota bloqueada

  /* ── Estado inicial ───────────────────────────────────────── */

  function mkHabit(data, today) {
    return {
      id: U.uid('h'),
      name: data.name,
      icon: data.icon || '✨',
      color: data.color || U.DEFAULT_ACCENT,
      type: data.type,
      target: data.target || null,
      slots: data.slots || null,
      activeDays: data.activeDays || [0, 1, 2, 3, 4, 5, 6],
      reminder: data.reminder || { enabled: false, time: '08:00' },
      createdAt: today,
      archived: false
    };
  }

  /**
   * Tabla de calistenia de partida, en cuatro rutinas que se van
   * alternando. Solo se usa la primera vez: después manda lo guardado.
   */
  function seedWorkout() {
    const plan = [
      ['Empuje', [
        ['Flexiones', 'reps', 4, 12],
        ['Fondos en paralelas', 'reps', 3, 10],
        ['Flexiones pica', 'reps', 3, 8],
        ['Flexiones diamante', 'reps', 3, 10]
      ]],
      ['Tirón', [
        ['Dominadas', 'reps', 4, 6],
        ['Dominadas supinas', 'reps', 3, 6],
        ['Remo invertido', 'reps', 3, 12],
        ['Encogimiento escapular', 'reps', 3, 10]
      ]],
      ['Piernas', [
        ['Sentadillas', 'reps', 4, 20],
        ['Zancadas', 'reps', 3, 12],
        ['Sentadilla búlgara', 'reps', 3, 10],
        ['Puente de glúteo', 'reps', 3, 15],
        ['Elevación de gemelos', 'reps', 3, 20]
      ]],
      ['Core', [
        ['Plancha', 'time', 3, 45],
        ['Elevación de piernas', 'reps', 3, 12],
        ['Plancha lateral', 'time', 3, 30],
        ['Hollow hold', 'time', 3, 30]
      ]]
    ];

    const routines = [];
    const exercises = [];

    plan.forEach(function (entry) {
      const routine = { id: U.uid('r'), name: entry[0] };
      routines.push(routine);

      entry[1].forEach(function (ex) {
        exercises.push({
          id: U.uid('e'),
          name: ex[0],
          routineId: routine.id,
          kind: ex[1],
          sets: ex[2],
          target: ex[3],
          archived: false
        });
      });
    });

    return { routines: routines, exercises: exercises };
  }

  function defaultState() {
    const today = U.todayKey();
    const habits = [
      // El total de pasos se escribe a mano (entry: 'manual'): nadie va a
      // pulsar "+" mil veces, el dato lo da el móvil de una pieza.
      mkHabit({ name: '10k pasos', icon: '🚶', color: '#3ddc97',
                type: 'quantity',
                target: { amount: 10000, unit: 'pasos', step: 1000, entry: 'manual' } }, today),
      mkHabit({ name: 'Estiramientos', icon: '🤸', color: '#22d3ee',
                type: 'check' }, today),
      mkHabit({ name: 'Lectura', icon: '📖', color: '#e879f9',
                type: 'quantity', target: { amount: 10, unit: 'páginas', step: 1 } }, today),
      mkHabit({ name: 'Japonés', icon: '🗾', color: '#fb7185',
                type: 'check' }, today),
      mkHabit({ name: 'Ajedrez', icon: '♟️', color: '#a78bfa',
                type: 'check' }, today),
      mkHabit({ name: 'Meditar', icon: '🧘', color: '#38bdf8',
                type: 'check' }, today),
      // Una sola franja: sigue siendo una casilla, pero la tarjeta dice
      // "Noche" en lugar de un check mudo.
      mkHabit({ name: 'Planificar el día', icon: '🗒️', color: '#ffb454',
                type: 'schedule', slots: ['night'] }, today),
      // El único que no es diario: 0 = domingo, sea cual sea el inicio de semana.
      mkHabit({ name: 'Planificar la semana', icon: '📅', color: '#f59e0b',
                type: 'check', activeDays: [0] }, today),
      // Se nombra por lo que evitas, no por el objetivo: la tarjeta dice
      // "He caído", y "he caído en Sin pantallas" no se entiende.
      mkHabit({ name: 'Pantallas antes de dormir', icon: '📵', color: '#94a3b8',
                type: 'avoid' }, today),
      mkHabit({ name: 'Dormir 7-9 horas', icon: '😴', color: '#818cf8',
                type: 'check' }, today)
    ];

    const training = mkHabit({ name: 'Entrenar', icon: '💪', color: '#f472b6', type: 'check' }, today);
    habits.push(training);

    const seed = seedWorkout();

    return {
      version: VERSION,
      settings: { weekStart: 1, accent: U.DEFAULT_ACCENT, notificationsEnabled: false, effects: true },
      habits: habits,
      logs: {},
      notes: {},
      frozen: {},
      routines: seed.routines,
      exercises: seed.exercises,
      sessions: {},
      workout: { lastRoutineId: null, linkedHabitId: training.id },
      game: {
        // Arranca a 0 a propósito: el logro "Coleccionista" premia crear
        // hábitos, y los de partida los regala la app, no los creas tú.
        points: 0, achievements: [], bestStreak: 0, habitsCreated: 0,
        avoidXpPaid: 0,
        freezes: 1, freezeMonth: today.slice(0, 7)
      }
    };
  }

  /* ── Saneado ──────────────────────────────────────────────
     Los datos vienen de localStorage: son entrada externa y
     pueden estar corruptos o editados a mano. Todo lo que no
     encaje se descarta en lugar de romper la app. ─────────── */

  const HEX = /^#[0-9a-fA-F]{6}$/;

  function cleanName(value, fallback) {
    const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
    return name || fallback;
  }

  function cleanHabit(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = cleanName(raw.name, '');
    if (!name) return null;

    const type = ['check', 'quantity', 'schedule', 'avoid'].indexOf(raw.type) >= 0 ? raw.type : 'check';

    let target = null;
    if (type === 'quantity') {
      const t = raw.target || {};
      const amount = Number(t.amount);
      const step = Number(t.step);
      target = {
        amount: isFinite(amount) && amount > 0 ? amount : 1,
        unit: typeof t.unit === 'string' && t.unit.trim() ? t.unit.trim().slice(0, 10) : 'ud',
        step: isFinite(step) && step > 0 ? step : 1,
        // Ausente en los datos anteriores: los hábitos que ya existían
        // siguen con sus botones + y −.
        entry: t.entry === 'manual' ? 'manual' : 'stepper'
      };
    }

    let slots = null;
    if (type === 'schedule') {
      slots = Array.isArray(raw.slots) ? raw.slots.filter(function (s) { return SLOTS.indexOf(s) >= 0; }) : [];
      if (!slots.length) slots = SLOTS.slice();
      slots.sort(function (a, b) { return SLOTS.indexOf(a) - SLOTS.indexOf(b); });
    }

    let days = Array.isArray(raw.activeDays)
      ? raw.activeDays.map(Number).filter(function (d) { return d >= 0 && d <= 6; })
      : [];
    days = days.filter(function (d, i) { return days.indexOf(d) === i; }).sort();
    if (!days.length) days = [0, 1, 2, 3, 4, 5, 6];

    const rem = raw.reminder || {};

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : U.uid('h'),
      name: name,
      // No se parte por code point: emojis como 🏔️ son dos unidades y
      // separarlas los degrada al glifo de texto.
      icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim().slice(0, 8) : '✨',
      color: HEX.test(raw.color) ? raw.color : U.DEFAULT_ACCENT,
      type: type,
      target: target,
      slots: slots,
      activeDays: days,
      reminder: {
        enabled: rem.enabled === true,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(rem.time) ? rem.time : '08:00'
      },
      createdAt: U.isValidKey(raw.createdAt) ? raw.createdAt : U.todayKey(),
      archived: raw.archived === true
    };
  }

  /** Normaliza el valor de un log según el tipo de hábito. */
  function cleanLogValue(habit, value) {
    // 'avoid' guarda lo contrario que los demás: true = recaída, no logro.
    if (habit.type === 'check' || habit.type === 'avoid') return value === true ? true : null;

    if (habit.type === 'quantity') {
      const n = Number(value);
      return isFinite(n) && n > 0 ? n : null;
    }

    if (!value || typeof value !== 'object') return null;
    const out = {};
    habit.slots.forEach(function (s) { if (value[s] === true) out[s] = true; });
    return Object.keys(out).length ? out : null;
  }

  /** Mapa fecha → valor, descartando fechas inválidas. */
  function cleanByDate(raw, mapValue) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;

    Object.keys(raw).forEach(function (dateKey) {
      if (!U.isValidKey(dateKey)) return;
      const v = mapValue(raw[dateKey]);
      if (v !== null) out[dateKey] = v;
    });
    return out;
  }

  function cleanRoutine(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = cleanName(raw.name, '');
    if (!name) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : U.uid('r'),
      name: name
    };
  }

  function cleanExercise(raw, routineIds) {
    if (!raw || typeof raw !== 'object') return null;

    const name = cleanName(raw.name, '');
    if (!name) return null;
    if (routineIds.indexOf(raw.routineId) < 0) return null;   // rutina borrada

    const sets = Number(raw.sets);
    const target = Number(raw.target);

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : U.uid('e'),
      name: name,
      routineId: raw.routineId,
      kind: raw.kind === 'time' ? 'time' : 'reps',
      sets: isFinite(sets) && sets > 0 ? Math.min(Math.floor(sets), MAX_SETS) : 3,
      target: isFinite(target) && target > 0 ? Math.floor(target) : 10,
      archived: raw.archived === true
    };
  }

  /** Una sesión: qué rutina tocaba, qué series se hicieron y si se cerró. */
  function cleanSession(raw, exerciseIds) {
    if (!raw || typeof raw !== 'object') return null;

    const sets = {};
    const rawSets = (raw.sets && typeof raw.sets === 'object') ? raw.sets : {};

    Object.keys(rawSets).forEach(function (exerciseId) {
      if (exerciseIds.indexOf(exerciseId) < 0) return;
      const list = (Array.isArray(rawSets[exerciseId]) ? rawSets[exerciseId] : [])
        .map(Number)
        .filter(function (n) { return isFinite(n) && n > 0; })
        .slice(0, MAX_SETS);
      if (list.length) sets[exerciseId] = list;
    });

    const done = raw.done === true;
    if (!done && !Object.keys(sets).length) return null;   // sesión vacía: se descarta

    return {
      routineId: typeof raw.routineId === 'string' ? raw.routineId : null,
      done: done,
      sets: sets
    };
  }

  function cleanState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('estado no es un objeto');

    const habits = (Array.isArray(raw.habits) ? raw.habits : [])
      .map(cleanHabit)
      .filter(Boolean);

    const byId = {};
    habits.forEach(function (h) { byId[h.id] = h; });

    // Logs: se descartan los de hábitos borrados y las fechas inválidas.
    const logs = {};
    const rawLogs = (raw.logs && typeof raw.logs === 'object') ? raw.logs : {};
    Object.keys(rawLogs).forEach(function (habitId) {
      const habit = byId[habitId];
      if (!habit) return;
      const kept = cleanByDate(rawLogs[habitId], function (v) { return cleanLogValue(habit, v); });
      if (Object.keys(kept).length) logs[habitId] = kept;
    });

    const routines = (Array.isArray(raw.routines) ? raw.routines : [])
      .map(cleanRoutine)
      .filter(Boolean);
    const routineIds = routines.map(function (r) { return r.id; });

    const exercises = (Array.isArray(raw.exercises) ? raw.exercises : [])
      .map(function (e) { return cleanExercise(e, routineIds); })
      .filter(Boolean);
    const exerciseIds = exercises.map(function (e) { return e.id; });

    const s = raw.settings || {};
    const g = raw.game || {};
    const w = raw.workout || {};
    const today = U.todayKey();

    return {
      version: VERSION,
      settings: {
        weekStart: Number(s.weekStart) === 0 ? 0 : 1,
        accent: HEX.test(s.accent) ? s.accent : U.DEFAULT_ACCENT,
        notificationsEnabled: s.notificationsEnabled === true,
        // Ausente en los datos de la v1: se activa por defecto.
        effects: s.effects !== false
      },
      habits: habits,
      logs: logs,
      notes: cleanByDate(raw.notes, function (v) {
        return typeof v === 'string' && v.trim() ? v.slice(0, MAX_NOTE) : null;
      }),
      frozen: cleanByDate(raw.frozen, function (v) { return v === true ? true : null; }),
      routines: routines,
      exercises: exercises,
      sessions: cleanByDate(raw.sessions, function (v) { return cleanSession(v, exerciseIds); }),
      workout: {
        lastRoutineId: routineIds.indexOf(w.lastRoutineId) >= 0 ? w.lastRoutineId : null,
        linkedHabitId: byId[w.linkedHabitId] ? w.linkedHabitId : null
      },
      game: {
        points: Math.max(0, Math.floor(Number(g.points) || 0)),
        achievements: Array.isArray(g.achievements)
          ? g.achievements.filter(function (a) { return typeof a === 'string'; })
          : [],
        bestStreak: Math.max(0, Math.floor(Number(g.bestStreak) || 0)),
        // Contador propio, no derivado de habits.length: cuenta los que ha
        // creado el usuario, que es lo que mide "Coleccionista".
        habitsCreated: Math.max(0, Math.floor(Number(g.habitsCreated) || 0)),
        // XP por hitos de malos hábitos ya cobrada. Ausente en datos
        // anteriores: empieza a 0 y solo puede subir.
        avoidXpPaid: Math.max(0, Math.floor(Number(g.avoidXpPaid) || 0)),
        freezes: U.clamp(Math.floor(Number(g.freezes) || 0), 0, MAX_FREEZES),
        freezeMonth: /^\d{4}-\d{2}$/.test(g.freezeMonth) ? g.freezeMonth : today.slice(0, 7)
      }
    };
  }

  /** Un comodín nuevo al entrar en un mes distinto, hasta el tope. */
  function refillFreezes() {
    const month = U.todayKey().slice(0, 7);
    if (state.game.freezeMonth === month) return;
    state.game.freezeMonth = month;
    state.game.freezes = Math.min(MAX_FREEZES, state.game.freezes + 1);
  }

  /**
   * Migración a la v3: quien ya usaba la app no tenía tabla de ejercicios
   * ni hábito de entreno. Se crean, pero solo si no hay nada: una tabla
   * vaciada a propósito no se repuebla.
   */
  function migrateToWorkout() {
    if (!state.routines.length && !state.exercises.length) {
      const seed = seedWorkout();
      state.routines = seed.routines;
      state.exercises = seed.exercises;
    }

    if (!state.workout.linkedHabitId) {
      const training = mkHabit(
        { name: 'Entrenar', icon: '💪', color: '#f472b6', type: 'check' }, U.todayKey()
      );
      state.habits.push(training);
      state.game.habitsCreated++;
      state.workout.linkedHabitId = training.id;
    }
  }

  /* ── Carga y guardado ─────────────────────────────────────── */

  function load() {
    lastError = null;
    let raw = null;

    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      // Safari en privado, cookies bloqueadas: la app sigue en memoria.
      console.warn('localStorage no accesible:', err);
      lastError = { type: 'unavailable' };
      writable = false;
      state = defaultState();
      return state;
    }

    if (!raw) {
      state = defaultState();
      save();
      return state;
    }

    try {
      const parsed = JSON.parse(raw);
      const incoming = Math.floor(Number(parsed && parsed.version)) || 1;

      state = cleanState(parsed);
      refillFreezes();
      if (incoming < 3) migrateToWorkout();
      save();
    } catch (err) {
      console.error('Datos corruptos en localStorage:', err);
      // Se conserva el original por si el usuario quiere recuperarlo a mano.
      try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* sin espacio: se pierde */ }
      lastError = { type: 'corrupt' };
      state = defaultState();
      save();
    }
    return state;
  }

  function writeNow() {
    if (!writable) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('No se pudo guardar:', err);
      lastError = { type: err.name === 'QuotaExceededError' ? 'quota' : 'write' };
      emit('error');
      return false;
    }
  }

  // Marcar hábitos genera ráfagas de escrituras (el stepper y las notas,
  // sobre todo): se agrupan para no serializar el estado en cada pulsación.
  const scheduleWrite = U.debounce(writeNow, 180);

  function save(immediate) {
    if (immediate) { scheduleWrite.cancel(); return writeNow(); }
    scheduleWrite();
    return true;
  }

  // Cerrar la pestaña con una escritura pendiente perdería el último check.
  window.addEventListener('pagehide', function () { save(true); });

  /* ── Suscripción ──────────────────────────────────────────── */

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  function emit(event, payload) {
    listeners.forEach(function (fn) {
      try { fn(event, payload); } catch (err) { console.error('Listener falló:', err); }
    });
  }

  /** Persiste y avisa a la UI. */
  function commit(event, payload) {
    save();
    emit(event || 'change', payload);
  }

  /* ── Lectura: hábitos ─────────────────────────────────────── */

  function getState() { return state; }
  function getSettings() { return state.settings; }
  function getGame() { return state.game; }
  function getLastError() { return lastError; }

  function getHabits(includeArchived) {
    return includeArchived
      ? state.habits.slice()
      : state.habits.filter(function (h) { return !h.archived; });
  }

  function getArchivedHabits() {
    return state.habits.filter(function (h) { return h.archived; });
  }

  function getHabit(id) {
    return state.habits.filter(function (h) { return h.id === id; })[0] || null;
  }

  /** Hábitos que "tocan" ese día según sus días activos. */
  function getHabitsForDate(dateKey) {
    const dow = U.fromKey(dateKey).getDay();
    return getHabits().filter(function (h) {
      return h.activeDays.indexOf(dow) >= 0 && h.createdAt <= dateKey;
    });
  }

  function getLog(habitId, dateKey) {
    const days = state.logs[habitId];
    return days && days[dateKey] !== undefined ? days[dateKey] : null;
  }

  function getHabitLogs(habitId) {
    return state.logs[habitId] || {};
  }

  function getNote(dateKey) {
    return state.notes[dateKey] || '';
  }

  function isFrozen(dateKey) {
    return state.frozen[dateKey] === true;
  }

  /* ── Escritura: hábitos ───────────────────────────────────── */

  function addHabit(data) {
    const habit = cleanHabit(Object.assign({ createdAt: U.todayKey() }, data));
    if (!habit) return null;
    state.habits.push(habit);
    state.game.habitsCreated++;
    commit('habit:add', habit);
    return habit;
  }

  function updateHabit(id, patch) {
    const current = getHabit(id);
    if (!current) return null;

    const merged = cleanHabit(Object.assign({}, current, patch, { id: id, createdAt: current.createdAt }));
    if (!merged) return null;

    state.habits[state.habits.indexOf(current)] = merged;

    // Cambiar de tipo invalida el histórico: un número no significa nada
    // como check, ni al revés. Se limpia en lugar de mostrar datos falsos.
    if (merged.type !== current.type) delete state.logs[id];

    commit('habit:update', merged);
    return merged;
  }

  /** Devuelve una instantánea con la que restoreHabit() puede deshacer. */
  function deleteHabit(id) {
    const habit = getHabit(id);
    if (!habit) return null;

    const snapshot = { habit: habit, logs: state.logs[id] || {} };
    state.habits = state.habits.filter(function (h) { return h.id !== id; });
    delete state.logs[id];
    if (state.workout.linkedHabitId === id) state.workout.linkedHabitId = null;

    commit('habit:delete', habit);
    return snapshot;
  }

  function restoreHabit(snapshot) {
    if (!snapshot || getHabit(snapshot.habit.id)) return false;
    state.habits.push(snapshot.habit);
    if (Object.keys(snapshot.logs).length) state.logs[snapshot.habit.id] = snapshot.logs;
    commit('habit:add', snapshot.habit);
    return true;
  }

  function setArchived(id, archived) {
    return updateHabit(id, { archived: !!archived });
  }

  /* ── Escritura: registros ─────────────────────────────────── */

  function setLog(habitId, dateKey, value) {
    const habit = getHabit(habitId);
    if (!habit || !U.isValidKey(dateKey)) return null;

    const clean = cleanLogValue(habit, value);
    if (clean === null) {
      if (state.logs[habitId]) {
        delete state.logs[habitId][dateKey];
        if (!Object.keys(state.logs[habitId]).length) delete state.logs[habitId];
      }
    } else {
      if (!state.logs[habitId]) state.logs[habitId] = {};
      state.logs[habitId][dateKey] = clean;
    }

    commit('log:change', { habitId: habitId, dateKey: dateKey, value: clean });
    return clean;
  }

  function toggleCheck(habitId, dateKey) {
    return setLog(habitId, dateKey, getLog(habitId, dateKey) === true ? null : true);
  }

  /** Suma (o resta) al acumulado del día; nunca baja de 0. */
  function addQuantity(habitId, dateKey, delta) {
    const current = Number(getLog(habitId, dateKey)) || 0;
    return setLog(habitId, dateKey, Math.max(0, current + delta));
  }

  function toggleSlot(habitId, dateKey, slot) {
    const habit = getHabit(habitId);
    if (!habit || habit.type !== 'schedule' || habit.slots.indexOf(slot) < 0) return null;

    const current = getLog(habitId, dateKey) || {};
    const next = Object.assign({}, current);
    if (next[slot]) delete next[slot]; else next[slot] = true;
    return setLog(habitId, dateKey, next);
  }

  function setNote(dateKey, text) {
    if (!U.isValidKey(dateKey)) return null;

    const clean = String(text || '').slice(0, MAX_NOTE);
    if (clean.trim()) state.notes[dateKey] = clean;
    else delete state.notes[dateKey];

    commit('note:change', dateKey);
    return clean;
  }

  /* ── Comodines de racha ───────────────────────────────────
     Congelar un día lo vuelve neutro: no cuenta como cumplido
     pero tampoco corta la racha. Se gastan de uno en uno y se
     recuperan al descongelar. ─────────────────────────────── */

  function freezeDay(dateKey) {
    if (!U.isValidKey(dateKey) || isFrozen(dateKey)) return false;
    if (state.game.freezes <= 0) return false;

    state.frozen[dateKey] = true;
    state.game.freezes--;
    commit('freeze:change', dateKey);
    return true;
  }

  function unfreezeDay(dateKey) {
    if (!isFrozen(dateKey)) return false;
    delete state.frozen[dateKey];
    state.game.freezes = Math.min(MAX_FREEZES, state.game.freezes + 1);
    commit('freeze:change', dateKey);
    return true;
  }

  /* ── Lectura: ejercicios ──────────────────────────────────── */

  function getWorkout() { return state.workout; }
  function getRoutines() { return state.routines.slice(); }

  function getRoutine(id) {
    return state.routines.filter(function (r) { return r.id === id; })[0] || null;
  }

  function getExercises(routineId) {
    return state.exercises.filter(function (e) {
      return !e.archived && (!routineId || e.routineId === routineId);
    });
  }

  function getExercise(id) {
    return state.exercises.filter(function (e) { return e.id === id; })[0] || null;
  }

  function getSession(dateKey) {
    return state.sessions[dateKey] || null;
  }

  function getSets(dateKey, exerciseId) {
    const session = state.sessions[dateKey];
    return (session && session.sets[exerciseId]) || [];
  }

  /**
   * Rutina que toca: la siguiente a la última cerrada. Con rotación no
   * importa cuántos días pases sin entrenar — retomas donde lo dejaste.
   */
  function suggestedRoutineId() {
    if (!state.routines.length) return null;

    const last = state.workout.lastRoutineId;
    let index = -1;
    state.routines.forEach(function (r, i) { if (r.id === last) index = i; });

    return state.routines[(index + 1) % state.routines.length].id;
  }

  /** La rutina de ese día: la ya elegida, o la sugerida por la rotación. */
  function routineForDate(dateKey) {
    const session = state.sessions[dateKey];
    if (session && getRoutine(session.routineId)) return session.routineId;
    return suggestedRoutineId();
  }

  /* ── Escritura: ejercicios ────────────────────────────────── */

  function addRoutine(name) {
    const routine = cleanRoutine({ name: name });
    if (!routine) return null;
    state.routines.push(routine);
    commit('workout:change', routine);
    return routine;
  }

  function renameRoutine(id, name) {
    const routine = getRoutine(id);
    const clean = cleanName(name, '');
    if (!routine || !clean) return null;
    routine.name = clean;
    commit('workout:change', routine);
    return routine;
  }

  /** Borra la rutina, sus ejercicios y las series registradas de estos. */
  function deleteRoutine(id) {
    const routine = getRoutine(id);
    if (!routine) return false;

    const dropped = state.exercises
      .filter(function (e) { return e.routineId === id; })
      .map(function (e) { return e.id; });

    state.routines = state.routines.filter(function (r) { return r.id !== id; });
    state.exercises = state.exercises.filter(function (e) { return e.routineId !== id; });
    if (state.workout.lastRoutineId === id) state.workout.lastRoutineId = null;

    Object.keys(state.sessions).forEach(function (dateKey) {
      const session = state.sessions[dateKey];
      dropped.forEach(function (exId) { delete session.sets[exId]; });
      if (session.routineId === id) session.routineId = null;
    });

    commit('workout:change', routine);
    return true;
  }

  function addExercise(data) {
    const exercise = cleanExercise(data, state.routines.map(function (r) { return r.id; }));
    if (!exercise) return null;
    state.exercises.push(exercise);
    commit('workout:change', exercise);
    return exercise;
  }

  function updateExercise(id, patch) {
    const current = getExercise(id);
    if (!current) return null;

    const merged = cleanExercise(
      Object.assign({}, current, patch, { id: id }),
      state.routines.map(function (r) { return r.id; })
    );
    if (!merged) return null;

    state.exercises[state.exercises.indexOf(current)] = merged;
    commit('workout:change', merged);
    return merged;
  }

  function deleteExercise(id) {
    const exercise = getExercise(id);
    if (!exercise) return false;

    state.exercises = state.exercises.filter(function (e) { return e.id !== id; });
    Object.keys(state.sessions).forEach(function (dateKey) {
      delete state.sessions[dateKey].sets[id];
    });

    commit('workout:change', exercise);
    return true;
  }

  /* ── Escritura: sesiones ──────────────────────────────────── */

  function ensureSession(dateKey) {
    if (!state.sessions[dateKey]) {
      state.sessions[dateKey] = { routineId: suggestedRoutineId(), done: false, sets: {} };
    }
    return state.sessions[dateKey];
  }

  function setSessionRoutine(dateKey, routineId) {
    if (!U.isValidKey(dateKey) || !getRoutine(routineId)) return null;

    const session = ensureSession(dateKey);
    session.routineId = routineId;
    commit('session:change', dateKey);
    return session;
  }

  function addSet(dateKey, exerciseId, value) {
    if (!U.isValidKey(dateKey) || !getExercise(exerciseId)) return null;

    const n = Math.floor(Number(value));
    if (!isFinite(n) || n <= 0) return null;

    const session = ensureSession(dateKey);
    if (!session.sets[exerciseId]) session.sets[exerciseId] = [];
    if (session.sets[exerciseId].length >= MAX_SETS) return null;

    session.sets[exerciseId].push(n);
    commit('session:change', dateKey);
    return session.sets[exerciseId];
  }

  function removeSet(dateKey, exerciseId, index) {
    const session = state.sessions[dateKey];
    const list = session && session.sets[exerciseId];
    if (!list || index < 0 || index >= list.length) return null;

    list.splice(index, 1);
    if (!list.length) delete session.sets[exerciseId];
    commit('session:change', dateKey);
    return list;
  }

  /** Cerrar la sesión avanza la rotación; reabrirla la deja donde estaba. */
  function setSessionDone(dateKey, done) {
    const session = ensureSession(dateKey);
    session.done = !!done;

    if (done && session.routineId) state.workout.lastRoutineId = session.routineId;

    if (!session.done && !Object.keys(session.sets).length) delete state.sessions[dateKey];

    commit('session:change', dateKey);
    return session;
  }

  /* ── Escritura: ajustes y gamificación ────────────────────── */

  function setSettings(patch) {
    const next = Object.assign({}, state.settings, patch);
    state.settings = {
      weekStart: Number(next.weekStart) === 0 ? 0 : 1,
      accent: HEX.test(next.accent) ? next.accent : state.settings.accent,
      notificationsEnabled: next.notificationsEnabled === true,
      effects: next.effects !== false
    };
    commit('settings:change', state.settings);
    return state.settings;
  }

  /**
   * `game.points` es el acumulador de XP: se conserva con ese nombre porque
   * es el que ya está escrito en el almacén de todos los usuarios. El nivel
   * y el rango NO se guardan — se derivan de aquí con HT.stats.levelInfo(),
   * así que cambiar la curva de experiencia nunca corrompe datos.
   */
  function addPoints(n) {
    state.game.points = Math.max(0, state.game.points + Math.floor(n));
    commit('game:points', state.game.points);
    return state.game.points;
  }

  function unlockAchievement(id) {
    if (state.game.achievements.indexOf(id) >= 0) return false;
    state.game.achievements.push(id);
    commit('game:achievement', id);
    return true;
  }

  /** Marca hasta dónde se ha cobrado ya la XP de hitos. Nunca baja. */
  function setAvoidXpPaid(n) {
    const next = Math.max(0, Math.floor(Number(n) || 0));
    if (next <= state.game.avoidXpPaid) return state.game.avoidXpPaid;
    state.game.avoidXpPaid = next;
    save();
    return next;
  }

  function setBestStreak(n) {
    if (n <= state.game.bestStreak) return state.game.bestStreak;
    state.game.bestStreak = n;
    commit('game:streak', n);
    return n;
  }

  /* ── Mantenimiento ────────────────────────────────────────── */

  function replaceState(raw) {
    state = cleanState(raw);
    save(true);
    emit('state:replace');
    return state;
  }

  function reset() {
    state = defaultState();
    save(true);
    emit('state:replace');
    return state;
  }

  return {
    MAX_FREEZES: MAX_FREEZES,
    load: load, save: save, subscribe: subscribe,
    getState: getState, getSettings: getSettings, getGame: getGame, getLastError: getLastError,
    getHabits: getHabits, getArchivedHabits: getArchivedHabits, getHabit: getHabit,
    getHabitsForDate: getHabitsForDate, getLog: getLog, getHabitLogs: getHabitLogs,
    getNote: getNote, isFrozen: isFrozen,
    addHabit: addHabit, updateHabit: updateHabit, deleteHabit: deleteHabit,
    restoreHabit: restoreHabit, setArchived: setArchived,
    setLog: setLog, toggleCheck: toggleCheck, addQuantity: addQuantity, toggleSlot: toggleSlot,
    setNote: setNote, freezeDay: freezeDay, unfreezeDay: unfreezeDay,

    getWorkout: getWorkout, getRoutines: getRoutines, getRoutine: getRoutine,
    getExercises: getExercises, getExercise: getExercise,
    getSession: getSession, getSets: getSets,
    suggestedRoutineId: suggestedRoutineId, routineForDate: routineForDate,
    addRoutine: addRoutine, renameRoutine: renameRoutine, deleteRoutine: deleteRoutine,
    addExercise: addExercise, updateExercise: updateExercise, deleteExercise: deleteExercise,
    setSessionRoutine: setSessionRoutine, addSet: addSet, removeSet: removeSet,
    setSessionDone: setSessionDone,

    setSettings: setSettings,
    addPoints: addPoints, unlockAchievement: unlockAchievement, setBestStreak: setBestStreak,
    setAvoidXpPaid: setAvoidXpPaid,
    replaceState: replaceState, reset: reset
  };
})();
