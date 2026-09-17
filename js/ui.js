/* ============================================================
   ui.js — Todo el DOM vive aquí: render, modal, toasts, efectos.
   Lee del store y de stats, pero nunca escribe: las acciones
   del usuario se delegan a app.js mediante eventos.
   ============================================================ */
window.HT = window.HT || {};

HT.ui = (function () {
  'use strict';

  const U = HT.utils;
  const S = HT.store;
  const St = HT.stats;
  const $ = U.$;
  const el = U.createEl;

  const els = {};
  const cardIndex = {};     // habitId → nodo <li>, para repintar solo lo que cambia
  let lastFocused = null;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Un glifo por tipo de hábito, con silueta distinta para que se reconozca
   * de un vistazo: diana = meta por cantidad, reloj = franjas, check = diario.
   */
  const TYPE_ICON = {
    check: {
      label: 'Check diario',
      shapes: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M8.2 12.4l2.7 2.7 5-5.2' }]]
    },
    quantity: {
      label: 'Objetivo por cantidad',
      shapes: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['circle', { cx: 12, cy: 12, r: 3.2 }]]
    },
    schedule: {
      label: 'Por franjas del día',
      shapes: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M12 7.6V12l3.2 2' }]]
    },
    avoid: {
      label: 'Hábito que quieres dejar',
      shapes: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M6.6 17.4L17.4 6.6' }]]
    }
  };

  function typeBadge(habit, className) {
    const spec = TYPE_ICON[habit.type];
    const svg = svgEl('svg', { class: className, viewBox: '0 0 24 24', role: 'img' });

    const title = svgEl('title');
    title.textContent = spec.label;
    svg.appendChild(title);

    spec.shapes.forEach(function (shape) { svg.appendChild(svgEl(shape[0], shape[1])); });
    return svg;
  }

  // La ficha de un hábito no tiene botón propio en la barra: mientras se
  // mira, "Hoy" sigue siendo la sección activa.
  const NAV_OF_VIEW = {
    today: 'today', week: 'week', exercises: 'exercises', progress: 'progress',
    habit: 'today', settings: 'settings'
  };

  // Iconos sugeridos. Se guardan como array y no como una cadena para
  // partir: emojis como 🏋️ ocupan dos unidades y Array.from los rompería.
  const EMOJI_GROUPS = [
    { name: 'Cuerpo', items: ['🏃', '🚴', '🏋️', '🧘', '🤸', '🏊', '⚽', '🥊', '🚶', '💪', '🩺', '💊', '🦷', '😴'] },
    { name: 'Comida', items: ['💧', '🥗', '🥦', '🍎', '🥑', '🍳', '🫖', '☕', '🧃', '🍽️'] },
    { name: 'Mente', items: ['📖', '📚', '✍️', '🧠', '🎓', '📝', '🗒️', '🧩', '💡', '🔬', '🗣️', '🎧'] },
    { name: 'Trabajo', items: ['🎯', '💼', '💻', '📊', '⏱️', '📅', '✅', '🗂️', '📈', '🧾'] },
    { name: 'Crear', items: ['🎨', '🎸', '🎹', '📷', '🎬', '✏️', '🧵', '🪴', '🔨'] },
    { name: 'Casa', items: ['🧹', '🧺', '🛒', '🐕', '🐈', '🗑️', '🔧', '💳'] },
    { name: 'Ánimo', items: ['☀️', '🌙', '🙏', '❤️', '🤝', '📞', '💌', '🎉', '🌱', '✨'] },
    { name: 'Dejar', items: ['🚭', '🍺', '🍬', '📵', '🛑'] }
  ];

  function init() {
    [
      'levelBadge', 'levelRing', 'levelNum', 'pointsValue', 'todayTime', 'todayLabel',
      'doneCount', 'totalCount', 'dayProgress', 'dayProgressFill',
      'prevDay', 'nextDay', 'btnToday',
      'habitList', 'emptyToday', 'dayActions', 'btnFreeze', 'freezeHint', 'dayNote',
      'statWeek', 'statMonth', 'statStreak', 'statBest',
      'levelPanel', 'lvNumber', 'lvRank', 'lvBar', 'lvFill', 'lvXp', 'lvRemaining',
      'heatmap', 'yearScroll', 'yearGrid', 'monthLabel', 'streakList', 'achievementGrid',
      'avoidCard', 'avoidList',
      'statWeekBar', 'statMonthBar',
      'chart', 'chartTitle', 'chartReadout', 'chartTable', 'chartEmpty', 'chartData',
      'calendarEmpty', 'calendarEmptyText', 'heatmapLegend',
      'weekGrid', 'weekLabel', 'weekSummary', 'emptyWeek', 'btnThisWeek',
      'emojiPicker', 'btnEmoji',
      'sessionEyebrow', 'routineName', 'routinePick', 'sessionSummary', 'exerciseList',
      'emptyWorkout', 'btnFinishSession', 'sessionHint', 'btnManageWorkout',
      'workoutManager', 'routineTable',
      'exerciseModal', 'exerciseForm', 'exModalTitle', 'exNameError', 'btnDeleteExercise',
      'habitIcon', 'habitTitle', 'habitMeta', 'hStreak', 'hBest', 'hRate', 'hTotal',
      'habitHeatmap', 'hMonthLabel', 'weekBars', 'weekInsight', 'btnArchiveHabit',
      'habitModal', 'habitForm', 'modalTitle', 'btnDeleteHabit',
      'setStartWeek', 'setAccent', 'btnResetAccent', 'setNotifications', 'setEffects',
      'archivedCard', 'archiveList', 'toastStack', 'confetti',
      'buildVersion', 'buildOrigin', 'buildCache', 'buildHint',
      'quantityFields', 'stepField', 'entryFields', 'slotFields', 'avoidHint',
      'fCategory', 'limitField', 'fLimit',
      'fName', 'fNameError', 'fReminder', 'fReminderSwitch'
    ].forEach(function (id) { els[id] = document.getElementById(id); });

    // Un id que falte daría un "Cannot read properties of null" veinte líneas
    // más abajo. Mejor decir cuál falta y dónde.
    const missing = Object.keys(els).filter(function (id) { return !els[id]; });
    if (missing.length) {
      throw new Error('Faltan estos elementos en index.html: ' + missing.join(', '));
    }

    els.views = {
      today: $('#view-today'),
      week: $('#view-week'),
      exercises: $('#view-exercises'),
      progress: $('#view-progress'),
      habit: $('#view-habit'),
      settings: $('#view-settings')
    };
    els.navItems = U.$$('.nav__item');

    // Las categorías salen del catálogo, no del HTML: añadir una es tocar
    // HT.utils.CATEGORIES y nada más.
    U.CATEGORIES.forEach(function (cat) {
      els.fCategory.appendChild(el('option', { value: cat.id, text: cat.icon + '  ' + cat.name }));
    });

    buildEmojiPicker();
  }

  /* ── Navegación entre vistas ──────────────────────────────── */

  function setView(name) {
    Object.keys(els.views).forEach(function (key) {
      const view = els.views[key];
      const active = key === name;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });

    const navName = NAV_OF_VIEW[name];
    els.navItems.forEach(function (btn) {
      const active = btn.dataset.view === navName;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    // Reiniciar la animación de entrada sin volver a montar la vista.
    const view = els.views[name];
    view.style.animation = 'none';
    void view.offsetWidth;
    view.style.animation = '';
  }

  /* ── Cabecera ─────────────────────────────────────────────── */

  function renderHeader(dateKey, todayKey) {
    const date = U.fromKey(dateKey);
    const day = St.dayStats(dateKey);
    const info = St.levelInfo(S.getGame().points);
    const isToday = dateKey === todayKey;

    els.todayTime.textContent = isToday ? 'Hoy · ' + U.formatLong(date) : U.formatLong(date);
    els.todayTime.setAttribute('datetime', dateKey);

    // No se registra en el futuro: no tendría sentido marcar mañana.
    els.nextDay.disabled = isToday;
    els.btnToday.hidden = isToday;

    els.doneCount.textContent = day.done;
    els.totalCount.textContent = day.total;

    els.dayProgressFill.style.setProperty('--pct', day.pct);
    els.dayProgress.setAttribute('aria-valuenow', day.pct);
    els.dayProgress.setAttribute('aria-valuetext', day.done + ' de ' + day.total + ' hábitos');

    els.levelNum.textContent = info.level;
    els.pointsValue.textContent = info.xp;
    els.levelRing.style.setProperty('--ring-pct', info.pct);
    els.levelBadge.setAttribute(
      'aria-label',
      'Nivel ' + info.level + ', rango ' + info.rank.name + ', ' + info.xp +
      ' de XP. Faltan ' + info.remaining + ' para el nivel ' + (info.level + 1) +
      '. Ver progreso'
    );
  }

  /* ── Nivel y rango ────────────────────────────────────────
     Solo pinta: todas las cuentas vienen de St.levelInfo(), que es quien
     conoce la curva de experiencia. ─────────────────────────── */

  const fmtNum = new Intl.NumberFormat('es-ES');

  function renderLevelPanel() {
    const info = St.levelInfo(S.getGame().points);

    setStat(els.lvNumber, String(info.level));
    els.lvRank.textContent = info.rank.name;

    els.lvXp.textContent = fmtNum.format(info.xp) + ' / ' + fmtNum.format(info.next) + ' XP';
    els.lvRemaining.textContent = fmtNum.format(info.remaining) + ' XP para subir de nivel';

    els.lvFill.style.setProperty('--pct', info.pct);
    els.lvBar.setAttribute('aria-valuenow', info.pct);
    els.lvBar.setAttribute(
      'aria-valuetext',
      fmtNum.format(info.into) + ' de ' + fmtNum.format(info.needed) +
      ' XP del nivel ' + info.level + ' · rango ' + info.rank.name
    );
  }

  /**
   * Celebración de subida de nivel. app.js decide CUÁNDO se ha subido;
   * esto decide solo cómo se enseña, así que cambiar la animación no
   * toca la detección.
   */
  function showLevelUp(level, rankName) {
    toast('¡Nivel ' + level + '! Rango ' + rankName, { type: 'achievement', icon: '⬆' });

    const badge = els.levelBadge;
    badge.classList.remove('is-levelup');
    void badge.offsetWidth;                 // reinicia la animación
    badge.classList.add('is-levelup');
    badge.addEventListener('animationend', function () {
      badge.classList.remove('is-levelup');
    }, { once: true });

    if (S.getSettings().effects) { celebrate(); buzz([30, 50, 30, 50, 60]); }
  }

  /* ── Tarjetas de hábito ───────────────────────────────────── */

  function checkIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 12.5l5.2 5.2L20 7');
    svg.appendChild(path);
    return svg;
  }

  /**
   * La tarjeta se monta una vez con toda su estructura y después solo se
   * repinta (paintCard). Secciones, de arriba abajo: cabecera con categoría,
   * nombre y estado; barra de progreso; controles; métricas; mensaje.
   */
  function buildCard(habit, dateKey) {
    const avoid = St.isAvoid(habit);
    const cat = U.categoryById(habit.category);

    const li = el('li', {
      class: 'habit-card',
      'data-id': habit.id,
      'data-type': habit.type,
      'data-state': 'pending'
    });
    li.style.setProperty('--habit-color', habit.color);
    // El borde izquierdo lleva el color de la categoría; sin categoría, el
    // del propio hábito, para que nunca quede un canto muerto.
    li.style.setProperty('--cat-color', cat ? cat.color : habit.color);

    /* ── Cabecera ── */
    const head = el('div', { class: 'habit-card__head' });

    // El icono abre la ficha del hábito; desde ahí se edita o se archiva.
    head.appendChild(el('button', {
      type: 'button',
      class: 'habit-card__icon',
      'data-action': 'detail',
      title: 'Ver ' + habit.name,
      'aria-label': 'Ver detalle de ' + habit.name,
      text: habit.icon
    }));

    const titles = el('div', { class: 'habit-card__titles' });

    // El nombre abre la ficha igual que el icono: un blanco mucho mayor.
    const title = el('h2', { class: 'habit-card__name' });
    title.appendChild(el('button', {
      type: 'button', class: 'habit-card__link', 'data-action': 'detail', text: habit.name
    }));
    titles.appendChild(title);

    const catRow = el('p', { class: 'habit-card__cat' });
    if (cat) {
      catRow.appendChild(el('span', { class: 'habit-card__cat-icon', 'aria-hidden': 'true', text: cat.icon }));
      catRow.appendChild(el('span', { text: cat.name }));
    } else {
      catRow.appendChild(el('span', { text: 'Sin categoría' }));
    }
    titles.appendChild(catRow);
    head.appendChild(titles);

    head.appendChild(el('span', { class: 'badge' }));
    li.appendChild(head);

    /* ── Barra de progreso ── */
    const track = el('div', { class: 'progress progress--sm habit-card__bar' });
    track.appendChild(el('div', { class: 'progress__fill' }));
    li.appendChild(track);
    li.appendChild(el('p', { class: 'habit-card__pct' }));

    /* ── Controles ── */
    const controls = el('div', { class: 'habit-card__controls' });

    if (habit.type === 'check') {
      const btn = el('button', {
        type: 'button',
        class: 'check-btn',
        'data-action': 'check',
        'aria-pressed': 'false',
        'aria-label': 'Marcar ' + habit.name + ' como hecho'
      });
      btn.appendChild(checkIcon());
      controls.appendChild(btn);
    }

    if (habit.type === 'schedule') {
      const group = el('div', { class: 'slots', role: 'group', 'aria-label': 'Franjas de ' + habit.name });
      habit.slots.forEach(function (slot) {
        group.appendChild(el('button', {
          type: 'button',
          class: 'slot',
          'data-action': 'slot',
          'data-slot': slot,
          'aria-pressed': 'false',
          text: St.SLOT_LABELS[slot]
        }));
      });
      controls.appendChild(group);
    }

    if (habit.type === 'quantity' && habit.target.entry === 'manual') {
      controls.appendChild(el('input', {
        type: 'number',
        class: 'input habit-card__amount',
        'data-action': 'amount',
        min: '0',
        step: 'any',
        inputmode: 'decimal',
        placeholder: '0',
        'aria-label': habit.name + ': escribe el total en ' + habit.target.unit
      }));
    }

    // Stepper de cantidad y de fallos: mismo esqueleto, distinto significado.
    if ((habit.type === 'quantity' && habit.target.entry !== 'manual') || avoid) {
      const paso = avoid ? 1 : habit.target.step;
      const unidad = avoid ? 'fallos' : habit.target.unit;

      const stepper = el('div', { class: 'stepper' });
      stepper.appendChild(el('button', {
        type: 'button', class: 'round-btn', 'data-action': 'minus',
        'aria-label': (avoid ? 'Quitar un fallo de ' : 'Restar ' + paso + ' ' + unidad + ' a ') + habit.name,
        text: '−'
      }));
      stepper.appendChild(el('span', { class: 'habit-card__value' }));
      stepper.appendChild(el('button', {
        type: 'button',
        class: 'round-btn ' + (avoid ? 'round-btn--fail' : 'round-btn--add'),
        'data-action': 'plus',
        'aria-label': (avoid ? 'Apuntar un fallo en ' : 'Sumar ' + paso + ' ' + unidad + ' a ') + habit.name,
        text: avoid ? '✗' : '+'
      }));
      controls.appendChild(stepper);
    }

    li.appendChild(controls);

    /* ── Métricas y mensaje ── */
    li.appendChild(el('ul', { class: 'habit-card__metrics' }));
    li.appendChild(el('p', { class: 'habit-card__cheer', hidden: true }));

    paintCard(li, habit, dateKey);
    return li;
  }

  /** Una métrica de la tira inferior: icono, número y etiqueta accesible. */
  function metric(icon, text, label, className) {
    const item = el('li', { class: 'metric' + (className ? ' ' + className : ''), title: label });
    item.appendChild(el('span', { class: 'metric__icon', 'aria-hidden': 'true', text: icon }));
    item.appendChild(el('span', { class: 'metric__text', text: text }));
    item.appendChild(el('span', { class: 'sr-only', text: label }));
    return item;
  }

  // Texto del badge por estado. El color lo pone el CSS con data-state.
  const BADGE = {
    done: 'Hecho', partial: 'En marcha', pending: 'Pendiente',
    clean: 'Sin caer', warn: 'Ojo', critical: 'Al límite'
  };

  /** Vuelca el estado del día sobre una tarjeta ya construida. */
  function paintCard(li, habit, dateKey) {
    const hoy = U.todayKey();
    const value = S.getLog(habit.id, dateKey);
    const avoid = St.isAvoid(habit);
    const state = St.cardState(habit, dateKey);
    const ratio = St.progressOf(habit, value);
    const pct = Math.round(ratio * 100);

    li.dataset.state = state;
    li.classList.toggle('is-done', state === 'done');
    li.style.setProperty('--card-pct', pct);

    $('.badge', li).textContent = BADGE[state];
    $('.progress__fill', li).style.setProperty('--pct', pct);
    $('.habit-card__pct', li).textContent = pct + '%';

    /* ── Valor actual / meta ── */
    const valueNode = $('.habit-card__value', li);
    if (valueNode) {
      const fails = St.failsOf(value);
      const actual = avoid ? fails : (Number(value) || 0);
      const tope = avoid ? St.limitOf(habit) : habit.target.amount;
      const unidad = avoid ? '' : ' ' + habit.target.unit;

      valueNode.textContent = '';
      valueNode.appendChild(el('strong', { text: String(actual) }));
      valueNode.appendChild(document.createTextNode(' / ' + tope + unidad));
      valueNode.setAttribute('aria-label', avoid
        ? fails + ' fallos hoy, límite ' + tope
        : actual + ' de ' + tope + unidad);
    }

    const amountInput = $('.habit-card__amount', li);
    // Nunca se pisa lo que el usuario está escribiendo.
    if (amountInput && document.activeElement !== amountInput) {
      amountInput.value = (Number(value) || 0) || '';
    }

    if (habit.type === 'check') {
      const btn = $('.check-btn', li);
      const done = state === 'done';
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute('aria-label', (done ? 'Desmarcar ' : 'Marcar ') + habit.name);
    }

    if (habit.type === 'schedule') {
      U.$$('.slot', li).forEach(function (btn) {
        const on = !!(value && value[btn.dataset.slot]);
        btn.classList.toggle('is-done', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    /* ── Métricas ── */
    const streak = St.currentStreak(habit, hoy);
    const best = St.bestStreak(habit, hoy);
    const rate = St.habitRate(habit, hoy, 30);

    const metrics = $('.habit-card__metrics', li);
    metrics.textContent = '';

    metrics.appendChild(metric('🔥', String(streak),
      'Racha actual: ' + streak + (streak === 1 ? ' día' : ' días') +
      (avoid ? ' sin caer' : ' cumpliendo')));

    // El récord solo se enseña si hay algo que superar. Cuando la racha lo
    // alcanza, deja de ser una meta y pasa a ser la noticia.
    if (best > streak) {
      metrics.appendChild(metric('🏆', String(best), 'Récord: ' + best + ' días'));
    } else if (best > 0 && streak === best) {
      metrics.appendChild(metric('🏆', '¡récord!', 'Estás en tu mejor racha: ' + best + ' días',
                                 'metric--record'));
    }

    metrics.appendChild(metric('📊', rate.total ? rate.pct + '%' : '—',
      rate.total ? 'Tasa de éxito de los últimos 30 días: ' + rate.pct + '%'
                 : 'Todavía sin datos de los últimos 30 días'));

    if (avoid) {
      const semana = St.failsThisWeek(habit, hoy, S.getSettings().weekStart);
      metrics.appendChild(metric('❌', String(semana),
        semana + (semana === 1 ? ' fallo' : ' fallos') + ' esta semana',
        semana ? 'metric--bad' : null));
    }

    /* ── Mensaje ── */
    const cheer = $('.habit-card__cheer', li);
    const texto = cheerFor(habit, state, streak, avoid);
    cheer.textContent = texto || '';
    cheer.hidden = !texto;
  }

  /** El mensaje de ánimo, o null si no toca decir nada. */
  function cheerFor(habit, state, streak, avoid) {
    if (avoid) {
      if (state === 'critical') return '⚠️ Has llegado al límite. Mañana, de cero.';
      if (state === 'warn') return '💪 Un tropiezo no borra la racha.';
      return streak > 1 ? '🎉 ¡' + streak + ' días sin caer!' : '🎉 ¡Día sin!';
    }
    if (state === 'done') return streak > 1 ? '🎉 ¡' + streak + ' días seguidos!' : '🎉 ¡Hecho!';
    return null;
  }

  /** Reconstruye la lista entera. Solo al añadir, editar, borrar o cambiar de día. */
  function renderHabitList(dateKey) {
    const habits = S.getHabitsForDate(dateKey);
    const frag = document.createDocumentFragment();

    Object.keys(cardIndex).forEach(function (k) { delete cardIndex[k]; });

    habits.forEach(function (habit) {
      const card = buildCard(habit, dateKey);
      cardIndex[habit.id] = card;
      frag.appendChild(card);
    });

    els.habitList.textContent = '';
    els.habitList.appendChild(frag);

    // Dos vacíos distintos: "aún no tienes hábitos" y "ese día no toca ninguno".
    const hasAny = S.getHabits().length > 0;
    els.habitList.hidden = habits.length === 0;
    els.emptyToday.hidden = habits.length > 0;

    if (!habits.length) {
      $('.empty-state__title', els.emptyToday).textContent =
        hasAny ? 'Día libre' : 'Sin hábitos todavía';
      $('.empty-state__text', els.emptyToday).textContent = hasAny
        ? 'Ninguno de tus hábitos toca este día. Disfruta del descanso.'
        : 'Crea el primero y empieza tu racha hoy mismo.';
      $('[data-action="add-habit"]', els.emptyToday).hidden = hasAny;
    }
  }

  /** Repinta una sola tarjeta: conserva el foco del teclado intacto. */
  function updateCard(habitId, dateKey) {
    const card = cardIndex[habitId];
    const habit = S.getHabit(habitId);
    if (!card || !habit) return;
    paintCard(card, habit, dateKey);
  }

  function pulse(habitId) {
    const card = cardIndex[habitId];
    if (!card) return;
    const target = $('.check-btn', card) || $('.habit-card__icon', card);
    target.classList.remove('is-popping');
    void target.offsetWidth;
    target.classList.add('is-popping');
  }

  /* ── Comodín de racha y notas del día ─────────────────────── */

  function renderDayExtras(dateKey) {
    const day = St.dayStats(dateKey);
    const freezes = S.getGame().freezes;
    const frozen = S.isFrozen(dateKey);

    // Solo tiene sentido ofrecerlo si ese día quedó algo sin cumplir.
    const relevant = day.total > 0 && (frozen || !day.perfect);
    els.dayActions.hidden = !relevant;

    if (relevant) {
      els.btnFreeze.textContent = frozen ? 'Descongelar día' : 'Congelar día';
      els.btnFreeze.disabled = !frozen && freezes <= 0;
      els.btnFreeze.classList.toggle('is-on', frozen);

      els.freezeHint.textContent = frozen
        ? 'Este día no romperá tus rachas.'
        : freezes > 0
          ? 'Te quedan ' + freezes + (freezes === 1 ? ' comodín' : ' comodines') +
            '. Salvan las rachas de un día flojo.'
          : 'Sin comodines. Recuperas uno al empezar cada mes.';
    }

    if (document.activeElement !== els.dayNote) els.dayNote.value = S.getNote(dateKey);
  }

  /* ── Celdas del calendario ────────────────────────────────── */

  /** Una celda pulsable que lleva a ese día. `dateKey` null = hueco. */
  function heatCell(dateKey, level, label, opts) {
    if (!dateKey) return el('div', { class: 'heat heat--empty', 'aria-hidden': 'true' });

    const cell = el('button', {
      type: 'button',
      class: 'heat',
      'data-date': dateKey,
      'data-level': level === null ? '0' : String(level),
      'data-today': opts.isToday ? 'true' : null,
      'data-frozen': opts.frozen ? 'true' : null,
      title: label,
      'aria-label': label
    });
    if (level === null) cell.classList.add('heat--empty');
    if (opts.future) cell.disabled = true;
    return cell;
  }

  function dayCellLabel(dateKey, day) {
    const date = U.formatShort(U.fromKey(dateKey));
    if (!day.total) return date + ': sin hábitos';
    return date + ': ' + day.done + ' de ' + day.total +
           (day.frozen ? ' · día congelado' : '');
  }

  /* ── Vista de progreso ────────────────────────────────────── */

  /**
   * Escribe una cifra contando hasta ella. Solo se anima si el número cambia,
   * para que repintar la vista no vuelva a lanzar la cuenta cada vez.
   */
  function setStat(node, text) {
    if (node.textContent === text) return;

    const target = parseFloat(text);
    const previo = parseFloat(node.textContent);
    const desde = isFinite(previo) ? previo : 0;

    // El valor definitivo se escribe ya: la cuenta es decoración y no puede
    // ser la única vía por la que el número llega a la pantalla. Si el
    // navegador no ejecuta el rAF (pestaña de fondo), el dato sigue ahí.
    node.textContent = text;

    if (prefersReducedMotion() || !isFinite(target) || document.hidden) return;

    const sufijo = text.replace(/^-?[\d.]+/, '');
    const inicio = performance.now();

    function paso(ahora) {
      const t = Math.min(1, (ahora - inicio) / 700);
      const suave = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(desde + (target - desde) * suave) + sufijo;
      if (t < 1) requestAnimationFrame(paso);
      else node.textContent = text;
    }
    requestAnimationFrame(paso);
  }

  function renderProgress(dateKey, period, scale) {
    const weekStart = S.getSettings().weekStart;
    renderLevelPanel();
    const week = St.weekRate(dateKey, weekStart);
    const month = St.monthRate(dateKey);

    setStat(els.statWeek, week.total ? week.pct + '%' : '—');
    setStat(els.statMonth, month.total ? month.pct + '%' : '—');
    setStat(els.statStreak, String(St.topStreak(dateKey)));
    setStat(els.statBest, String(S.getGame().bestStreak));

    // Las barras muestran el mismo dato que la cifra, no uno nuevo
    els.statWeekBar.style.setProperty('--pct', week.total ? week.pct : 0);
    els.statMonthBar.style.setProperty('--pct', month.total ? month.pct : 0);

    const yearMode = scale === 'year';
    const today = U.todayKey();
    let series;
    let periodLabel;

    if (yearMode) {
      renderYear(period.getFullYear(), weekStart);
      periodLabel = String(period.getFullYear());
      series = St.yearSeries(period.getFullYear(), today);
      els.chartTitle.textContent = 'Evolución mes a mes';
    } else {
      renderMonth(period, weekStart);
      periodLabel = U.formatMonth(period);
      series = St.monthSeries(period.getFullYear(), period.getMonth(), today);
      els.chartTitle.textContent = 'Evolución día a día';
    }

    // Un calendario o una gráfica sin un solo registro no es una rejilla
    // vacía: es un mensaje. Se cambia el bloque entero.
    const vacio = !series.some(function (p) { return p.touched; });

    els.heatmap.hidden = yearMode || vacio;
    els.yearScroll.hidden = !yearMode || vacio;
    els.calendarEmpty.hidden = !vacio;
    els.heatmapLegend.hidden = vacio;
    els.calendarEmptyText.textContent = yearMode
      ? 'Aún no hay datos este año'
      : 'Aún no hay datos este mes';

    els.chart.hidden = vacio;
    els.chartData.hidden = vacio;
    els.chartEmpty.hidden = !vacio;

    if (!vacio) renderChart(series, scale, periodLabel);
    else els.chartReadout.textContent = 'Sin registros en este periodo.';
    renderStreakList(dateKey);
    renderAvoidList(dateKey);
    renderAchievements();
  }

  /** Una celda de día del calendario general. `dayStats` es caro: se calcula una vez. */
  function dayCell(key, today) {
    if (!key) return heatCell(null);

    const day = St.dayStats(key);
    return heatCell(key, St.heatLevel(day), dayCellLabel(key, day), {
      isToday: key === today, frozen: day.frozen, future: key > today
    });
  }

  function renderMonth(monthDate, weekStart) {
    const cells = U.monthGrid(monthDate.getFullYear(), monthDate.getMonth(), weekStart);
    const frag = document.createDocumentFragment();
    const today = U.todayKey();

    U.weekdayLabels(weekStart).forEach(function (label) {
      frag.appendChild(el('div', { class: 'heatmap__dow', 'aria-hidden': 'true', text: label }));
    });

    cells.forEach(function (key) { frag.appendChild(dayCell(key, today)); });

    els.heatmap.textContent = '';
    els.heatmap.appendChild(frag);
    els.monthLabel.textContent = U.formatMonth(monthDate);
  }

  function renderYear(year, weekStart) {
    const frag = document.createDocumentFragment();
    const today = U.todayKey();

    U.yearGrid(year, weekStart).forEach(function (key) {
      frag.appendChild(dayCell(key, today));
    });

    els.yearGrid.textContent = '';
    els.yearGrid.appendChild(frag);
    els.monthLabel.textContent = String(year);
  }

  /* ── Vista de semana ──────────────────────────────────────
     Filas de hábitos por columnas de días: el plan y el
     marcador en la misma rejilla. ─────────────────────────── */

  const CELL_LABEL = {
    done: 'cumplido', pending: 'pendiente', missed: 'sin cumplir',
    frozen: 'día congelado', future: 'aún por llegar', off: 'no toca'
  };

  function renderWeek(dateKeys, todayKey) {
    const weekStart = S.getSettings().weekStart;
    const rows = St.weekMatrix(dateKeys, todayKey);
    // Los días que aún no han llegado no cuentan como fallados
    const rate = St.rateOver(dateKeys.filter(function (k) { return k <= todayKey; }));

    els.weekLabel.textContent =
      U.formatShort(U.fromKey(dateKeys[0])) + ' – ' + U.formatShort(U.fromKey(dateKeys[6]));
    els.btnThisWeek.hidden = dateKeys.indexOf(todayKey) >= 0;

    els.weekSummary.textContent = rate.total
      ? rate.done + ' de ' + rate.total + ' cumplidos · ' + rate.pct + '%'
      : 'Nada previsto en esta semana.';

    els.emptyWeek.hidden = rows.length > 0;
    els.weekGrid.hidden = rows.length === 0;
    if (!rows.length) { els.weekGrid.textContent = ''; return; }

    const frag = document.createDocumentFragment();

    // Cabecera: inicial del día y número, con hoy destacado
    frag.appendChild(el('div', { class: 'week-grid__corner', 'aria-hidden': 'true' }));
    U.weekdayLabels(weekStart).forEach(function (letter, i) {
      const key = dateKeys[i];
      const head = el('div', {
        class: 'week-grid__head',
        'data-today': key === todayKey ? 'true' : null
      });
      head.appendChild(el('span', { class: 'week-grid__dow', text: letter }));
      head.appendChild(el('span', { class: 'week-grid__num', text: String(U.fromKey(key).getDate()) }));
      frag.appendChild(head);
    });

    rows.forEach(function (row) {
      const name = el('div', { class: 'week-grid__name' });
      name.style.setProperty('--habit-color', row.habit.color);
      name.appendChild(el('span', { class: 'week-grid__icon', 'aria-hidden': 'true', text: row.habit.icon }));
      name.appendChild(el('span', { class: 'week-grid__label', text: row.habit.name }));
      name.appendChild(typeBadge(row.habit, 'week-grid__type'));
      frag.appendChild(name);

      row.cells.forEach(function (cell) {
        const label = row.habit.name + ', ' +
                      U.formatShort(U.fromKey(cell.key)) + ': ' + CELL_LABEL[cell.state];

        if (cell.state === 'off') {
          frag.appendChild(el('div', {
            class: 'week-cell', 'data-state': 'off', 'data-level': '0',
            title: label, 'aria-label': label, role: 'img'
          }));
          return;
        }

        const detail = cell.level && cell.state !== 'done'
          ? label + ' · ' + Math.round(cell.ratio * 100) + '%'
          : label;

        const btn = el('button', {
          type: 'button',
          class: 'week-cell',
          'data-state': cell.state,
          'data-level': String(cell.level),
          'data-date': cell.key,
          title: detail,
          'aria-label': detail
        });
        btn.style.setProperty('--habit-color', row.habit.color);
        if (cell.state === 'future') btn.disabled = true;
        frag.appendChild(btn);
      });
    });

    els.weekGrid.textContent = '';
    els.weekGrid.appendChild(frag);
  }

  /* ── Ejercicios ───────────────────────────────────────────
     Una fila por ejercicio: objetivo, las series ya hechas como
     fichas y un campo para apuntar la siguiente. ──────────── */

  function unitOf(exercise) {
    return exercise.kind === 'time' ? 's' : 'rep';
  }

  function renderExercises(dateKey, routineId, isToday) {
    const routine = S.getRoutine(routineId);
    const exercises = routine ? S.getExercises(routineId) : [];
    const session = S.getSession(dateKey);
    const done = !!(session && session.done);

    els.routineName.textContent = routine ? routine.name : 'Sin rutinas';
    els.sessionEyebrow.textContent = done
      ? 'Entreno cerrado'
      : isToday ? 'Hoy toca' : 'Ese día toca';

    // Selector de rutina
    const routines = S.getRoutines();
    els.routinePick.textContent = '';
    routines.forEach(function (r) {
      const opt = el('option', { value: r.id, text: r.name });
      if (r.id === routineId) opt.selected = true;
      els.routinePick.appendChild(opt);
    });
    els.routinePick.disabled = done || routines.length < 2;

    const summary = St.sessionSummary(dateKey, exercises);
    const parts = [];
    if (summary.sets) parts.push(summary.sets + (summary.sets === 1 ? ' serie' : ' series'));
    if (summary.reps) parts.push(summary.reps + ' repes');
    if (summary.seconds) parts.push(summary.seconds + ' s');

    els.sessionSummary.textContent = exercises.length
      ? summary.complete + ' de ' + summary.total + ' ejercicios' +
        (parts.length ? ' · ' + parts.join(' · ') : '')
      : '';

    els.emptyWorkout.hidden = exercises.length > 0;
    els.exerciseList.hidden = exercises.length === 0;

    const frag = document.createDocumentFragment();
    exercises.forEach(function (ex) {
      frag.appendChild(buildExerciseRow(ex, dateKey, done));
    });
    els.exerciseList.textContent = '';
    els.exerciseList.appendChild(frag);

    els.btnFinishSession.textContent = done ? 'Reabrir entreno' : 'Terminar entreno';
    els.btnFinishSession.classList.toggle('btn--primary', !done);
    els.btnFinishSession.disabled = !exercises.length;

    els.sessionHint.textContent = done
      ? 'Cuenta para tu racha. La próxima vez toca ' + nextRoutineName() + '.'
      : summary.sets
        ? 'Al terminar se marca el hábito Entrenar y pasa el turno a la siguiente rutina.'
        : 'Apunta al menos una serie para que el entreno cuente.';
  }

  function nextRoutineName() {
    const routine = S.getRoutine(S.suggestedRoutineId());
    return routine ? routine.name : 'ninguna';
  }

  function buildExerciseRow(exercise, dateKey, locked) {
    const sets = S.getSets(dateKey, exercise.id);
    const complete = St.exerciseDone(exercise, sets);

    const li = el('li', {
      class: 'exercise' + (complete ? ' is-done' : ''),
      'data-id': exercise.id
    });

    const head = el('div', { class: 'exercise__head' });
    head.appendChild(el('h3', { class: 'exercise__name', text: exercise.name }));
    head.appendChild(el('p', {
      class: 'exercise__target',
      text: sets.length + '/' + exercise.sets + ' × ' + exercise.target + ' ' + unitOf(exercise)
    }));
    li.appendChild(head);

    const row = el('div', { class: 'exercise__sets' });

    sets.forEach(function (value, i) {
      const chip = el('button', {
        type: 'button',
        class: 'set-chip',
        'data-action': 'remove-set',
        'data-index': i,
        title: 'Quitar esta serie',
        'aria-label': 'Quitar la serie de ' + value + ' ' + unitOf(exercise) + ' de ' + exercise.name,
        text: String(value)
      });
      chip.disabled = locked;
      row.appendChild(chip);
    });

    if (!locked && sets.length < 20) {
      const input = el('input', {
        type: 'number',
        class: 'input set-input',
        'data-action': 'set-value',
        min: '1',
        step: '1',
        inputmode: 'numeric',
        value: String(sets.length ? sets[sets.length - 1] : exercise.target),
        'aria-label': 'Valor de la siguiente serie de ' + exercise.name
      });
      row.appendChild(input);

      row.appendChild(el('button', {
        type: 'button',
        class: 'btn set-add',
        'data-action': 'add-set',
        'aria-label': 'Añadir serie a ' + exercise.name,
        text: '+ Serie'
      }));
    }

    li.appendChild(row);
    return li;
  }

  /** Tabla completa para gestionar: rutinas en su orden de rotación. */
  function renderRoutineTable() {
    const frag = document.createDocumentFragment();
    const routines = S.getRoutines();

    if (!routines.length) {
      frag.appendChild(el('p', { class: 'card__text', text: 'No hay rutinas todavía.' }));
    }

    routines.forEach(function (routine, i) {
      const block = el('section', { class: 'routine' });

      const head = el('div', { class: 'routine__head' });
      head.appendChild(el('span', { class: 'routine__order', 'aria-hidden': 'true', text: String(i + 1) }));
      head.appendChild(el('h3', { class: 'routine__name', text: routine.name }));

      head.appendChild(el('button', {
        type: 'button', class: 'icon-btn', 'data-action': 'rename-routine', 'data-id': routine.id,
        title: 'Renombrar', 'aria-label': 'Renombrar ' + routine.name, text: '✎'
      }));
      head.appendChild(el('button', {
        type: 'button', class: 'icon-btn icon-btn--danger', 'data-action': 'delete-routine',
        'data-id': routine.id, title: 'Eliminar rutina',
        'aria-label': 'Eliminar la rutina ' + routine.name, text: '🗑'
      }));
      block.appendChild(head);

      const list = el('ul', { class: 'routine__list' });
      const exercises = S.getExercises(routine.id);

      if (!exercises.length) {
        list.appendChild(el('li', { class: 'routine__empty', text: 'Sin ejercicios.' }));
      }

      exercises.forEach(function (ex) {
        const item = el('li', { class: 'routine__item' });
        item.appendChild(el('span', { class: 'routine__item-name', text: ex.name }));
        item.appendChild(el('span', {
          class: 'routine__item-target',
          text: ex.sets + ' × ' + ex.target + ' ' + unitOf(ex)
        }));
        item.appendChild(el('button', {
          type: 'button', class: 'icon-btn', 'data-action': 'edit-exercise', 'data-id': ex.id,
          title: 'Editar', 'aria-label': 'Editar ' + ex.name, text: '✎'
        }));
        list.appendChild(item);
      });

      block.appendChild(list);
      frag.appendChild(block);
    });

    els.routineTable.textContent = '';
    els.routineTable.appendChild(frag);
  }

  function toggleWorkoutManager(open) {
    const next = open === undefined ? els.workoutManager.hidden : open;
    els.workoutManager.hidden = !next;
    els.btnManageWorkout.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) renderRoutineTable();
  }

  /* ── Modal de ejercicio ───────────────────────────────────── */

  function exField(name) {
    return els.exerciseForm.elements.namedItem(name);
  }

  function openExerciseModal(exercise) {
    const form = els.exerciseForm;
    form.reset();
    els.exNameError.hidden = true;

    els.exModalTitle.textContent = exercise ? 'Editar ejercicio' : 'Nuevo ejercicio';
    els.btnDeleteExercise.hidden = !exercise;
    form.dataset.editing = exercise ? exercise.id : '';

    const select = exField('routineId');
    select.textContent = '';
    S.getRoutines().forEach(function (r) {
      select.appendChild(el('option', { value: r.id, text: r.name }));
    });

    if (exercise) {
      exField('name').value = exercise.name;
      select.value = exercise.routineId;
      U.$$('input[name="kind"]', form).forEach(function (r) { r.checked = r.value === exercise.kind; });
      exField('sets').value = exercise.sets;
      exField('target').value = exercise.target;
    }

    lastFocused = document.activeElement;
    els.exerciseModal.hidden = false;
    document.body.style.overflow = 'hidden';
    exField('name').focus();
  }

  function closeExerciseModal() {
    els.exerciseModal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  function readExerciseForm() {
    const form = els.exerciseForm;
    const name = exField('name').value.trim();

    if (!name) {
      els.exNameError.textContent = 'Ponle un nombre al ejercicio.';
      els.exNameError.hidden = false;
      exField('name').focus();
      return null;
    }

    const kind = form.querySelector('input[name="kind"]:checked');

    return {
      name: name,
      routineId: exField('routineId').value,
      kind: kind ? kind.value : 'reps',
      sets: Number(exField('sets').value) || 3,
      target: Number(exField('target').value) || 10
    };
  }

  /* ── Selector de emojis ───────────────────────────────────── */

  function buildEmojiPicker() {
    const frag = document.createDocumentFragment();

    EMOJI_GROUPS.forEach(function (group) {
      frag.appendChild(el('p', { class: 'emoji-picker__group', text: group.name }));
      const grid = el('div', { class: 'emoji-picker__grid' });

      group.items.forEach(function (emoji) {
        grid.appendChild(el('button', {
          type: 'button', class: 'emoji-picker__item', 'data-emoji': emoji,
          'aria-pressed': 'false', text: emoji
        }));
      });

      frag.appendChild(grid);
    });

    els.emojiPicker.appendChild(frag);
  }

  function markSelectedEmoji(value) {
    U.$$('.emoji-picker__item', els.emojiPicker).forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.emoji === value ? 'true' : 'false');
    });
  }

  function toggleEmojiPicker(open) {
    const next = open === undefined ? els.emojiPicker.hidden : open;
    els.emojiPicker.hidden = !next;
    els.btnEmoji.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) markSelectedEmoji(field('icon').value.trim());
  }

  /* ── Gráfica de evolución ─────────────────────────────────
     SVG a tamaño real (no escalado por viewBox): así las
     etiquetas miden lo mismo en el móvil que en el escritorio.
     ──────────────────────────────────────────────────────── */

  const CHART = { h: 190, ml: 28, mr: 6, mt: 10, mb: 22, minW: 280 };

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  /** Barra con el extremo superior redondeado y la base a ras del eje. */
  function barPath(x, y, w, base) {
    const r = Math.min(4, w / 2, base - y);
    if (r <= 0) return 'M' + x + ',' + base + 'h' + w + 'v0z';
    return 'M' + x + ',' + base +
           'V' + (y + r) +
           'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + -r +
           'h' + (w - 2 * r) +
           'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'V' + base + 'z';
  }

  function renderChart(series, scale, periodLabel) {
    const width = Math.max(els.chart.clientWidth || 0, CHART.minW);
    const plotW = width - CHART.ml - CHART.mr;
    const plotH = CHART.h - CHART.mt - CHART.mb;
    const base = CHART.mt + plotH;

    const rate = St.seriesRate(series);
    const unit = scale === 'year' ? 'mes' : 'día';

    const svg = svgEl('svg', {
      class: 'chart__svg',
      width: width,
      height: CHART.h,
      viewBox: '0 0 ' + width + ' ' + CHART.h,
      role: 'img',
      'aria-label': 'Cumplimiento por ' + unit + ' en ' + periodLabel +
                    '. Media del periodo: ' + rate.pct + '%.'
    });

    // Degradado compartido en coordenadas del lienzo (no de cada barra): así
    // una barra alta llega al extremo claro y una baja se queda en el oscuro,
    // y la altura se lee también en el color.
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', {
      id: 'chartBarGrad', gradientUnits: 'userSpaceOnUse',
      x1: 0, y1: base, x2: 0, y2: CHART.mt
    });
    grad.appendChild(svgEl('stop', { class: 'chart__stop-a', offset: '0' }));
    grad.appendChild(svgEl('stop', { class: 'chart__stop-b', offset: '1' }));
    defs.appendChild(grad);

    // Degradado del relleno bajo la línea: del color de la serie a nada.
    const area = svgEl('linearGradient', {
      id: 'chartAreaGrad', gradientUnits: 'userSpaceOnUse',
      x1: 0, y1: CHART.mt, x2: 0, y2: base
    });
    area.appendChild(svgEl('stop', { class: 'chart__area-a', offset: '0' }));
    area.appendChild(svgEl('stop', { class: 'chart__area-b', offset: '1' }));
    defs.appendChild(area);

    svg.appendChild(defs);

    // Rejilla y eje Y, deliberadamente tenues
    [0, 25, 50, 75, 100].forEach(function (v) {
      const y = base - (v / 100) * plotH;
      svg.appendChild(svgEl('line', {
        class: 'chart__grid', x1: CHART.ml, y1: y, x2: width - CHART.mr, y2: y
      }));
      if (v % 50 === 0) {
        const label = svgEl('text', {
          class: 'chart__axis', x: CHART.ml - 6, y: y + 3, 'text-anchor': 'end'
        });
        label.textContent = v;
        svg.appendChild(label);
      }
    });

    const slot = plotW / series.length;
    const barW = Math.max(3, Math.min(slot - 2, 30));

    /* Día a día se dibuja como línea: son treinta puntos de una serie
       continua y lo que interesa es la tendencia. Mes a mes siguen siendo
       barras, que con doce valores sueltos se comparan mejor. */
    const asLine = scale !== 'year';

    if (asLine) {
      const px = function (i) { return CHART.ml + i * slot + slot / 2; };
      const py = function (p) { return base - (p.pct / 100) * plotH; };

      // Los días sin datos cortan la línea en vez de inventar un 0: se abre
      // un subtrazo nuevo después de cada hueco.
      let line = '';
      let areaPath = '';
      let open = false;

      series.forEach(function (point, i) {
        if (!point.hasData) {
          if (open) areaPath += 'L' + px(i - 1) + ',' + base + 'Z';
          open = false;
          return;
        }
        const cmd = open ? 'L' : 'M';
        line += cmd + px(i) + ',' + py(point);
        areaPath += open ? 'L' + px(i) + ',' + py(point)
                         : 'M' + px(i) + ',' + base + 'L' + px(i) + ',' + py(point);
        open = true;
      });
      if (open) areaPath += 'L' + px(series.length - 1) + ',' + base + 'Z';

      if (areaPath) svg.appendChild(svgEl('path', { class: 'chart__area', d: areaPath }));
      if (line) svg.appendChild(svgEl('path', { class: 'chart__line', d: line }));

      series.forEach(function (point, i) {
        if (!point.hasData) return;
        svg.appendChild(svgEl('circle', {
          class: 'chart__dot', cx: px(i), cy: py(point), r: 3, 'data-bar': i
        }));
      });
    }

    series.forEach(function (point, i) {
      const x = CHART.ml + i * slot + (slot - barW) / 2;

      if (!asLine) {
        // El carril marca los periodos que contaban; su ausencia marca los que no.
        if (point.hasData) {
          svg.appendChild(svgEl('rect', {
            class: 'chart__track', x: x, y: CHART.mt, width: barW, height: plotH, rx: 2
          }));
        }

        if (point.hasData && point.pct > 0) {
          const y = base - (point.pct / 100) * plotH;
          svg.appendChild(svgEl('path', {
            class: 'chart__bar', d: barPath(x, y, barW, base), 'data-bar': i
          }));
        }
      }

      if (!point.hasData) return;

      // Zona de escucha del ancho del hueco: acertar un punto fino es
      // imposible. Va encima de todo, así que lleva el tooltip nativo.
      const hit = svgEl('rect', {
        class: 'chart__hit', x: CHART.ml + i * slot, y: CHART.mt,
        width: slot, height: plotH, 'data-i': i
      });
      const title = svgEl('title');
      title.textContent = point.full + ': ' + point.pct + '% (' + point.done + ' de ' + point.total + ')';
      hit.appendChild(title);
      svg.appendChild(hit);
    });

    // Eje X: en el mes solo algunas fechas; en el año, los doce meses
    series.forEach(function (point, i) {
      const show = scale === 'year'
        ? true
        : i === 0 || (i + 1) % 5 === 0 || i === series.length - 1;
      if (!show) return;

      const label = svgEl('text', {
        class: 'chart__axis',
        x: CHART.ml + i * slot + slot / 2,
        y: CHART.h - 7,
        'text-anchor': 'middle'
      });
      label.textContent = point.label;
      svg.appendChild(label);
    });

    svg.appendChild(svgEl('line', {
      class: 'chart__baseline', x1: CHART.ml, y1: base, x2: width - CHART.mr, y2: base
    }));

    els.chart.textContent = '';
    els.chart.appendChild(svg);

    const summary = rate.total
      ? 'Media del periodo: ' + rate.pct + '% · ' + rate.done + ' de ' + rate.total + ' cumplidos'
      : 'Todavía no hay datos en este periodo.';
    els.chartReadout.dataset.summary = summary;
    els.chartReadout.textContent = summary;

    svg.addEventListener('pointerover', function (e) { showPoint(svg, e, series); });
    svg.addEventListener('pointerdown', function (e) { showPoint(svg, e, series); });
    svg.addEventListener('pointerleave', function () { clearPoint(svg); });

    renderChartTable(series, scale);
  }

  function clearPoint(svg) {
    U.$$('.is-active', svg).forEach(function (b) {
      b.classList.remove('is-active');
      if (b.tagName === 'circle') b.setAttribute('r', 3);
    });
    els.chartReadout.textContent = els.chartReadout.dataset.summary;
  }

  function showPoint(svg, e, series) {
    const hit = e.target.closest('[data-i]');
    if (!hit) return;

    clearPoint(svg);

    const i = Number(hit.dataset.i);
    const bar = svg.querySelector('[data-bar="' + i + '"]');
    if (bar) {
      bar.classList.add('is-active');
      if (bar.tagName === 'circle') bar.setAttribute('r', 5);
    }

    const point = series[i];
    els.chartReadout.textContent =
      point.full + ': ' + point.pct + '% · ' + point.done + ' de ' + point.total + ' cumplidos';
  }

  function renderChartTable(series, scale) {
    const rows = series.filter(function (p) { return p.hasData; });
    const table = els.chartTable;
    table.textContent = '';

    if (!rows.length) {
      const caption = document.createElement('caption');
      caption.textContent = 'Sin datos en este periodo.';
      table.appendChild(caption);
      return;
    }

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    [scale === 'year' ? 'Mes' : 'Día', 'Cumplidos', 'Previstos', '%'].forEach(function (text) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    rows.forEach(function (p) {
      const tr = document.createElement('tr');
      [p.full, p.done, p.total, p.pct + '%'].forEach(function (text, i) {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = text;
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
  }

  /**
   * Una fila de racha. La usan los dos bloques —hábitos normales y los que
   * se quieren dejar— para que el formato no se bifurque en dos sitios.
   * `clean` solo cambia las palabras: "3 días" frente a "3 días limpio".
   */
  const WEEK_DOT_LABEL = { done: 'cumplido', missed: 'sin cumplir', skip: 'no tocaba' };

  /**
   * Los siete últimos días como puntos. Es lo que convierte la lista en algo
   * que se lee de un vistazo: no solo cuántos días llevas, también la forma
   * que ha tenido la semana.
   */
  function weekDots(habit, todayKey) {
    const strip = el('span', { class: 'streak-item__week' });
    const partes = [];

    U.lastNDays(todayKey, 7).forEach(function (key) {
      const outcome = St.dayOutcome(habit, key);
      strip.appendChild(el('i', { class: 'streak-dot', 'data-outcome': outcome }));
      partes.push(U.formatShort(U.fromKey(key)) + ' ' + WEEK_DOT_LABEL[outcome]);
    });

    strip.setAttribute('title', partes.join(' · '));
    return strip;
  }

  function streakRow(row, clean) {
    const dias = function (n) { return n === 1 ? ' día' : ' días'; };
    const actual = row.current + dias(row.current) + (clean ? ' sin caer' : '');

    const item = el('li', { class: 'streak-item' });
    const btn = el('button', {
      type: 'button',
      class: 'streak-item__open' + (clean ? ' streak-item__open--clean' : ''),
      'data-id': row.habit.id,
      'aria-label': 'Ver ' + row.habit.name + ': ' + actual +
                    ', récord ' + row.best + dias(row.best)
    });
    btn.style.setProperty('--habit-color', row.habit.color);

    btn.appendChild(el('span', {
      class: 'streak-item__icon', 'aria-hidden': 'true', text: row.habit.icon
    }));

    const body = el('span', { class: 'streak-item__body' });
    body.appendChild(el('span', { class: 'streak-item__name', text: row.habit.name }));

    const under = el('span', { class: 'streak-item__under', 'aria-hidden': 'true' });
    under.appendChild(weekDots(row.habit, U.todayKey()));
    if (row.best > 0) {
      under.appendChild(el('span', { class: 'streak-item__best', text: 'récord ' + row.best }));
    }
    body.appendChild(under);
    btn.appendChild(body);

    const now = el('span', {
      class: 'streak-item__now' + (clean ? ' streak-item__now--clean' : ''),
      'aria-hidden': 'true'
    });
    now.appendChild(el('b', { text: String(row.current) }));
    now.appendChild(el('span', { class: 'streak-item__unit', text: dias(row.current).trim() }));
    btn.appendChild(now);

    item.appendChild(btn);
    return item;
  }

  /**
   * Malos hábitos: su propio bloque, con los días limpio. Fuera de los
   * porcentajes y fuera de la lista de rachas normal.
   */
  function renderAvoidList(dateKey) {
    const habits = S.getHabits().filter(St.isAvoid);

    els.avoidCard.hidden = habits.length === 0;
    if (!habits.length) return;

    const frag = document.createDocumentFragment();

    habits
      .map(function (h) {
        return { habit: h, current: St.currentStreak(h, dateKey), best: St.bestStreak(h, dateKey) };
      })
      .sort(function (a, b) { return b.current - a.current || b.best - a.best; })
      .forEach(function (row) { frag.appendChild(streakRow(row, true)); });

    els.avoidList.textContent = '';
    els.avoidList.appendChild(frag);
  }

  function renderStreakList(dateKey) {
    const habits = S.getHabits().filter(function (h) { return !St.isAvoid(h); });
    const frag = document.createDocumentFragment();

    const rows = habits.map(function (h) {
      return { habit: h, current: St.currentStreak(h, dateKey), best: St.bestStreak(h, dateKey) };
    });

    // Todo a cero significa que aún no hay historial, no que las rachas valgan 0
    if (!habits.length || !rows.some(function (r) { return r.current || r.best; })) {
      els.streakList.textContent = '';
      els.streakList.appendChild(el('li', {
        class: 'blank blank--row',
        text: habits.length
          ? 'Marca un hábito hoy para empezar tu primera racha.'
          : 'Todavía no hay hábitos que medir.'
      }));
      return;
    }

    rows
      .sort(function (a, b) { return b.current - a.current || b.best - a.best; })
      .forEach(function (row) { frag.appendChild(streakRow(row, false)); });

    els.streakList.textContent = '';
    els.streakList.appendChild(frag);
  }

  function renderAchievements() {
    const unlocked = S.getGame().achievements;
    const frag = document.createDocumentFragment();

    St.ACHIEVEMENTS.forEach(function (ach) {
      const has = unlocked.indexOf(ach.id) >= 0;
      const item = el('li', {
        class: 'ach' + (has ? ' is-unlocked' : ''),
        title: ach.hint,
        'aria-label': ach.name + ': ' + ach.hint + '. ' + (has ? 'Desbloqueado' : 'Bloqueado')
      });
      item.appendChild(el('p', { class: 'ach__icon', 'aria-hidden': 'true', text: ach.icon }));
      item.appendChild(el('p', { class: 'ach__name', text: ach.name }));
      frag.appendChild(item);
    });

    els.achievementGrid.textContent = '';
    els.achievementGrid.appendChild(frag);
  }

  /* ── Ficha de un hábito ───────────────────────────────────── */

  function habitSummary(habit) {
    const days = habit.activeDays.length === 7
      ? 'todos los días'
      : habit.activeDays.map(U.weekdayName).join(', ');

    let what;
    if (habit.type === 'quantity') what = habit.target.amount + ' ' + habit.target.unit + ' al día';
    else if (habit.type === 'schedule') what = habit.slots.map(function (s) { return St.SLOT_LABELS[s]; }).join(' + ');
    else what = 'Check diario';

    const reminder = habit.reminder.enabled ? ' · recordatorio a las ' + habit.reminder.time : '';
    return what + ' · ' + days + reminder;
  }

  function renderHabitView(habit, monthDate, todayKey) {
    const weekStart = S.getSettings().weekStart;

    els.habitIcon.textContent = habit.icon;
    els.habitTitle.textContent = habit.name;
    els.habitMeta.textContent = habitSummary(habit);
    els.views.habit.style.setProperty('--habit-color', habit.color);

    els.hStreak.textContent = St.currentStreak(habit, todayKey);
    els.hBest.textContent = St.bestStreak(habit, todayKey);

    const rate = St.habitRate(habit, todayKey, 30);
    els.hRate.textContent = rate.total ? rate.pct + '%' : '—';
    els.hTotal.textContent = St.habitTotal(habit);

    // Solo la etiqueta: el botón lleva un SVG dentro y textContent lo borraría.
    const archiveLabel = habit.archived ? 'Restaurar hábito' : 'Archivar hábito';
    els.btnArchiveHabit.title = archiveLabel;
    els.btnArchiveHabit.setAttribute('aria-label', archiveLabel);
    els.btnArchiveHabit.classList.toggle('is-on', habit.archived);

    renderHabitHeatmap(habit, monthDate, weekStart, todayKey);
    renderWeekBars(habit, todayKey, weekStart);
  }

  function renderHabitHeatmap(habit, monthDate, weekStart, todayKey) {
    const cells = U.monthGrid(monthDate.getFullYear(), monthDate.getMonth(), weekStart);
    const frag = document.createDocumentFragment();

    U.weekdayLabels(weekStart).forEach(function (label) {
      frag.appendChild(el('div', { class: 'heatmap__dow', 'aria-hidden': 'true', text: label }));
    });

    cells.forEach(function (key) {
      if (!key) { frag.appendChild(heatCell(null)); return; }

      const level = St.habitDayLevel(habit, key);
      const date = U.formatShort(U.fromKey(key));
      const label = level === null
        ? date + ': no tocaba'
        : date + ': ' + (St.isComplete(habit, S.getLog(habit.id, key)) ? 'cumplido' : 'sin cumplir');

      frag.appendChild(heatCell(key, level, label, {
        isToday: key === todayKey, frozen: S.isFrozen(key), future: key > todayKey
      }));
    });

    els.habitHeatmap.textContent = '';
    els.habitHeatmap.appendChild(frag);
    els.hMonthLabel.textContent = U.formatMonth(monthDate);
  }

  function renderWeekBars(habit, todayKey, weekStart) {
    const rows = St.habitWeekdayRates(habit, todayKey, weekStart);
    const frag = document.createDocumentFragment();

    rows.forEach(function (row) {
      const item = el('li', {
        class: 'weekbar',
        'aria-label': row.name + ': ' + (row.total ? row.pct + '%, ' + row.done + ' de ' + row.total : 'sin datos')
      });
      item.appendChild(el('span', { class: 'weekbar__day', 'aria-hidden': 'true', text: row.name }));

      const track = el('div', { class: 'weekbar__track' });
      const fill = el('div', { class: 'weekbar__fill' });
      fill.style.setProperty('--pct', row.pct);
      track.appendChild(fill);
      item.appendChild(track);

      item.appendChild(el('span', {
        class: 'weekbar__pct', 'aria-hidden': 'true',
        text: row.total ? row.pct + '%' : '–'
      }));
      frag.appendChild(item);
    });

    els.weekBars.textContent = '';
    els.weekBars.appendChild(frag);

    const gap = St.weakestWeekday(rows);
    els.weekInsight.textContent = gap
      ? 'Los ' + gap.worst.name.toLowerCase() + ' cumples el ' + gap.worst.pct +
        '% y los ' + gap.best.name.toLowerCase() + ' el ' + gap.best.pct + '%.'
      : 'Aún no hay suficientes datos para ver un patrón por día.';
  }

  /* ── Ajustes ──────────────────────────────────────────────── */

  function renderSettings() {
    const s = S.getSettings();
    els.setStartWeek.value = String(s.weekStart);
    els.setAccent.value = s.accent;
    els.setNotifications.setAttribute('aria-checked', s.notificationsEnabled ? 'true' : 'false');
    els.setEffects.setAttribute('aria-checked', s.effects ? 'true' : 'false');
    renderArchived();
    renderBuildInfo();
  }

  /**
   * Qué versión está corriendo y, sobre todo, si el service worker sigue
   * sirviendo una caché antigua — que es la causa habitual de "he subido los
   * cambios y el móvil no los ve".
   */
  function renderBuildInfo() {
    els.buildVersion.textContent = U.buildLabel();
    els.buildOrigin.textContent = location.protocol === 'file:'
      ? 'Archivo local'
      : location.host;

    els.buildHint.textContent = '';
    els.buildCache.dataset.state = 'plain';

    // Se comprueba el protocolo y no isSecureContext: file:// cuenta como
    // contexto seguro, pero su CacheStorage no se puede leer.
    if (location.protocol === 'file:' || !window.caches) {
      els.buildCache.textContent = 'No aplica aquí';
      els.buildHint.textContent = 'Abierta como archivo local: no hay caché offline, ' +
                                  'así que siempre ves la última versión guardada.';
      return;
    }

    const esperada = 'habitos-v' + U.version;
    els.buildCache.textContent = 'Comprobando…';

    caches.keys().then(function (keys) {
      const mias = keys.filter(function (k) { return k.indexOf('habitos-') === 0; });

      if (!mias.length) {
        els.buildCache.textContent = 'Sin instalar';
        els.buildHint.textContent = 'Todavía no se ha guardado una copia offline.';
        return;
      }

      const vieja = mias.indexOf(esperada) < 0;
      els.buildCache.textContent = mias.join(', ');
      els.buildCache.dataset.state = vieja ? 'stale' : 'ok';
      els.buildHint.textContent = vieja
        ? 'La copia guardada no coincide con ' + esperada +
          '. Cierra la app del todo y ábrela otra vez para que se actualice.'
        : 'Al día: la copia offline coincide con esta versión.';
    }).catch(function () {
      els.buildCache.textContent = 'No se pudo leer';
    });
  }

  function renderArchived() {
    const archived = S.getArchivedHabits();
    els.archivedCard.hidden = archived.length === 0;
    if (!archived.length) return;

    const frag = document.createDocumentFragment();
    archived.forEach(function (habit) {
      const item = el('li', { class: 'archive-item' });
      item.appendChild(el('span', { 'aria-hidden': 'true', text: habit.icon }));
      item.appendChild(el('span', { text: habit.name }));
      item.appendChild(el('button', {
        type: 'button', class: 'btn btn--ghost', 'data-restore': habit.id,
        'aria-label': 'Restaurar ' + habit.name, text: 'Restaurar'
      }));
      frag.appendChild(item);
    });

    els.archiveList.textContent = '';
    els.archiveList.appendChild(frag);
  }

  /** El color elegido en Ajustes deriva el acento y los 4 niveles del heatmap. */
  function applyAccent(hex) {
    const root = document.documentElement.style;
    root.setProperty('--accent', hex);
    root.setProperty('--accent-hover', lighten(hex, 0.16));
    // Aclarado para que el acento siga cumpliendo contraste como texto,
    // sea cual sea el color que elija el usuario.
    root.setProperty('--accent-text', lighten(hex, 0.42));
    root.setProperty('--accent-soft', rgba(hex, 0.16));
    root.setProperty('--heat-1', rgba(hex, 0.28));
    root.setProperty('--heat-2', rgba(hex, 0.50));
    root.setProperty('--heat-3', rgba(hex, 0.74));
    root.setProperty('--heat-4', hex);
  }

  function channels(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(hex, alpha) {
    return 'rgb(' + channels(hex).join(' ') + ' / ' + alpha + ')';
  }

  /** Mezcla hacia el blanco para el estado hover. */
  function lighten(hex, amount) {
    const mixed = channels(hex).map(function (c) {
      return Math.round(c + (255 - c) * amount);
    });
    return 'rgb(' + mixed.join(' ') + ')';
  }

  /* ── Modal ────────────────────────────────────────────────── */

  /**
   * Acceso explícito a los campos del formulario. `form.name` devolvería
   * el atributo del propio <form> en lugar del input, así que se pide
   * siempre por la colección de controles.
   */
  function field(name) {
    return els.habitForm.elements.namedItem(name);
  }

  function openModal(habit) {
    const form = els.habitForm;
    form.reset();
    els.fNameError.hidden = true;
    els.fName.removeAttribute('aria-invalid');

    els.modalTitle.textContent = habit ? 'Editar hábito' : 'Nuevo hábito';
    els.btnDeleteHabit.hidden = !habit;
    form.dataset.editing = habit ? habit.id : '';

    if (habit) {
      field('name').value = habit.name;
      field('icon').value = habit.icon;
      field('color').value = habit.color;
      els.fCategory.value = habit.category || '';
      if (habit.type === 'avoid') els.fLimit.value = St.limitOf(habit);
      U.$$('input[name="type"]', form).forEach(function (r) { r.checked = r.value === habit.type; });

      if (habit.type === 'quantity') {
        field('target').value = habit.target.amount;
        field('unit').value = habit.target.unit;
        field('step').value = habit.target.step;
        U.$$('input[name="entry"]', form).forEach(function (r) {
          r.checked = r.value === habit.target.entry;
        });
      }
      U.$$('input[name="slots"]', form).forEach(function (c) {
        c.checked = habit.type === 'schedule' && habit.slots.indexOf(c.value) >= 0;
      });
      U.$$('input[name="days"]', form).forEach(function (c) {
        c.checked = habit.activeDays.indexOf(Number(c.value)) >= 0;
      });

      setReminder(habit.reminder.enabled, habit.reminder.time);
    } else {
      U.$$('input[name="days"]', form).forEach(function (c) { c.checked = true; });
      setReminder(false, '08:00');
    }

    syncTypeFields();
    toggleEmojiPicker(false);
    markSelectedEmoji(field('icon').value.trim());

    lastFocused = document.activeElement;
    els.habitModal.hidden = false;
    document.body.style.overflow = 'hidden';
    els.fName.focus();
  }

  function closeModal() {
    els.habitModal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  /** Muestra solo los campos del tipo elegido. */
  function syncTypeFields() {
    const checked = els.habitForm.querySelector('input[name="type"]:checked');
    const type = checked ? checked.value : 'check';
    const entry = els.habitForm.querySelector('input[name="entry"]:checked');

    els.quantityFields.hidden = type !== 'quantity';
    els.entryFields.hidden = type !== 'quantity';
    els.slotFields.hidden = type !== 'schedule';
    // "Dejar" invierte la lógica: conviene decirlo antes de guardar, no después.
    els.avoidHint.hidden = type !== 'avoid';
    els.limitField.hidden = type !== 'avoid';

    // El incremento solo significa algo si se registra con los botones
    els.stepField.hidden = !entry || entry.value !== 'stepper';
  }

  function setReminder(enabled, time) {
    els.fReminderSwitch.setAttribute('aria-checked', enabled ? 'true' : 'false');
    els.fReminder.disabled = !enabled;
    if (time) els.fReminder.value = time;
  }

  function isReminderOn() {
    return els.fReminderSwitch.getAttribute('aria-checked') === 'true';
  }

  function showFieldError(message) {
    els.fNameError.textContent = message;
    els.fNameError.hidden = false;
  }

  /** Lee el formulario. Devuelve null y marca el error si no es válido. */
  function readForm() {
    const form = els.habitForm;
    const name = field('name').value.trim();

    if (!name) {
      showFieldError('Ponle un nombre al hábito.');
      els.fName.setAttribute('aria-invalid', 'true');
      els.fName.focus();
      return null;
    }

    const type = form.querySelector('input[name="type"]:checked').value;
    const days = U.$$('input[name="days"]:checked', form).map(function (c) { return Number(c.value); });

    if (!days.length) {
      showFieldError('Elige al menos un día de la semana.');
      return null;
    }

    const data = {
      name: name,
      icon: field('icon').value.trim() || '✨',
      color: field('color').value,
      category: els.fCategory.value || null,
      type: type,
      activeDays: days,
      reminder: { enabled: isReminderOn(), time: field('reminderTime').value || '08:00' }
    };

    if (type === 'avoid') data.limit = Number(els.fLimit.value) || 2;

    if (type === 'quantity') {
      const entry = form.querySelector('input[name="entry"]:checked');
      data.target = {
        amount: Number(field('target').value) || 1,
        unit: field('unit').value.trim() || 'ud',
        step: Number(field('step').value) || 1,
        entry: entry ? entry.value : 'stepper'
      };
    }

    if (type === 'schedule') {
      const slots = U.$$('input[name="slots"]:checked', form).map(function (c) { return c.value; });
      if (!slots.length) {
        showFieldError('Elige al menos una franja del día.');
        return null;
      }
      data.slots = slots;
    }

    return data;
  }

  /* ── Toasts ───────────────────────────────────────────────── */

  /** toast('Hecho', { type:'success', icon:'✓', action:{label, onClick} }) */
  function toast(message, opts) {
    const o = opts || {};
    const node = el('div', { class: 'toast' + (o.type ? ' toast--' + o.type : '') });

    if (o.icon) node.appendChild(el('span', { class: 'toast__icon', 'aria-hidden': 'true', text: o.icon }));
    node.appendChild(el('span', { class: 'toast__text', text: message }));

    let life = 3000;

    if (o.action) {
      // La pila ignora el ratón; solo el toast accionable lo recupera.
      node.classList.add('toast--action');
      const btn = el('button', { type: 'button', class: 'toast__action', text: o.action.label });
      btn.addEventListener('click', function () {
        o.action.onClick();
        node.remove();
      });
      node.appendChild(btn);
      life = 7000;      // hace falta tiempo real para leer y decidir
    }

    els.toastStack.appendChild(node);

    setTimeout(function () {
      if (!node.isConnected) return;
      node.classList.add('is-leaving');
      node.addEventListener('animationend', function () { node.remove(); }, { once: true });
      setTimeout(function () { node.remove(); }, 400);   // red de seguridad
    }, life);
  }

  /* ── Confeti ──────────────────────────────────────────────
     Canvas en vez de cientos de nodos: se dibuja, se limpia y
     no deja nada en el DOM. ───────────────────────────────── */

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function celebrate() {
    if (prefersReducedMotion()) return;

    const canvas = els.confetti;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    canvas.hidden = false;

    // El primer color sale del token: el confeti sigue al acento elegido
    // en lugar de llevar el violeta original escrito a mano.
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || U.DEFAULT_ACCENT;
    const colors = [accent, '#3ddc97', '#38bdf8', '#ffb454', '#fb7185'];
    const pieces = [];
    for (let i = 0; i < 90; i++) {
      pieces.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.5,
        y: h * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -11 - 3,
        size: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    const started = performance.now();

    function frame(now) {
      const elapsed = now - started;
      ctx.clearRect(0, 0, w, h);

      pieces.forEach(function (p) {
        p.vy += 0.32;               // gravedad
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < 2600) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        canvas.hidden = true;
      }
    }

    requestAnimationFrame(frame);
  }

  function buzz(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (err) { /* el navegador puede negarse */ }
    }
  }

  return {
    els: els, init: init, setView: setView,
    renderHeader: renderHeader, renderHabitList: renderHabitList, updateCard: updateCard,
    renderDayExtras: renderDayExtras, pulse: pulse,
    renderWeek: renderWeek,
    renderExercises: renderExercises, renderRoutineTable: renderRoutineTable,
    toggleWorkoutManager: toggleWorkoutManager,
    openExerciseModal: openExerciseModal, closeExerciseModal: closeExerciseModal,
    readExerciseForm: readExerciseForm,
    renderProgress: renderProgress, renderLevelPanel: renderLevelPanel,
    showLevelUp: showLevelUp, renderHabitView: renderHabitView,
    renderSettings: renderSettings, applyAccent: applyAccent,
    openModal: openModal, closeModal: closeModal,
    toggleEmojiPicker: toggleEmojiPicker, markSelectedEmoji: markSelectedEmoji,
    syncTypeFields: syncTypeFields, setReminder: setReminder, isReminderOn: isReminderOn,
    readForm: readForm, toast: toast, celebrate: celebrate, buzz: buzz
  };
})();
