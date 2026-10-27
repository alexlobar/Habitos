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
  let missingIds = [];      // ids que no estaban en el HTML al arrancar

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
  // Progreso ya no tiene botón en la barra: se entra por la chapa del rango.
  // Como ningún `data-view` vale 'progress', no se marca nada, igual que
  // pasa con la ficha de un hábito.
  const NAV_OF_VIEW = {
    today: 'today', week: 'week', notes: 'notes',
    progress: 'progress', habit: 'today', plan: 'plan', settings: 'settings'
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
      'brandMark', 'streakChip', 'streakNum',
      'levelBadge', 'levelRing', 'levelNum', 'levelRankLetter', 'pointsValue',
      'todayTime', 'todayMeta', 'todayLabel',
      'doneCount', 'totalCount', 'dayProgress', 'dayProgressFill',
      'prevDay', 'nextDay', 'btnToday',
      'btnPickDay', 'dayPicker', 'dpPrev', 'dpNext', 'dpLabel', 'dpGrid', 'dpToday',
      'habitList', 'emptyToday', 'dayActions', 'btnFreeze', 'freezeLabel', 'freezeHint',
      'freezeIcon', 'dayNote',
      'dayModal', 'dayForm', 'dayModalTitle', 'dayIntro', 'dayReasons', 'dayNoteField',
      'dayReasonNote', 'daySkip', 'daySkipRow', 'daySkipHint', 'btnClearDay',
      'streakHabits', 'streakHabitsHint', 'streakActivity',
      'setStreakGoal', 'streakGoalHint',
      'weightEntryCard', 'weightInput', 'weightHint', 'setShowWeight',
      'weightCard', 'weightStats', 'weightChart', 'weightLegend', 'weightEmpty',
      'pausedNote', 'pausedNoteText',
      'pauseModal', 'pauseForm', 'pauseReasons', 'pauseNoteField', 'pauseNote', 'pauseIntro',
      'pauseModalTitle', 'pauseBanner', 'pauseBannerTitle', 'pauseBannerMeta', 'pauseBannerIcon',
      'btnPauseHabit', 'btnResumeHabit',
      'statWeek', 'statMonth', 'statStreak', 'statBest',
      'levelPanel', 'lvNumber', 'lvRank', 'lvRankLetter', 'lvBar', 'lvFill', 'lvXp', 'lvRemaining',
      'lvGhost', 'lvAhead', 'statWeekGhost', 'statWeekAhead', 'statMonthGhost', 'statMonthAhead',
      'attrList', 'statQuests', 'statTrophies',
      'ascents', 'ascentsCount', 'ascentsList', 'ascentsNote',
      'levelUp', 'levelUpLevel', 'levelUpRank', 'levelUpHint',
      'heatmap', 'yearScroll', 'yearGrid', 'monthLabel', 'streakList', 'achievementGrid',
      'avoidCard', 'avoidList', 'achCard', 'achCount',
      'statWeekBar', 'statMonthBar',
      'chart', 'chartTitle', 'chartReadout', 'chartTable', 'chartEmpty', 'chartData',
      'calendarEmpty', 'calendarEmptyText', 'heatmapLegend',
      'weekGrid', 'weekLabel', 'weekSummary', 'weekTotals', 'emptyWeek', 'btnThisWeek',
      'hChartCard', 'habitChart', 'hChartReadout',
      'emojiPicker', 'btnEmoji',
      'habitIcon', 'habitTitle', 'habitMeta', 'hStreak', 'hBest', 'hRate', 'hTotal',
      'hSumsCard', 'hSumWeek', 'hSumMonth', 'hSumTotal', 'hSumAvg', 'hSumBest',
      'hSumDays', 'hSumsNote', 'hSumTotalLabel', 'hSumBestLabel', 'hSumDaysLabel', 'hChartTitle',
      'habitHeatmap', 'hMonthLabel', 'weekBars', 'weekInsight', 'btnArchiveHabit',
      'habitModal', 'habitForm', 'modalTitle', 'btnDeleteHabit',
      'setAccent', 'btnResetAccent', 'setEffects',
      'setControls', 'allHabitsCount', 'setTheme', 'setFontSize', 'setBackup',
      'backupStatus', 'backupIcon', 'backupTitle', 'backupHint', 'btnBackupNow',
      'setHideDone', 'setDayBar', 'setShowFreeze', 'setShowNotes',
      'btnResetProgress', 'noteCard', 'btnBackFromProgress',
      'notesToday', 'notesTodayLabel', 'notesSearch', 'notesList', 'notesCount',
      'emptyNotes', 'emptyNotesTitle', 'emptyNotesText',
      'archivedCard', 'archiveList', 'toastStack', 'confetti',
      'buildCache', 'buildQuota', 'buildPersist', 'buildHint', 'installRow', 'btnInstall',
      'quantityFields', 'stepField', 'entryFields', 'slotFields', 'avoidHint',
      'fCategory', 'limitField', 'fLimit', 'avoidModeFields', 'capHint', 'fTargetLabel',
      'fName', 'fNameError',
      'weekRecap', 'recapRange', 'btnRecapClose', 'recapStats', 'recapLines', 'btnRecapPlan',
      'btnPlanWeek', 'planRange', 'planStatus', 'planLock', 'planHint',
      'planList', 'planEmpty', 'planActions', 'btnPlanConfirm', 'btnPlanReset',
      'planNote', 'planNoteText', 'pausedNoteIcon',
      'btnAddAbsence', 'absenceList', 'absenceModal', 'absenceForm', 'absenceFrom', 'absenceTo',
      'absenceLength', 'absenceReasons', 'absenceNote', 'absenceHabits',
      'weightLegendGoal', 'weightGoalInput', 'weightGoalText',
      'btnAddFreeNote', 'freeNotesList', 'freeNotesHint'
    ].forEach(function (id) { els[id] = document.getElementById(id); });

    // Un id que falte daría un "Cannot read properties of null" veinte líneas
    // más abajo. Antes esto lanzaba, y lanzar aquí mata la app entera: se
    // quedaba pintada pero sin un solo manejador, que es peor que un error
    // —parece que la pantalla no responde y no dice por qué—.
    //
    // Ahora cada hueco se rellena con un nodo suelto que no está en el
    // documento. Lo que dependa de él no se verá, pero todo lo demás sigue
    // funcionando, y la lista de lo que falta se enseña al arrancar.
    missingIds = Object.keys(els).filter(function (id) { return !els[id]; });
    missingIds.forEach(function (id) { els[id] = document.createElement('span'); });

    if (missingIds.length) {
      console.error('Faltan estos elementos en index.html: ' + missingIds.join(', '));
    }

    els.views = {
      today: $('#view-today'),
      week: $('#view-week'),
      progress: $('#view-progress'),
      habit: $('#view-habit'),
      notes: $('#view-notes'),
      plan: $('#view-plan'),
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

    // Un campo oculto mide scrollHeight 0, así que si su contenido cambió
    // mientras la vista no se veía, se habría quedado del alto mínimo. Aquí
    // ya está visible y se puede medir de verdad.
    U.$$('.note-grow', view).forEach(growField);
  }

  /* ── Cabecera ─────────────────────────────────────────────── */

  function renderHeader(dateKey, todayKey) {
    const date = U.fromKey(dateKey);
    const day = St.dayStats(dateKey);
    const info = St.levelInfo(S.getGame().points);
    const isToday = dateKey === todayKey;

    // Arriba el día de la semana; debajo la fecha, y "Hoy" solo cuando lo es
    // —si no, un "sábado" a secas no dice si estás mirando este o el pasado—.
    els.todayTime.textContent = U.weekdayLong(date);
    els.todayTime.setAttribute('datetime', dateKey);
    els.todayMeta.textContent = (isToday ? 'Hoy · ' : '') + U.formatShort(date);

    // No se registra en el futuro: no tendría sentido marcar mañana.
    els.nextDay.disabled = isToday;
    els.btnToday.hidden = isToday;

    els.doneCount.textContent = day.done;
    els.totalCount.textContent = day.total;

    els.dayProgressFill.style.setProperty('--pct', day.pct);
    els.dayProgress.setAttribute('aria-valuenow', day.pct);
    els.dayProgress.setAttribute('aria-valuetext', day.done + ' de ' + day.total + ' hábitos');

    renderStreakChip(todayKey);

    els.levelNum.textContent = info.level;
    els.levelRankLetter.textContent = info.rank.letter;
    els.levelBadge.dataset.rank = info.rank.id;
    els.pointsValue.textContent = info.xp;
    els.levelRing.style.setProperty('--ring-pct', info.pct);
    els.levelBadge.setAttribute(
      'aria-label',
      'Nivel ' + info.level + ', rango ' + info.rank.name + ', ' + info.xp +
      ' de XP. Faltan ' + info.remaining + ' para el nivel ' + (info.level + 1) +
      '. Ver progreso'
    );
  }

  /**
   * El contador de constancia. Siempre se calcula sobre HOY, aunque estés
   * mirando otro día: la racha es un dato del presente, no del día que
   * tengas abierto en pantalla.
   */
  function renderStreakChip(todayKey) {
    const dias = St.dayStreak(todayKey);
    const riesgo = dias > 0 && St.streakAtRisk(todayKey);

    // Con la racha a cero no se enseña un "0" apagado: se devuelve el rombo.
    els.streakChip.hidden = dias === 0;
    els.brandMark.hidden = dias > 0;
    if (!dias) return;

    els.streakNum.textContent = dias;
    els.streakChip.dataset.state = riesgo ? 'risk' : 'on';
    els.streakChip.setAttribute('aria-label',
      dias + (dias === 1 ? ' día seguido' : ' días seguidos') + ' cumpliendo' +
      (riesgo ? '. Hoy todavía no' : ''));
    els.streakChip.title = streakMessage(todayKey);
  }

  /** El mensaje que explica las dos rachas al tocar el contador. */
  function streakMessage(todayKey) {
    const habitos = St.dayStreak(todayKey);
    const actividad = St.activityStreak(todayKey);
    const meta = St.streakGoalFor(todayKey);

    const partes = [];
    partes.push(habitos
      ? habitos + (habitos === 1 ? ' día cumpliendo' : ' días cumpliendo')
      : 'Sin racha de cumplimiento');
    if (actividad) partes.push(actividad + ' registrando');

    const base = partes.join(' · ') + '.';

    if (St.streakAtRisk(todayKey)) {
      return base + ' Hoy te faltan ' + meta + ' ' +
        (meta === 1 ? 'hábito' : 'hábitos') + ' para mantenerla.';
    }
    return habitos
      ? base
      : base + ' Cumple ' + meta + ' ' + (meta === 1 ? 'hábito' : 'hábitos') + ' hoy y empieza.';
  }

  /* ── Nivel y rango ────────────────────────────────────────
     Solo pinta: todas las cuentas vienen de St.levelInfo(), que es quien
     conoce la curva de experiencia. ─────────────────────────── */

  const fmtNum = new Intl.NumberFormat('es-ES');

  function renderLevelPanel() {
    const info = St.levelInfo(S.getGame().points);

    setStat(els.lvNumber, String(info.level));
    els.lvRank.textContent = info.rank.name;
    els.lvRankLetter.textContent = info.rank.letter;
    els.levelPanel.dataset.rank = info.rank.id;

    // La cifra tiene que contar lo mismo que la barra. Antes ponía la EXP
    // total contra la del siguiente nivel ("100 / 250") mientras la barra
    // medía el avance dentro del nivel: al entrar en un nivel se leía
    // "100 / 250" con la barra a cero, que parecía una barra rota.
    els.lvXp.textContent = fmtNum.format(info.into) + ' / ' + fmtNum.format(info.needed) + ' EXP';
    els.lvRemaining.textContent = fmtNum.format(info.remaining) +
      ' EXP para subir · ' + fmtNum.format(info.xp) + ' en total';

    els.lvFill.style.setProperty('--pct', info.pct);
    els.lvBar.setAttribute('aria-valuenow', info.pct);

    // Previsión: hasta dónde llegaría la barra cumpliendo lo que falta hoy.
    const pend = St.pendingToday(U.todayKey());
    const previsto = pend.xp
      ? U.clamp(Math.round(((info.into + pend.xp) / info.needed) * 100), info.pct, 100)
      : 0;

    els.lvGhost.hidden = !pend.xp;
    els.lvGhost.style.setProperty('--pct', previsto);

    els.lvAhead.hidden = !pend.xp;
    els.lvAhead.textContent = pend.xp
      ? '+' + fmtNum.format(pend.xp) + ' EXP si cumples ' +
        (pend.habits === 1 ? 'el que falta hoy' : 'los ' + pend.habits + ' que faltan hoy')
      : '';

    els.lvBar.setAttribute(
      'aria-valuetext',
      fmtNum.format(info.into) + ' de ' + fmtNum.format(info.needed) +
      ' EXP del nivel ' + info.level + ' · rango ' + info.rank.letter + ', ' + info.rank.name +
      (pend.xp ? ' · ' + fmtNum.format(pend.xp) + ' EXP disponibles hoy' : '')
    );
  }

  /**
   * Las dos rachas, juntas y con su regla a la vista. Separadas no se
   * entenderían: una mide cumplir y la otra aparecer, y el valor está en
   * verlas al lado para saber cuál de las dos estás fallando.
   */
  function renderStreakPair(dateKey) {
    const hoy = U.todayKey();
    const meta = St.streakGoalFor(hoy);

    setStat(els.streakHabits, String(St.dayStreak(hoy)));
    setStat(els.streakActivity, String(St.activityStreak(hoy)));

    els.streakHabitsHint.textContent = meta
      ? 'Días seguidos con al menos ' + meta + ' ' +
        (meta === 1 ? 'hábito cumplido' : 'hábitos cumplidos') + '.'
      : 'Días seguidos cumpliendo el listón del día.';
  }

  /**
   * Los ascensos, del más reciente al más antiguo. Es lo único de Progreso
   * que mira al pasado en vez de al presente, así que va plegado: se consulta
   * de vez en cuando, no cada día.
   */
  function renderAscents() {
    const log = S.getLevelLog();
    const base = Math.max(0, Number(S.getGame().levelLogFrom) || 0);

    els.ascentsCount.textContent = String(log.length);
    els.ascentsList.textContent = '';

    if (!log.length) {
      els.ascentsList.appendChild(el('li', {
        class: 'ascent ascent--empty',
        text: base > 0
          ? 'Nada apuntado todavía: tu próxima subida será la primera con fecha.'
          : 'Aún no has subido de nivel. El primer ascenso se apuntará aquí.'
      }));
    } else {
      const hoy = U.todayKey();
      const anio = U.fromKey(hoy).getFullYear();
      const frag = document.createDocumentFragment();

      log.slice().reverse().forEach(function (entry) {
        const rank = St.rankForLevel(entry.level);
        // Un ascenso estrena rango si el nivel anterior pertenecía a otro.
        const nuevoRango = St.rankForLevel(entry.level - 1).id !== rank.id;

        const item = el('li', { class: 'ascent', 'data-rank': rank.id });
        item.appendChild(el('span', {
          class: 'ascent__letter', 'aria-hidden': 'true', text: rank.letter
        }));

        const main = el('div', { class: 'ascent__main' });
        main.appendChild(el('p', { class: 'ascent__level', text: 'Nivel ' + entry.level }));
        if (nuevoRango) {
          main.appendChild(el('p', { class: 'ascent__rank', text: 'Nuevo rango · ' + rank.name }));
        }
        item.appendChild(main);

        const fecha = U.fromKey(entry.date);
        const dias = U.daysBetween(entry.date, hoy);
        let etiqueta = U.formatShort(fecha);
        // El año solo estorba mientras sea el actual.
        if (fecha.getFullYear() !== anio) etiqueta += ' ' + fecha.getFullYear();
        if (dias === 0) etiqueta = 'Hoy';
        else if (dias === 1) etiqueta = 'Ayer';

        item.appendChild(el('time', {
          class: 'ascent__date',
          datetime: entry.date,
          title: U.formatLong(fecha),
          text: etiqueta
        }));

        frag.appendChild(item);
      });

      els.ascentsList.appendChild(frag);
    }

    // Quien ya tenía nivel antes de que existiera el registro merece saber
    // por qué su historia empieza a medias, en vez de pensar que se ha perdido.
    els.ascentsNote.hidden = base < 1;
    if (base >= 1) {
      els.ascentsNote.textContent = 'El registro arranca en el nivel ' + base +
        ': las subidas anteriores no llegaron a guardarse.';
    }
  }

  /**
   * Los cinco atributos. Los números los calcula St.attributes() a partir
   * de métricas que ya existían; aquí solo se pintan como barras.
   */
  function renderAttributes(dateKey) {
    const frag = document.createDocumentFragment();

    St.attributes(dateKey).forEach(function (attr) {
      const item = el('li', {
        class: 'attr',
        'aria-label': attr.code + ', ' + attr.name + ': ' + attr.value + ' sobre 100. ' + attr.detail
      });

      const head = el('div', { class: 'attr__head', 'aria-hidden': 'true' });
      head.appendChild(el('span', { class: 'attr__code', text: attr.code }));
      head.appendChild(el('span', { class: 'attr__name', text: attr.name }));
      head.appendChild(el('span', { class: 'attr__value', text: String(attr.value) }));
      item.appendChild(head);

      const track = el('div', { class: 'attr__track', 'aria-hidden': 'true' });
      const fill = el('span', { class: 'attr__fill' });
      fill.style.setProperty('--pct', attr.value);
      track.appendChild(fill);
      item.appendChild(track);

      item.appendChild(el('p', { class: 'attr__detail', 'aria-hidden': 'true', text: attr.detail }));
      frag.appendChild(item);
    });

    els.attrList.textContent = '';
    els.attrList.appendChild(frag);
  }

  /**
   * Celebración de subida de nivel. app.js decide CUÁNDO se ha subido;
   * esto decide solo cómo se enseña, así que cambiar la animación no
   * toca la detección.
   */
  let levelUpTimer = null;

  function hideLevelUp() {
    clearTimeout(levelUpTimer);
    levelUpTimer = null;
    els.levelUp.hidden = true;
    els.levelUp.classList.remove('is-open');
  }

  /**
   * Ventana de subida de nivel. Se cierra sola, y también al tocarla o con
   * Escape: un aviso a pantalla completa que no se puede quitar molesta.
   * Sin efectos activados se queda en el aviso de siempre.
   */
  function showLevelUp(level, rankName, rank) {
    const badge = els.levelBadge;
    badge.classList.remove('is-levelup');
    void badge.offsetWidth;                 // reinicia la animación
    badge.classList.add('is-levelup');
    badge.addEventListener('animationend', function () {
      badge.classList.remove('is-levelup');
    }, { once: true });

    if (!S.getSettings().effects || prefersReducedMotion()) {
      toast('Nivel ' + level + ' · rango ' + rankName, { type: 'achievement', icon: '⬆' });
      return;
    }

    // Un rango nuevo solo se anuncia si el nivel es justo su frontera.
    const nuevoRango = !!rank && rank.from === level;

    els.levelUpLevel.textContent = 'Nivel ' + level;
    els.levelUpRank.textContent = 'Nuevo rango · ' + rank.letter + ' — ' + rankName;
    els.levelUpRank.hidden = !nuevoRango;
    els.levelUpHint.textContent = nuevoRango
      ? 'Has ascendido de rango'
      : 'Rango ' + (rank ? rank.letter : '') + ' · ' + rankName;

    clearTimeout(levelUpTimer);
    els.levelUp.hidden = false;
    void els.levelUp.offsetWidth;
    els.levelUp.classList.add('is-open');

    levelUpTimer = setTimeout(hideLevelUp, nuevoRango ? 4200 : 3200);

    celebrate();
    buzz([30, 50, 30, 50, 60]);
  }

  /* ── Selector de día ──────────────────────────────────────
     Un mes en pequeño colgado de la cabecera. Reutiliza la misma rejilla
     y los mismos niveles de color que el calendario de Progreso, así que
     al elegir un día ya se ve cómo te fue. ──────────────────── */

  function renderDayPicker(monthDate, currentDate, todayKey) {
    const weekStart = S.getSettings().weekStart;
    const frag = document.createDocumentFragment();

    U.weekdayLabels(weekStart).forEach(function (letra) {
      frag.appendChild(el('span', { class: 'dp-dow', 'aria-hidden': 'true', text: letra }));
    });

    U.monthGrid(monthDate.getFullYear(), monthDate.getMonth(), weekStart)
      .forEach(function (key) {
        if (!key) { frag.appendChild(el('span', { class: 'dp-gap', 'aria-hidden': 'true' })); return; }

        const day = St.dayStats(key);
        const futuro = key > todayKey;
        const cell = el('button', {
          type: 'button',
          class: 'dp-day',
          'data-date': key,
          'data-level': String(St.heatLevel(day) || 0),
          'data-today': key === todayKey ? 'true' : null,
          'aria-current': key === currentDate ? 'date' : null,
          'aria-label': dayCellLabel(key, day),
          text: String(U.fromKey(key).getDate())
        });
        // En el futuro no se registra nada, así que tampoco se puede ir.
        if (futuro) cell.disabled = true;
        frag.appendChild(cell);
      });

    els.dpGrid.textContent = '';
    els.dpGrid.appendChild(frag);
    els.dpLabel.textContent = U.formatMonth(monthDate);
  }

  function toggleDayPicker(open) {
    const next = open === undefined ? els.dayPicker.hidden : open;
    els.dayPicker.hidden = !next;
    els.btnPickDay.setAttribute('aria-expanded', next ? 'true' : 'false');
    return next;
  }

  function isDayPickerOpen() {
    return !els.dayPicker.hidden;
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
   * repinta (paintCard). Secciones, de arriba abajo: cabecera con icono,
   * nombre y controles; barra de progreso y porcentaje.
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

    // El nombre abre la ficha igual que el icono: un blanco mucho mayor.
    // La categoría no se repite aquí: la dice la cabecera de la sección.
    const title = el('h3', { class: 'habit-card__name' });
    title.appendChild(el('button', {
      type: 'button', class: 'habit-card__link', 'data-action': 'detail', text: habit.name
    }));
    head.appendChild(title);

    /* ── Controles ──
       Van en la cabecera, a la derecha del nombre, donde antes estaba el
       distintivo de estado. Si no caben al lado, el CSS los baja a su
       propia línea en vez de comerle sitio al nombre, que abre la ficha. */
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

    // Franjas. En 'schedule' marcan lo cumplido; en 'avoid', lo fallado.
    if (habit.slots && (habit.type === 'schedule' || avoid)) {
      const group = el('div', {
        class: 'slots', role: 'group',
        'aria-label': (avoid ? 'Franjas a evitar de ' : 'Franjas de ') + habit.name
      });
      habit.slots.forEach(function (slot) {
        group.appendChild(el('button', {
          type: 'button',
          class: 'slot' + (avoid ? ' slot--avoid' : ''),
          'data-action': 'slot',
          'data-slot': slot,
          'aria-pressed': 'false',
          text: St.SLOT_LABELS[slot]
        }));
      });
      controls.appendChild(group);
    }

    const capped = St.isCapped(habit);

    if ((habit.type === 'quantity' && habit.target.entry === 'manual') || capped) {
      // El campo va con su unidad al lado: antes era una caja con un "0" y
      // no decía qué había que escribir.
      const field = el('div', { class: 'amount-field' });
      field.appendChild(el('input', {
        type: 'number',
        class: 'input habit-card__amount',
        'data-action': 'amount',
        min: '0',
        step: 'any',
        inputmode: 'decimal',
        placeholder: '0',
        'aria-label': capped
          ? habit.name + ': escribe cuánto llevas hoy, máximo ' +
            habit.target.amount + ' ' + habit.target.unit
          : habit.name + ': escribe el total en ' + habit.target.unit
      }));
      field.appendChild(el('span', {
        class: 'amount-field__unit', 'aria-hidden': 'true', text: habit.target.unit
      }));
      controls.appendChild(field);
    }

    // Stepper de cantidad y de fallos: mismo esqueleto, distinto significado.
    // Con franjas no hace falta: son ellas las que cuentan los fallos.
    if ((habit.type === 'quantity' && habit.target.entry !== 'manual') ||
        (avoid && !habit.slots && !capped)) {
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

    head.appendChild(controls);
    li.appendChild(head);

    /* ── Barra de progreso ── */
    const track = el('div', { class: 'progress progress--sm habit-card__bar' });
    track.appendChild(el('div', { class: 'progress__fill' }));
    li.appendChild(track);
    li.appendChild(el('p', { class: 'habit-card__pct' }));

    // Sin métricas ni mensajes de racha: "Hoy" sirve para marcar hábitos.
    // Rachas, récords, tasas y logros viven todos en Progreso.

    paintCard(li, habit, dateKey);
    return li;
  }

  /** Vuelca el estado del día sobre una tarjeta ya construida. */
  function paintCard(li, habit, dateKey) {
    const value = S.getLog(habit.id, dateKey);
    const avoid = St.isAvoid(habit);
    const state = St.cardState(habit, dateKey);
    const ratio = St.progressOf(habit, value);
    const pct = Math.round(ratio * 100);

    li.dataset.state = state;
    li.classList.toggle('is-done', state === 'done');
    li.style.setProperty('--card-pct', pct);

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

    if (habit.slots && (habit.type === 'schedule' || avoid)) {
      U.$$('.slot', li).forEach(function (btn) {
        const franja = St.SLOT_LABELS[btn.dataset.slot];
        const on = !!(value && value[btn.dataset.slot]);

        // Marcada significa lo contrario en cada tipo: cumplida en un
        // horario, fallada en uno a evitar. Por eso cambia también el color.
        btn.classList.toggle('is-done', on && !avoid);
        btn.classList.toggle('is-failed', on && avoid);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', avoid
          ? (on ? 'Quitar el fallo de la ' : 'Apuntar un fallo en la ') + franja.toLowerCase() +
            ' de ' + habit.name
          : franja + ' de ' + habit.name);
      });
    }

  }

  /**
   * Reparte los hábitos del día en secciones por categoría, en el orden del
   * catálogo y con los sin clasificar al final. Una categoría sin hábitos ese
   * día no se dibuja: dejaría una cabecera suelta sobre un hueco.
   */
  /* Alfabético con las reglas del español: así "Ajedrez" va antes que
     "Évitar", la ñ cae entre n y o, y las tildes no mandan un hábito al
     final de la lista. */
  const byName = function (a, b) { return a.name.localeCompare(b.name, 'es'); };

  function groupByCategory(habits) {
    const groups = [];

    U.CATEGORIES.forEach(function (cat) {
      const items = habits.filter(function (h) { return h.category === cat.id; });
      if (items.length) groups.push({ cat: cat, habits: items.sort(byName) });
    });

    const loose = habits.filter(function (h) { return !U.categoryById(h.category); });
    if (loose.length) {
      groups.push({
        cat: { id: '', name: 'Sin categoría', icon: '•', color: '' },
        habits: loose.sort(byName)
      });
    }
    return groups;
  }

  /** Cabecera de sección: icono, nombre y cuántos llevas de esa categoría. */
  function groupHead(group, dateKey, id) {
    const done = group.habits.filter(function (h) {
      return St.isComplete(h, S.getLog(h.id, dateKey));
    }).length;

    const head = el('div', { class: 'cat-group__head' });
    head.appendChild(el('span', { class: 'cat-group__icon', 'aria-hidden': 'true', text: group.cat.icon }));
    head.appendChild(el('h2', { class: 'cat-group__name', id: id, text: group.cat.name }));
    head.appendChild(el('p', {
      class: 'cat-group__count',
      text: done + ' de ' + group.habits.length
    }));
    return head;
  }

  /* ── Pausa ────────────────────────────────────────────────
     Un hábito en pausa desaparece de Hoy, así que lo único que impide
     olvidarse de él es este aviso al final de la lista. ──────────────── */

  function renderPausedNote() {
    // Una ausencia en curso manda: es lo que explica que falte medio Hoy.
    const hoy = U.todayKey();
    const ausencia = S.getAbsences().filter(function (a) { return a.from <= hoy; })[0];

    if (ausencia) {
      const motivo = U.pauseReasonById(ausencia.reason);
      const n = ausencia.habitIds.length;
      els.pausedNote.hidden = false;
      els.pausedNote.dataset.go = 'plan';
      els.pausedNoteIcon.textContent = motivo ? motivo.icon : '⏸';
      els.pausedNoteText.textContent = pauseLabel(ausencia) + ' hasta el ' +
        U.formatShort(U.fromKey(ausencia.to)) + ' · ' + n + (n === 1 ? ' hábito en pausa' : ' hábitos en pausa');
      return;
    }

    const pausados = S.getHabits().filter(function (h) { return !!S.pauseInfo(h); });

    els.pausedNote.hidden = !pausados.length;
    if (!pausados.length) return;

    els.pausedNote.dataset.go = 'settings';
    els.pausedNoteIcon.textContent = '⏸';
    els.pausedNoteText.textContent = pausados.length === 1
      ? '"' + pausados[0].name + '" está en pausa'
      : pausados.length + ' hábitos en pausa';
  }

  /** Texto de un tramo de pausa: el motivo, con lo escrito a mano si lo hay. */
  function pauseLabel(pause) {
    const motivo = U.pauseReasonById(pause.reason);
    const nombre = motivo ? motivo.name : 'Otro';
    return pause.note ? nombre + ' · ' + pause.note : nombre;
  }

  function openPauseModal(habit) {
    els.pauseForm.dataset.habitId = habit.id;
    els.pauseModalTitle.textContent = 'Pausar ' + habit.name;

    // Lista de motivos, generada del catálogo para que añadir uno sea
    // tocar utils.js y nada más.
    const frag = document.createDocumentFragment();
    U.PAUSE_REASONS.forEach(function (motivo, i) {
      const label = el('label', { class: 'reason' });

      const radio = el('input', {
        type: 'radio', name: 'pauseReason', value: motivo.id, class: 'reason__input'
      });
      radio.checked = i === 0;

      label.appendChild(radio);
      label.appendChild(el('span', { class: 'reason__icon', 'aria-hidden': 'true', text: motivo.icon }));
      label.appendChild(el('span', { class: 'reason__name', text: motivo.name }));
      frag.appendChild(label);
    });

    // La leyenda se conserva: es la etiqueta del grupo de radios.
    const legend = $('legend', els.pauseReasons);
    els.pauseReasons.textContent = '';
    if (legend) els.pauseReasons.appendChild(legend);
    els.pauseReasons.appendChild(frag);

    els.pauseNote.value = '';
    syncPauseNote();

    lastFocused = document.activeElement;
    els.pauseModal.hidden = false;
    document.body.style.overflow = 'hidden';
    const primero = $('.reason__input', els.pauseReasons);
    if (primero) primero.focus();
  }

  function closePauseModal() {
    els.pauseModal.hidden = true;
    document.body.style.overflow = '';
    delete els.pauseForm.dataset.habitId;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  /** El campo de texto solo aparece con "Otro": en los demás no aporta. */
  function syncPauseNote() {
    els.pauseNoteField.hidden = readPauseReason() !== 'otro';
  }

  function readPauseReason() {
    const marcado = $('input[name="pauseReason"]:checked', els.pauseReasons);
    return marcado ? marcado.value : 'otro';
  }

  function readPauseForm() {
    return {
      habitId: els.pauseForm.dataset.habitId || null,
      reason: readPauseReason(),
      note: els.pauseNote.value.trim()
    };
  }

  /* ── Plan de la semana ────────────────────────────────────
     Se planifica la semana en curso —de hoy al domingo, lo pasado se
     queda como estaba— o la siguiente. Al confirmar, la semana queda
     bloqueada hasta que termina. El borrador vive aquí hasta entonces;
     quien escribe en el almacén sigue siendo app.js. ───────────────── */

  const PLAN_ORDER = [1, 2, 3, 4, 5, 6, 0];   // de lunes a domingo, como el resto de la app
  const plan = { offset: 0, draft: {} };      // offset: 0 = esta semana, 1 = la que viene

  function sameDayList(a, b) {
    return a.length === b.length && a.every(function (d, i) { return d === b[i]; });
  }

  /** Los que se planifican: los de evitar tocan todos los días por definición. */
  function planHabits() {
    return S.getHabits().filter(function (h) { return !St.isAvoid(h); }).sort(byName);
  }

  function planWeekKey() {
    return S.planWeeks()[plan.offset];
  }

  /** Cambia de semana sin perder lo marcado en la otra. */
  function setPlanOffset(offset) {
    plan.offset = offset ? 1 : 0;
  }

  function getPlanOffset() { return plan.offset; }

  function resetPlanDraft() {
    plan.draft = {};
  }

  /** La fecha de un día de la semana del plan. */
  function planDateOf(dow) {
    return U.addDaysKey(planWeekKey(), PLAN_ORDER.indexOf(dow));
  }

  /** Días marcados de un hábito en la semana que se ve: el borrador si lo hay. */
  function planDaysOf(habit) {
    const w = plan.draft[planWeekKey()];
    return w && w[habit.id] ? w[habit.id] : S.activeDaysFor(habit, planWeekKey());
  }

  function setPlanDraft(habitId, days) {
    const wk = planWeekKey();
    if (!plan.draft[wk]) plan.draft[wk] = {};
    plan.draft[wk][habitId] = days.slice().sort();
  }

  function renderPlanView() {
    renderPlan();
    renderAbsences();
  }

  function renderPlan() {
    const hoy = U.todayKey();
    const wk = planWeekKey();
    const fin = U.addDaysKey(wk, 6);
    const bloqueada = S.isWeekLocked(wk);
    const cuando = S.weekPlannedOn(wk);

    U.$$('input[name="planWeek"]').forEach(function (r) {
      r.checked = Number(r.value) === plan.offset;
    });

    els.planRange.textContent = (plan.offset ? 'La que viene' : 'Esta semana') + ' · ' +
      U.formatShort(U.fromKey(wk)) + ' – ' + U.formatShort(U.fromKey(fin));
    els.planStatus.textContent = bloqueada ? 'Planificada' : 'Sin planificar';
    els.planLock.hidden = !bloqueada;

    let pista;
    if (bloqueada) {
      pista = 'Confirmada el ' + U.formatShort(U.fromKey(cuando)) + '. Queda así hasta el domingo. ' +
              'Si surge algo, anota el día, pausa el hábito o programa una ausencia.';
    } else if (plan.offset === 0 && hoy > wk) {
      pista = 'Empiezas hoy: lo que ya pasó se queda como estaba y planificas de hoy al domingo. ' +
              'Al confirmar, la semana queda bloqueada.';
    } else {
      pista = 'Marca qué días toca cada hábito. Sin plan, todo sigue sus días de siempre. ' +
              'Al confirmar, la semana queda bloqueada.';
    }
    els.planHint.textContent = pista;

    const letras = U.weekdayLabels(0);
    const habits = planHabits();
    const frag = document.createDocumentFragment();

    habits.forEach(function (h) {
      const li = el('li', { class: 'plan-row', 'data-id': h.id });
      li.style.setProperty('--habit-color', h.color);

      const head = el('div', { class: 'plan-row__head' });
      head.appendChild(el('span', { class: 'plan-row__icon', 'aria-hidden': 'true', text: h.icon }));
      head.appendChild(el('span', { class: 'plan-row__name', text: h.name }));
      head.appendChild(el('span', { class: 'plan-row__count' }));
      li.appendChild(head);

      const group = el('div', { class: 'plan-days', role: 'group', 'aria-label': 'Días de ' + h.name });
      PLAN_ORDER.forEach(function (dow) {
        const key = planDateOf(dow);
        // Lo que ya pasó no se toca: cambiarlo reescribiría tus rachas.
        const pasado = key < hoy;
        const pausa = S.isPausedOn(h, key);
        const btn = el('button', {
          type: 'button', class: 'plan-day' + (pausa ? ' is-paused' : ''), 'data-dow': String(dow),
          title: pausa ? 'En pausa' : pasado ? 'Ya pasó' : null,
          text: letras[dow]
        });
        btn.disabled = bloqueada || pasado || pausa || h.createdAt > key;
        group.appendChild(btn);
      });
      li.appendChild(group);

      paintPlanRow(li, h);
      frag.appendChild(li);
    });

    els.planList.textContent = '';
    els.planList.appendChild(frag);
    els.planList.hidden = !habits.length;
    els.planList.classList.toggle('is-locked', bloqueada);
    els.planEmpty.hidden = habits.length > 0;
    els.planActions.hidden = bloqueada || !habits.length;
  }

  /** Vuelca el borrador sobre una fila sin reconstruirla: el foco no se pierde. */
  function paintPlanRow(li, habit) {
    const days = planDaysOf(habit);
    li.classList.toggle('is-changed', !sameDayList(days, habit.activeDays));
    $('.plan-row__count', li).textContent = days.length === 7 ? 'Todos'
      : days.length + (days.length === 1 ? ' día' : ' días');

    U.$$('.plan-day', li).forEach(function (btn) {
      const dow = Number(btn.dataset.dow);
      const on = days.indexOf(dow) >= 0;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', U.weekdayLong(U.fromKey(planDateOf(dow))) + ': ' +
        (on ? 'toca' : 'no toca') + ' ' + habit.name);
    });
  }

  function togglePlanDay(habitId, dow) {
    const habit = S.getHabit(habitId);
    const li = $('.plan-row[data-id="' + habitId + '"]', els.planList);
    if (!habit || !li || S.isWeekLocked(planWeekKey())) return;

    const days = planDaysOf(habit).slice();
    const i = days.indexOf(dow);
    if (i >= 0) days.splice(i, 1);
    else days.push(dow);

    setPlanDraft(habitId, days);
    paintPlanRow(li, habit);
  }

  /** "Como siempre": vuelve a los días de siempre salvo en lo que ya pasó. */
  function resetPlanWeek() {
    const hoy = U.todayKey();
    planHabits().forEach(function (h) {
      const actual = S.activeDaysFor(h, planWeekKey());
      const days = PLAN_ORDER.filter(function (dow) {
        const fuente = planDateOf(dow) < hoy ? actual : h.activeDays;
        return fuente.indexOf(dow) >= 0;
      });
      setPlanDraft(h.id, days);
    });
    renderPlan();
  }

  /** La semana que se ve y su borrador: { weekKey, draft: { hábito → días } }. */
  function readPlan() {
    const wk = planWeekKey();
    return { weekKey: wk, draft: JSON.parse(JSON.stringify(plan.draft[wk] || {})) };
  }

  /* ── Ausencias ────────────────────────────────────────────── */

  function absenceRange(a) {
    const dias = U.daysBetween(a.from, a.to) + 1;
    return U.formatShort(U.fromKey(a.from)) + ' – ' + U.formatShort(U.fromKey(a.to)) +
           ' · ' + dias + (dias === 1 ? ' día' : ' días');
  }

  function renderAbsences() {
    const hoy = U.todayKey();
    const lista = S.getAbsences();
    const frag = document.createDocumentFragment();

    lista.forEach(function (a) {
      const motivo = U.pauseReasonById(a.reason);
      const enCurso = a.from <= hoy;
      const n = a.habitIds.length;
      const li = el('li', { class: 'absence' + (enCurso ? ' is-active' : '') });

      li.appendChild(el('span', { class: 'absence__icon', 'aria-hidden': 'true', text: motivo ? motivo.icon : '⏸' }));

      const body = el('div', { class: 'absence__body' });
      body.appendChild(el('p', { class: 'absence__title', text: pauseLabel(a) }));
      const faltan = U.daysBetween(hoy, a.from);
      body.appendChild(el('p', {
        class: 'absence__meta',
        text: absenceRange(a) + ' · ' + n + (n === 1 ? ' hábito' : ' hábitos') + ' · ' +
              (enCurso ? 'en curso' : faltan === 1 ? 'empieza mañana' : 'empieza en ' + faltan + ' días')
      }));
      li.appendChild(body);

      li.appendChild(el('button', {
        type: 'button', class: 'btn btn--ghost', 'data-absence-cancel': a.id,
        text: enCurso ? 'Terminar hoy' : 'Cancelar'
      }));
      frag.appendChild(li);
    });

    if (!lista.length) {
      frag.appendChild(el('li', { class: 'absence-empty', text: 'Ninguna programada.' }));
    }

    els.absenceList.textContent = '';
    els.absenceList.appendChild(frag);
  }

  function openAbsenceModal() {
    const hoy = U.todayKey();
    els.absenceFrom.min = hoy;
    els.absenceTo.min = hoy;
    els.absenceFrom.value = hoy;
    els.absenceTo.value = U.addDaysKey(hoy, 6);
    els.absenceNote.value = '';

    const frag = document.createDocumentFragment();
    U.PAUSE_REASONS.forEach(function (motivo) {
      const label = el('label', { class: 'reason' });
      const radio = el('input', {
        type: 'radio', name: 'absenceReason', value: motivo.id, class: 'reason__input'
      });
      radio.checked = motivo.id === 'viaje';
      label.appendChild(radio);
      label.appendChild(el('span', { class: 'reason__icon', 'aria-hidden': 'true', text: motivo.icon }));
      label.appendChild(el('span', { class: 'reason__name', text: motivo.name }));
      frag.appendChild(label);
    });
    const legend = $('legend', els.absenceReasons);
    els.absenceReasons.textContent = '';
    if (legend) els.absenceReasons.appendChild(legend);
    els.absenceReasons.appendChild(frag);

    // Todos marcados de entrada: en un viaje lo normal es parar casi todo,
    // y es más rápido desmarcar los dos que sigues haciendo.
    const lista = document.createDocumentFragment();
    S.getHabits().slice().sort(byName).forEach(function (h) {
      const li = el('li');
      const label = el('label', { class: 'absence-habit' });
      const box = el('input', { type: 'checkbox', value: h.id, class: 'absence-habit__box' });
      box.checked = true;
      label.appendChild(box);
      label.appendChild(el('span', { 'aria-hidden': 'true', text: h.icon }));
      label.appendChild(el('span', { class: 'absence-habit__name', text: h.name }));
      li.appendChild(label);
      lista.appendChild(li);
    });
    els.absenceHabits.textContent = '';
    els.absenceHabits.appendChild(lista);

    syncAbsenceLength();

    lastFocused = document.activeElement;
    els.absenceModal.hidden = false;
    document.body.style.overflow = 'hidden';
    els.absenceFrom.focus();
  }

  function closeAbsenceModal() {
    els.absenceModal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  function setAbsenceAll(on) {
    U.$$('.absence-habit__box', els.absenceHabits).forEach(function (b) { b.checked = on; });
  }

  /** Cuántos días son, dicho al lado de las fechas: evita equivocarse de mes. */
  function syncAbsenceLength() {
    const a = els.absenceFrom.value;
    const b = els.absenceTo.value;
    if (!U.isValidKey(a) || !U.isValidKey(b)) { els.absenceLength.textContent = ''; return; }
    if (b < a) { els.absenceLength.textContent = 'La fecha final va antes que la inicial.'; return; }
    const dias = U.daysBetween(a, b) + 1;
    els.absenceLength.textContent = dias + (dias === 1 ? ' día' : ' días') + ', del ' +
      U.formatLong(U.fromKey(a)) + ' al ' + U.formatLong(U.fromKey(b)) + '.';
  }

  function readAbsenceForm() {
    const motivo = $('input[name="absenceReason"]:checked', els.absenceReasons);
    return {
      from: els.absenceFrom.value,
      to: els.absenceTo.value,
      reason: motivo ? motivo.value : 'otro',
      note: els.absenceNote.value.trim(),
      habitIds: U.$$('.absence-habit__box', els.absenceHabits)
        .filter(function (b) { return b.checked; })
        .map(function (b) { return b.value; })
    };
  }

  /** El cajón de los cumplidos: plegado, con su cuenta, y abrible. */
  function doneDrawer(hechos, dateKey) {
    const box = el('details', { class: 'done-drawer' });

    const head = el('summary', { class: 'done-drawer__head' });
    head.appendChild(el('span', { class: 'done-drawer__check', 'aria-hidden': 'true', text: '✓' }));
    head.appendChild(el('span', {
      class: 'done-drawer__label',
      text: hechos.length + (hechos.length === 1 ? ' hábito cumplido' : ' hábitos cumplidos')
    }));
    box.appendChild(head);

    const list = el('ul', { class: 'habit-list' });
    hechos.sort(byName).forEach(function (habit) {
      const card = buildCard(habit, dateKey);
      cardIndex[habit.id] = card;
      list.appendChild(card);
    });

    box.appendChild(list);
    return box;
  }

  /** Reconstruye la lista entera. Solo al añadir, editar, borrar o cambiar de día. */
  function renderHabitList(dateKey) {
    const habits = S.getHabitsForDate(dateKey);
    const frag = document.createDocumentFragment();

    Object.keys(cardIndex).forEach(function (k) { delete cardIndex[k]; });

    // Con "apartar cumplidos" activo, los hechos salen de sus secciones y se
    // juntan al final en un cajón plegado. Siguen ahí para poder desmarcarlos.
    const apartar = S.getSettings().hideDone;
    const hechos = [];

    groupByCategory(habits).forEach(function (group, i) {
      const pendientes = apartar
        ? group.habits.filter(function (h) {
            // Los de evitar nunca se apartan: están "cumplidos" desde las
            // 00:00 y esconderlos sería quitar de en medio justo el botón
            // que hay que poder pulsar si caes.
            if (St.isAvoid(h)) return true;

            const done = St.isComplete(h, S.getLog(h.id, dateKey));
            if (done) hechos.push(h);
            return !done;
          })
        : group.habits;

      if (!pendientes.length) return;

      const titleId = 'catGroup' + i;
      const section = el('section', { class: 'cat-group', 'aria-labelledby': titleId });
      if (group.cat.color) section.style.setProperty('--cat-color', group.cat.color);

      // La cabecera sigue contando el grupo entero: si dijera "0 de 0" al
      // apartar los hechos, parecería que esa categoría no existe hoy.
      section.appendChild(groupHead(group, dateKey, titleId));

      const list = el('ul', { class: 'habit-list' });
      pendientes.forEach(function (habit) {
        const card = buildCard(habit, dateKey);
        cardIndex[habit.id] = card;
        list.appendChild(card);
      });

      section.appendChild(list);
      frag.appendChild(section);
    });

    if (hechos.length) frag.appendChild(doneDrawer(hechos, dateKey));

    els.habitList.textContent = '';
    els.habitList.appendChild(frag);
    renderPausedNote();

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

    // El contador de la sección cuenta esta tarjeta, así que se recalcula
    // aquí mismo en vez de rehacer la lista entera.
    const section = card.closest('.cat-group');
    const counter = section && $('.cat-group__count', section);
    if (!counter) return;

    const cards = U.$$('.habit-card', section);
    const done = cards.filter(function (node) {
      const h = S.getHabit(node.dataset.id);
      return h && St.isComplete(h, S.getLog(h.id, dateKey));
    }).length;
    counter.textContent = done + ' de ' + cards.length;
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
    const mark = S.getDayMark(dateKey);

    // Solo tiene sentido ofrecerlo si ese día quedó algo sin cumplir, y si
    // el usuario no lo ha apagado en Ajustes.
    const relevant = S.getSettings().showFreeze && day.total > 0 && (mark || !day.perfect);
    els.dayActions.hidden = !relevant;

    if (relevant) {
      const motivo = mark && mark.reason ? U.dayReasonById(mark.reason) : null;

      // Solo la etiqueta y el icono: textContent sobre el botón entero
      // borraría los dos.
      els.freezeIcon.textContent = motivo ? motivo.icon : mark ? '❄️' : '✎';
      els.freezeLabel.textContent = mark ? 'Editar la nota del día' : 'Anotar el día';
      els.btnFreeze.disabled = false;
      els.btnFreeze.classList.toggle('is-on', !!mark);

      els.freezeHint.textContent = mark
        ? dayMarkSummary(mark)
        : 'Di por qué no salió. Anotarlo es gratis; salvar el día cuesta un comodín.';
    }

    if (document.activeElement !== els.dayNote) {
      els.dayNote.value = S.getNote(dateKey);
      growField(els.dayNote);
    }

    renderWeightEntry(dateKey);
    renderWeekRecap(dateKey);
    renderPlanNote(dateKey);
  }

  /* ── Resumen de la semana pasada ──────────────────────────
     Sale en Hoy de lunes a miércoles, hasta que lo cierras. Más tarde ya
     no es "la semana pasada" sino historia, y para eso está Histórico. ── */

  function renderWeekRecap(dateKey) {
    const hoy = U.todayKey();
    const estaSemana = S.weekKeyOf(hoy);
    const dow = U.fromKey(hoy).getDay();

    let r = null;
    if (dateKey === hoy && dow >= 1 && dow <= 3 && S.getGame().weekSummarySeen !== estaSemana) {
      r = St.weekSummary(U.addDaysKey(estaSemana, -7));
      if (!r.rate.total) r = null;               // no tocaba nada: no hay nada que resumir
    }

    els.weekRecap.hidden = !r;
    if (!r) return;

    els.weekRecap.dataset.week = estaSemana;
    els.recapRange.textContent =
      U.formatShort(U.fromKey(r.weekKey)) + ' – ' + U.formatShort(U.fromKey(U.addDaysKey(r.weekKey, 6)));

    const dif = r.prevPct === null ? null : r.rate.pct - r.prevPct;
    const fichas = [
      { valor: r.rate.pct + '%', etiqueta: dif === null ? 'Cumplido'
          : dif === 0 ? 'Igual que la anterior'
          : (dif > 0 ? '+' : '−') + Math.abs(dif) + ' pts sobre la anterior' },
      { valor: r.perfect + ' / ' + r.scheduled, etiqueta: 'Días perfectos' },
      { valor: '◆ ' + St.dayStreak(hoy), etiqueta: 'Racha de hábitos' }
    ];

    const stats = document.createDocumentFragment();
    fichas.forEach(function (f) {
      const li = el('li', { class: 'recap__stat' });
      li.appendChild(el('p', { class: 'recap__value', text: f.valor }));
      li.appendChild(el('p', { class: 'recap__label', text: f.etiqueta }));
      stats.appendChild(li);
    });
    els.recapStats.textContent = '';
    els.recapStats.appendChild(stats);

    const lineas = [];
    if (r.weakest) {
      lineas.push('Lo que más se escapó: ' + r.weakest.habit.icon + ' ' + r.weakest.habit.name +
                  ', ' + r.weakest.done + ' de ' + r.weakest.total + '.');
    }
    r.capped.forEach(function (c) {
      const u = c.habit.target.unit;
      const d = Math.round((c.sum - c.prev) * 10) / 10;
      let txt = c.habit.icon + ' ' + c.habit.name + ': ' + (Math.round(c.sum * 10) / 10) + ' ' + u;
      if (c.prev) txt += d === 0 ? ', lo mismo que la anterior' : ', ' + Math.abs(d) + ' ' + u + (d < 0 ? ' menos' : ' más') + ' que la anterior';
      if (c.over) txt += ' · ' + c.over + (c.over === 1 ? ' día pasado' : ' días pasados') + ' del máximo';
      lineas.push(txt + '.');
    });
    if (r.weight) {
      lineas.push('Peso: media de ' + kg(r.weight.avg) +
                  (r.weight.change === null ? '' : ' (' + kgDelta(r.weight.change) + ')') + '.');
    }

    const lines = document.createDocumentFragment();
    lineas.forEach(function (t) { lines.appendChild(el('li', { text: t })); });
    els.recapLines.textContent = '';
    els.recapLines.appendChild(lines);
    els.recapLines.hidden = !lineas.length;

    // Si ya planificaste esta semana, el botón lo dice.
    els.btnRecapPlan.textContent = S.isWeekLocked(estaSemana)
      ? 'Ver el plan de esta semana' : 'Planificar esta semana';
  }

  /**
   * Una línea en Hoy cuando la semana está sin planificar; el domingo, si la
   * que viene aún no lo está. Mientras se ve el resumen semanal no sale:
   * el resumen ya tiene su botón para planificar.
   */
  function renderPlanNote(dateKey) {
    const hoy = U.todayKey();
    const semanas = S.planWeeks();
    let texto = null;
    let offset = 0;

    if (dateKey === hoy && els.weekRecap.hidden && planHabits().length) {
      if (U.fromKey(hoy).getDay() === 0 && !S.isWeekLocked(semanas[1])) {
        texto = 'La semana que viene está sin planificar';
        offset = 1;
      } else if (!S.isWeekLocked(semanas[0])) {
        texto = 'Esta semana está sin planificar';
      }
    }

    els.planNote.hidden = !texto;
    if (!texto) return;
    els.planNote.dataset.week = String(offset);
    els.planNoteText.textContent = texto;
  }

  /* ── Peso ─────────────────────────────────────────────────── */

  const fmtKg = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function kg(n) { return fmtKg.format(n) + ' kg'; }

  /** Con signo y menos de verdad: "+0,4 kg", "−0,6 kg". */
  function kgDelta(n) {
    if (n === null) return '—';
    if (n === 0) return 'Igual';
    return (n > 0 ? '+' : '−') + fmtKg.format(Math.abs(n)) + ' kg';
  }

  /** El campo del peso en Hoy, para el día que se esté mirando. */
  function renderWeightEntry(dateKey) {
    const hoyPeso = S.getWeight(dateKey);

    if (document.activeElement !== els.weightInput) {
      els.weightInput.value = hoyPeso === null ? '' : hoyPeso;
    }

    // La pista no repite lo que ya está en el campo: si hay peso, da la media
    // de la semana, que es el dato que importa; si no, el último apuntado.
    if (hoyPeso !== null) {
      const media = St.weightAvg7(dateKey);
      els.weightHint.textContent = 'Media de 7 días: ' + kg(media) + '.';
      return;
    }

    const ultimo = St.weightOnOrBefore(U.addDaysKey(dateKey, -1));
    if (!ultimo) {
      els.weightHint.textContent = 'Opcional. Mejor siempre a la misma hora.';
      return;
    }
    const dias = U.daysBetween(ultimo.date, dateKey);
    els.weightHint.textContent = 'Último: ' + kg(ultimo.kg) + ' · ' +
      (dias === 1 ? 'ayer' : 'hace ' + dias + ' días') + '.';
  }

  /**
   * La tarjeta de Histórico: cuatro cifras y la gráfica. Los cambios no se
   * pintan en verde ni en rojo a propósito: si subir es bueno o malo
   * depende de lo que busques, y la app no lo sabe.
   */
  function renderWeight(todayKey, days) {
    const resumen = St.weightSummary(todayKey, days);
    const vacio = !resumen;
    const meta = St.weightGoal(todayKey);

    renderWeightGoal(meta);

    els.weightEmpty.hidden = !vacio;
    els.weightStats.hidden = vacio;
    els.weightChart.hidden = vacio;
    els.weightLegend.hidden = vacio;
    if (vacio) return;

    const dias = U.daysBetween(resumen.last.date, todayKey);
    const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días';

    const fichas = [
      { valor: kg(resumen.last.kg), etiqueta: 'Último · ' + cuando },
      { valor: kg(resumen.avg), etiqueta: 'Media de 7 días' },
      { valor: kgDelta(resumen.change7), etiqueta: 'En 7 días',
        nota: resumen.change7 === null ? 'Sin pesadas hace una semana' : null },
      { valor: kgDelta(resumen.change30), etiqueta: 'En 30 días',
        nota: resumen.change30 === null ? 'Sin pesadas hace un mes' : null }
    ];

    const frag = document.createDocumentFragment();
    fichas.forEach(function (f) {
      const li = el('li', { class: 'weight-stat', title: f.nota || null });
      li.appendChild(el('p', { class: 'weight-stat__value', text: f.valor }));
      li.appendChild(el('p', { class: 'weight-stat__label', text: f.etiqueta }));
      frag.appendChild(li);
    });

    if (resumen.min !== null && resumen.min !== resumen.max) {
      frag.appendChild(el('li', {
        class: 'weight-stat weight-stat--range',
        text: 'En el periodo, entre ' + kg(resumen.min) + ' y ' + kg(resumen.max) + '.'
      }));
    }

    els.weightStats.textContent = '';
    els.weightStats.appendChild(frag);

    els.weightLegendGoal.hidden = !drawWeightChart(St.weightSeries(todayKey, days), meta ? meta.goal : null);
  }

  /**
   * El objetivo y el ritmo, en una frase. Neutra a propósito, como el resto
   * de la tarjeta: "a 3 kg" vale igual para quien quiere bajar que subir.
   */
  function renderWeightGoal(meta) {
    if (document.activeElement !== els.weightGoalInput) {
      els.weightGoalInput.value = meta ? meta.goal : '';
    }

    if (!meta) {
      els.weightGoalText.textContent = 'Opcional. Con un objetivo verás cuánto te falta y a qué ritmo vas.';
      return;
    }
    if (meta.status === 'nodata') {
      els.weightGoalText.textContent = 'Apunta tu peso en Hoy para ver cuánto te falta.';
      return;
    }
    if (meta.status === 'arrived') {
      els.weightGoalText.textContent = 'En tu objetivo: la media de 7 días está en ' + kg(meta.current) + '.';
      return;
    }

    const falta = 'A ' + kg(Math.abs(meta.remaining)) + ' del objetivo';
    const ritmo = meta.rate === null ? '' : kgDelta(meta.rate) + ' por semana';
    let txt;

    if (meta.status === 'norate') txt = falta + '. Con dos semanas de pesadas se calcula tu ritmo.';
    else if (meta.status === 'stable') txt = falta + '. Ahora mismo estás estable.';
    else if (meta.status === 'away') txt = falta + ', pero vas en la otra dirección (' + ritmo + ').';
    else if (meta.eta) {
      txt = falta + '. A ' + ritmo + ', unas ' + meta.weeks + (meta.weeks === 1 ? ' semana' : ' semanas') +
            ' (hacia el ' + U.formatShort(U.fromKey(meta.eta)) + ').';
    } else txt = falta + '. A ' + ritmo + ', más de tres años.';

    els.weightGoalText.textContent = txt;
  }

  /**
   * Puntos para cada pesada y una línea para la media de 7 días. La línea
   * es lo que hay que leer; los puntos están para ver cuánto baila el dato
   * de un día a otro y no fiarse de uno suelto.
   */
  function drawWeightChart(series, goal) {
    // El ancho del dibujo es el de la tarjeta, no uno fijo: así una unidad
    // del SVG es un píxel de pantalla y el texto del eje se lee igual en el
    // móvil que en el ordenador. Con un ancho fijo de 600, en el móvil se
    // encogía a la mitad y quedaba ilegible.
    const W = Math.max(280, Math.round(els.weightChart.clientWidth) || 360);
    const H = 180;
    const m = { l: 44, r: 12, t: 12, b: 26 };

    const valores = [];
    series.forEach(function (p) {
      if (p.kg !== null) valores.push(p.kg);
      if (p.avg !== null) valores.push(p.avg);
    });

    let lo = Math.min.apply(null, valores);
    let hi = Math.max.apply(null, valores);

    // El objetivo entra en la escala solo si está cerca: uno a 15 kg
    // aplastaría la gráfica hasta dejarla plana. Lejos, ya lo dice el texto.
    const conMeta = goal !== null && goal !== undefined && goal >= lo - 3 && goal <= hi + 3;
    if (conMeta) {
      lo = Math.min(lo, goal);
      hi = Math.max(hi, goal);
    }
    // Con muy poca variación la gráfica exageraría décimas hasta parecer un
    // precipicio: se fuerza un margen mínimo de dos kilos.
    if (hi - lo < 2) {
      const centro = (hi + lo) / 2;
      lo = centro - 1;
      hi = centro + 1;
    }
    lo = Math.floor(lo * 2) / 2 - 0.5;
    hi = Math.ceil(hi * 2) / 2 + 0.5;

    const n = Math.max(1, series.length - 1);
    const x = function (i) { return m.l + (i / n) * (W - m.l - m.r); };
    const y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b); };

    const svg = svgEl('svg', {
      class: 'wchart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Evolución del peso en ' + series.length + ' días'
    });

    // Tres líneas de referencia con su valor.
    [lo, (lo + hi) / 2, hi].forEach(function (v) {
      svg.appendChild(svgEl('line', {
        class: 'wchart__grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v)
      }));
      const t = svgEl('text', { class: 'wchart__axis', x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' });
      t.textContent = fmtKg.format(v);
      svg.appendChild(t);
    });

    if (conMeta) {
      svg.appendChild(svgEl('line', {
        class: 'wchart__goal', x1: m.l, x2: W - m.r, y1: y(goal), y2: y(goal)
      }));
    }

    // La media: un tramo por cada racha de días con dato, sin inventar el
    // hueco entre dos semanas sin pesarse.
    let d = '';
    let dentro = false;
    series.forEach(function (p, i) {
      if (p.avg === null) { dentro = false; return; }
      d += (dentro ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.avg).toFixed(1);
      dentro = true;
    });
    if (d) svg.appendChild(svgEl('path', { class: 'wchart__avg', d: d }));

    series.forEach(function (p, i) {
      if (p.kg === null) return;
      const c = svgEl('circle', { class: 'wchart__dot', cx: x(i), cy: y(p.kg), r: 3.2 });
      const t = svgEl('title');
      t.textContent = U.formatShort(U.fromKey(p.key)) + ': ' + kg(p.kg);
      c.appendChild(t);
      svg.appendChild(c);
    });

    // Fechas en los extremos: con eso se lee el periodo sin saturar el eje.
    [0, series.length - 1].forEach(function (i, j) {
      if (!series[i]) return;
      const t = svgEl('text', {
        class: 'wchart__axis', x: x(i), y: H - 6, 'text-anchor': j === 0 ? 'start' : 'end'
      });
      t.textContent = U.formatShort(U.fromKey(series[i].key));
      svg.appendChild(t);
    });

    els.weightChart.textContent = '';
    els.weightChart.appendChild(svg);
    return conMeta;
  }

  /* ── Marcar un día ────────────────────────────────────────── */

  /** El motivo de un día en una línea, con su nota si la lleva. */
  function dayMarkLabel(mark) {
    if (!mark) return '';
    const motivo = mark.reason ? U.dayReasonById(mark.reason) : null;
    const nombre = motivo ? motivo.name : 'Día salvado';
    return mark.note ? nombre + ' · ' + mark.note : nombre;
  }

  function dayMarkSummary(mark) {
    return dayMarkLabel(mark) + (mark.skip
      ? ' · no cuenta para las rachas.'
      : ' · el día sigue contando.');
  }

  function openDayModal(dateKey) {
    const mark = S.getDayMark(dateKey);
    const freezes = S.getGame().freezes;

    els.dayForm.dataset.day = dateKey;
    els.dayModalTitle.textContent = 'El ' + U.formatLong(U.fromKey(dateKey));

    const frag = document.createDocumentFragment();
    U.DAY_REASONS.forEach(function (motivo, i) {
      const label = el('label', { class: 'reason' });
      const radio = el('input', {
        type: 'radio', name: 'dayReason', value: motivo.id, class: 'reason__input'
      });
      radio.checked = mark ? mark.reason === motivo.id : i === 0;

      label.appendChild(radio);
      label.appendChild(el('span', { class: 'reason__icon', 'aria-hidden': 'true', text: motivo.icon }));
      label.appendChild(el('span', { class: 'reason__name', text: motivo.name }));
      frag.appendChild(label);
    });

    const legend = $('legend', els.dayReasons);
    els.dayReasons.textContent = '';
    if (legend) els.dayReasons.appendChild(legend);
    els.dayReasons.appendChild(frag);

    // Si venía salvado sin motivo (los días congelados de antes), ninguno
    // queda marcado y el usuario elige uno ahora si quiere.
    if (mark && !mark.reason) {
      U.$$('input[name="dayReason"]', els.dayReasons).forEach(function (r) { r.checked = false; });
    }

    els.dayReasonNote.value = mark ? mark.note : '';
    syncDayNote();

    const yaSalvado = !!(mark && mark.skip);
    els.daySkip.checked = yaSalvado;
    els.daySkip.disabled = !yaSalvado && freezes <= 0;
    els.daySkipHint.textContent = yaSalvado
      ? 'Al quitarlo recuperas el comodín.'
      : freezes > 0
        ? 'Te quedan ' + freezes + (freezes === 1 ? ' comodín' : ' comodines') + '.'
        : 'Sin comodines. Recuperas uno cada semana, hasta 4.';

    els.btnClearDay.hidden = !mark;

    lastFocused = document.activeElement;
    els.dayModal.hidden = false;
    document.body.style.overflow = 'hidden';
    const primero = $('.reason__input', els.dayReasons);
    if (primero) primero.focus();
  }

  function closeDayModal() {
    els.dayModal.hidden = true;
    document.body.style.overflow = '';
    delete els.dayForm.dataset.day;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  function syncDayNote() {
    const marcado = $('input[name="dayReason"]:checked', els.dayReasons);
    els.dayNoteField.hidden = !marcado || marcado.value !== 'otro';
  }

  function readDayForm() {
    const marcado = $('input[name="dayReason"]:checked', els.dayReasons);
    return {
      dateKey: els.dayForm.dataset.day || null,
      reason: marcado ? marcado.value : null,
      note: els.dayReasonNote.value.trim(),
      skip: els.daySkip.checked
    };
  }

  /* ── Notas ────────────────────────────────────────────────
     Todo sale de state.notes, que existe desde la primera versión. Lo
     único que pasaba es que solo se veía la del día que estuvieras
     mirando: lo escrito estaba ahí y era invisible. ─────────────────── */

  /**
   * Un campo de texto que crece con lo que se escribe. Se pone la altura a
   * `auto` antes de medir porque scrollHeight nunca encoge por su cuenta:
   * sin eso, al borrar líneas el campo se quedaría grande para siempre.
   */
  function growField(node) {
    node.style.height = 'auto';
    node.style.height = node.scrollHeight + 'px';
  }

  /** Cómo fue ese día, en corto. Es lo que le da contexto a lo escrito. */
  function noteDayTag(dateKey) {
    if (S.isFrozen(dateKey)) return { text: 'Día congelado', state: 'frozen' };

    const day = St.dayStats(dateKey);
    if (!day.total) return null;

    if (day.perfect) return { text: 'Día perfecto · ' + day.done + ' de ' + day.total, state: 'perfect' };
    return { text: day.done + ' de ' + day.total, state: day.pct >= 50 ? 'ok' : 'low' };
  }

  function renderNotes(dateKey, query, editingKey) {
    const hoy = U.todayKey();
    const notes = S.getState().notes;
    const busca = (query || '').trim().toLowerCase();

    // El campo de arriba escribe siempre en HOY, mires el día que mires:
    // es un diario, y lo que se escribe se escribe ahora.
    if (document.activeElement !== els.notesToday) {
      els.notesToday.value = S.getNote(hoy);
      growField(els.notesToday);
    }

    renderFreeNotes(busca, editingKey);

    const claves = Object.keys(notes)
      .filter(function (k) { return !busca || notes[k].toLowerCase().indexOf(busca) >= 0; })
      .sort()
      .reverse();

    const total = Object.keys(notes).length;
    els.notesCount.textContent = busca
      ? claves.length + ' de ' + total
      : total + (total === 1 ? ' nota' : ' notas');

    const frag = document.createDocumentFragment();

    claves.forEach(function (key) {
      /* Antes la entrada entera era un botón que llevaba al día. Ahora hay
         dos acciones, así que cada una tiene el suyo: la fecha lleva al día
         y el lápiz edita aquí mismo. El texto deja de ser pulsable, y con
         eso también se puede seleccionar y copiar. */
      const editando = key === editingKey;
      const largo = U.formatLong(U.fromKey(key));
      const item = el('li', { class: 'note-entry' + (editando ? ' is-editing' : '') });

      const head = el('div', { class: 'note-entry__head' });

      const dias = U.daysBetween(key, hoy);
      const cuando = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : largo;
      head.appendChild(el('button', {
        type: 'button', class: 'note-entry__date', 'data-day': key,
        'aria-label': 'Ir al ' + largo, text: cuando + ' ›'
      }));

      const tag = noteDayTag(key);
      if (tag) {
        head.appendChild(el('span', {
          class: 'note-entry__tag', 'data-state': tag.state, text: tag.text
        }));
      }

      head.appendChild(el('button', {
        type: 'button', class: 'icon-btn note-entry__edit', 'data-edit': key,
        'aria-pressed': editando ? 'true' : 'false',
        'aria-label': (editando ? 'Terminar de editar la nota del ' : 'Editar la nota del ') + largo,
        title: editando ? 'Listo' : 'Editar',
        text: editando ? '✓' : '✎'
      }));

      item.appendChild(head);

      if (editando) {
        const ta = el('textarea', {
          class: 'input input--area note-grow note-entry__input', 'data-note': key,
          rows: '3', 'aria-label': 'Nota del ' + largo
        });
        ta.value = notes[key];
        item.appendChild(ta);
      } else {
        item.appendChild(el('p', { class: 'note-entry__text', text: notes[key] }));
      }

      frag.appendChild(item);
    });

    els.notesList.textContent = '';
    els.notesList.appendChild(frag);

    // El campo de edición se mide ya en el documento: oculto daría altura 0.
    const editor = $('.note-entry__input', els.notesList);
    if (editor) growField(editor);

    // Dos vacíos distintos: no haber escrito nunca, y no encontrar nada.
    els.notesList.hidden = !claves.length;
    els.emptyNotes.hidden = claves.length > 0;

    if (!claves.length) {
      els.emptyNotesTitle.textContent = busca ? 'Sin resultados' : 'Aún no hay notas';
      els.emptyNotesText.textContent = busca
        ? 'Ninguna nota contiene "' + query.trim() + '".'
        : 'Lo que escribas cada día se queda aquí, junto a cómo te fue. ' +
          'Dentro de unos meses es lo que te dirá por qué una racha se rompió.';
    }
  }

  /**
   * Notas libres. Se editan igual que las del día —lápiz, y ✓ para
   * terminar—, con un título opcional. `editingKey` es 'free:<id>' cuando la
   * abierta es una de estas: así las dos listas comparten un solo "qué se
   * está editando" y nunca hay dos editores abiertos a la vez.
   */
  function renderFreeNotes(busca, editingKey) {
    const hoy = U.todayKey();
    const todas = S.getFreeNotes();
    const lista = todas.filter(function (n) {
      return !busca || (n.title + '\n' + n.text).toLowerCase().indexOf(busca) >= 0;
    });

    const frag = document.createDocumentFragment();
    lista.forEach(function (n) {
      const editando = editingKey === 'free:' + n.id;
      const titulo = n.title || 'Sin título';
      const item = el('li', { class: 'note-entry free-note' + (editando ? ' is-editing' : '') });

      const head = el('div', { class: 'note-entry__head' });
      // Mientras se edita, el título ya está en su campo: arriba no se repite.
      head.appendChild(el('span', {
        class: 'free-note__title' + (n.title && !editando ? '' : ' is-empty'),
        text: editando ? 'Editando' : titulo
      }));

      const dia = U.toKey(new Date(n.updated || Date.now()));
      const dias = U.daysBetween(dia, hoy);
      head.appendChild(el('span', {
        class: 'note-entry__tag',
        text: dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : U.formatShort(U.fromKey(dia))
      }));

      head.appendChild(el('button', {
        type: 'button', class: 'icon-btn note-entry__edit', 'data-free-edit': n.id,
        'aria-pressed': editando ? 'true' : 'false',
        'aria-label': (editando ? 'Terminar de editar ' : 'Editar ') + titulo,
        title: editando ? 'Listo' : 'Editar',
        text: editando ? '✓' : '✎'
      }));
      item.appendChild(head);

      if (editando) {
        const t = el('input', {
          type: 'text', class: 'input free-note__title-input', 'data-free': n.id,
          maxlength: '60', placeholder: 'Título (opcional)', 'aria-label': 'Título de la nota'
        });
        t.value = n.title;
        item.appendChild(t);

        const ta = el('textarea', {
          class: 'input input--area note-grow free-note__input', 'data-free': n.id,
          rows: '3', placeholder: 'Escribe…', 'aria-label': 'Texto de la nota'
        });
        ta.value = n.text;
        item.appendChild(ta);

        const foot = el('div', { class: 'free-note__foot' });
        foot.appendChild(el('button', {
          type: 'button', class: 'btn btn--ghost btn--danger', 'data-free-delete': n.id, text: 'Eliminar'
        }));
        item.appendChild(foot);
      } else if (n.text.trim()) {
        item.appendChild(el('p', { class: 'note-entry__text', text: n.text }));
      }

      frag.appendChild(item);
    });

    els.freeNotesList.textContent = '';
    els.freeNotesList.appendChild(frag);
    els.freeNotesList.hidden = !lista.length;

    const editor = $('.free-note__input', els.freeNotesList);
    if (editor) growField(editor);

    els.freeNotesHint.hidden = lista.length > 0;
    els.freeNotesHint.textContent = busca && todas.length
      ? 'Ninguna nota libre contiene "' + busca + '".'
      : 'Objetivos, listas, ideas… lo que no va atado a un día.';
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

  /**
   * Progreso: quién eres. Nivel, atributos, rachas y logros.
   * El calendario y la gráfica viven en Histórico desde la 1.6.0 — eran
   * series temporales metidas en una pantalla de personaje.
   */
  function renderProgress(dateKey) {
    renderLevelPanel();
    setStat(els.statStreak, String(St.topStreak(dateKey)));
    setStat(els.statBest, String(S.getGame().bestStreak));
    // Misiones = veces que se ha cumplido un hábito. Logros = los ya ganados.
    setStat(els.statQuests, String(St.totalCompletions()));
    setStat(els.statTrophies, S.getGame().achievements.length + '/' + St.ACHIEVEMENTS.length);
    renderAttributes(dateKey);
    renderStreakPair(dateKey);
    renderAscents();

    renderStreakList(dateKey);
    renderAvoidList(dateKey);
    renderAchievements();
  }

  /**
   * Pinta el tramo gris de una ficha de cumplimiento: dónde quedaría el
   * porcentaje si se cumplieran los `faltan` hábitos que quedan hoy.
   *
   * El día de hoy ya está dentro del total del periodo —lo que falta no
   * engorda el denominador—, así que la cuenta es directa.
   */
  function aheadStat(ghost, hint, rate, faltan) {
    const hay = faltan > 0 && rate.total > 0;
    const pct = hay ? Math.round(((rate.done + faltan) / rate.total) * 100) : 0;

    ghost.hidden = !hay;
    ghost.style.setProperty('--pct', pct);

    hint.hidden = !hay || pct === rate.pct;
    hint.textContent = hay ? 'Hasta ' + pct + '% si cumples hoy' : '';
  }

  /**
   * La parte de Histórico que depende del periodo: cumplimiento de la semana
   * y del mes, calendario y gráfica de evolución.
   */
  function renderHistory(dateKey, period, scale) {
    const weekStart = S.getSettings().weekStart;
    const week = St.weekRate(dateKey, weekStart);
    const month = St.monthRate(dateKey);

    setStat(els.statWeek, week.total ? week.pct + '%' : '—');
    setStat(els.statMonth, month.total ? month.pct + '%' : '—');

    // Las barras muestran el mismo dato que la cifra, no uno nuevo
    els.statWeekBar.style.setProperty('--pct', week.total ? week.pct : 0);
    els.statMonthBar.style.setProperty('--pct', month.total ? month.pct : 0);

    // Previsión: solo tiene sentido mirando el día de hoy. En un periodo
    // pasado no queda nada por cumplir, así que no se pinta nada.
    const pend = dateKey === U.todayKey() ? St.pendingToday(dateKey) : { habits: 0, xp: 0 };
    aheadStat(els.statWeekGhost, els.statWeekAhead, week, pend.habits);
    aheadStat(els.statMonthGhost, els.statMonthAhead, month, pend.habits);

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

  /** El glifo de cada celda. Lo pinta el CSS desde data-mark. */
  function WEEK_MARK(state, parcial) {
    if (state === 'done') return '✓';
    if (state === 'frozen') return '❄';
    if (state === 'marked') return '·';
    if (parcial) return '•';
    if (state === 'missed') return '✕';
    return '';                      // pendiente y futuro van en blanco
  }

  /**
   * Lo acumulado de los hábitos por cantidad en la semana mostrada. La
   * rejilla dice si cumpliste; esto dice cuánto, que en los pasos es la
   * pregunta de verdad.
   */
  function renderWeekTotals(dateKeys) {
    const frag = document.createDocumentFragment();
    let alguno = false;

    S.getHabits()
      .filter(function (h) { return h.type === 'quantity'; })
      .forEach(function (habit) {
        const total = St.habitSumOver(habit, dateKeys);
        if (!total) return;
        alguno = true;

        const item = el('li', { class: 'week-total' });
        item.style.setProperty('--habit-color', habit.color);
        item.appendChild(el('span', { 'aria-hidden': 'true', text: habit.icon }));
        item.appendChild(el('strong', { text: fmtNum.format(total) }));
        item.appendChild(el('span', { class: 'week-total__unit', text: habit.target.unit }));
        item.setAttribute('aria-label', habit.name + ': ' + fmtNum.format(total) + ' ' +
                                        habit.target.unit + ' esta semana');
        frag.appendChild(item);
      });

    els.weekTotals.textContent = '';
    els.weekTotals.appendChild(frag);
    els.weekTotals.hidden = !alguno;
  }

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

    renderWeekTotals(dateKeys);

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
            class: 'week-cell', 'data-state': 'off', 'data-level': '0', 'data-mark': '–',
            title: label, 'aria-label': label, role: 'img'
          }));
          return;
        }

        const detail = cell.level && cell.state !== 'done'
          ? label + ' · ' + Math.round(cell.ratio * 100) + '%'
          : label;

        // A medias = empezado pero sin llegar a la meta. Merece su propio
        // símbolo: con solo el relleno no se distingue de un día en blanco.
        const parcial = cell.state !== 'done' && cell.ratio > 0;

        const btn = el('button', {
          type: 'button',
          class: 'week-cell',
          'data-state': cell.state,
          'data-level': String(cell.level),
          'data-date': cell.key,
          'data-partial': parcial ? 'true' : null,
          'data-mark': WEEK_MARK(cell.state, parcial),
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

    // Récord, tasa de éxito y fallos de la semana: las métricas que antes
    // llevaba cada tarjeta de "Hoy" viven aquí.
    if (row.best > 0) {
      under.appendChild(el('span', { class: 'streak-item__best', text: '🏆 ' + row.best }));
    }
    if (row.rate && row.rate.total) {
      under.appendChild(el('span', { class: 'streak-item__best', text: '📊 ' + row.rate.pct + '%' }));
    }
    if (clean && row.fails) {
      under.appendChild(el('span', {
        class: 'streak-item__best streak-item__best--bad', text: '❌ ' + row.fails
      }));
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

    const weekStart = S.getSettings().weekStart;

    habits
      .map(function (h) {
        return {
          habit: h,
          current: St.currentStreak(h, dateKey),
          best: St.bestStreak(h, dateKey),
          rate: St.habitRate(h, dateKey, 30),
          fails: St.failsThisWeek(h, dateKey, weekStart)
        };
      })
      .sort(function (a, b) { return b.current - a.current || b.best - a.best; })
      .forEach(function (row) { frag.appendChild(streakRow(row, true)); });

    els.avoidList.textContent = '';
    els.avoidList.appendChild(frag);
  }

  /**
   * Gráfica de valores del hábito: lo que registraste cada día, no el
   * porcentaje. Comparte motor y clases con la de Progreso, pero su eje Y
   * va en unidades reales y lleva la meta marcada con una línea.
   */
  function renderValueChart(habit, todayKey) {
    const series = St.habitValueSeries(habit, todayKey, 30);
    const meta = habit.target.amount;
    const unidad = habit.target.unit;
    // Con un máximo, la línea de guiones es un techo: lo que la supera es lo
    // malo, al revés que con una meta.
    const capped = St.isCapped(habit);

    const width = Math.max(els.habitChart.clientWidth || 0, CHART.minW);
    const ml = 40;                       // más margen: aquí caben "12.400"
    const plotW = width - ml - CHART.mr;
    const plotH = CHART.h - CHART.mt - CHART.mb;
    const base = CHART.mt + plotH;

    // La escala incluye siempre la meta: si nunca la alcanzas, tiene que
    // verse lo lejos que queda, no quedarse fuera del lienzo.
    const pico = series.reduce(function (m, p) { return Math.max(m, p.value); }, 0);
    const top = Math.max(pico, meta) * 1.1 || 1;

    const svg = svgEl('svg', {
      class: 'chart__svg', width: width, height: CHART.h,
      viewBox: '0 0 ' + width + ' ' + CHART.h, role: 'img',
      'aria-label': 'Valores diarios de ' + habit.name + ' en los últimos 30 días, en ' + unidad
    });

    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', {
      id: 'valueAreaGrad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: CHART.mt, x2: 0, y2: base
    });
    grad.appendChild(svgEl('stop', { class: 'chart__area-a', offset: '0' }));
    grad.appendChild(svgEl('stop', { class: 'chart__area-b', offset: '1' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    const y = function (v) { return base - (v / top) * plotH; };
    const x = function (i) { return ml + i * (plotW / series.length) + (plotW / series.length) / 2; };

    [0, top / 2, top].forEach(function (v) {
      svg.appendChild(svgEl('line', {
        class: 'chart__grid', x1: ml, y1: y(v), x2: width - CHART.mr, y2: y(v)
      }));
      const label = svgEl('text', { class: 'chart__axis', x: ml - 6, y: y(v) + 3, 'text-anchor': 'end' });
      label.textContent = fmtNum.format(Math.round(v));
      svg.appendChild(label);
    });

    // La meta, de guiones: el listón que hay que pasar.
    svg.appendChild(svgEl('line', {
      class: 'chart__goal', x1: ml, y1: y(meta), x2: width - CHART.mr, y2: y(meta)
    }));

    let linea = '';
    let area = '';
    let abierto = false;

    series.forEach(function (p, i) {
      if (!p.hasData) { if (abierto) area += 'L' + x(i - 1) + ',' + base + 'Z'; abierto = false; return; }
      linea += (abierto ? 'L' : 'M') + x(i) + ',' + y(p.value);
      area += abierto ? 'L' + x(i) + ',' + y(p.value)
                      : 'M' + x(i) + ',' + base + 'L' + x(i) + ',' + y(p.value);
      abierto = true;
    });
    if (abierto) area += 'L' + x(series.length - 1) + ',' + base + 'Z';

    if (area) svg.appendChild(svgEl('path', { class: 'chart__area chart__area--value', d: area }));
    if (linea) svg.appendChild(svgEl('path', { class: 'chart__line', d: linea }));

    const slot = plotW / series.length;
    series.forEach(function (p, i) {
      if (!p.hasData) return;

      const marca = capped
        ? (p.value > meta ? ' chart__dot--over' : '')
        : (p.value >= meta ? ' chart__dot--goal' : '');
      svg.appendChild(svgEl('circle', {
        class: 'chart__dot' + marca,
        cx: x(i), cy: y(p.value), r: 3
      }));

      const hit = svgEl('rect', {
        class: 'chart__hit', x: ml + i * slot, y: CHART.mt, width: slot, height: plotH
      });
      const title = svgEl('title');
      title.textContent = p.full + ': ' + fmtNum.format(p.value) +
                          (capped ? ' de máximo ' : ' de ') +
                          fmtNum.format(meta) + ' ' + unidad;
      hit.appendChild(title);
      svg.appendChild(hit);
    });

    series.forEach(function (p, i) {
      if (i !== 0 && (i + 1) % 7 !== 0 && i !== series.length - 1) return;
      const label = svgEl('text', {
        class: 'chart__axis', x: x(i), y: CHART.h - 7, 'text-anchor': 'middle'
      });
      label.textContent = p.label;
      svg.appendChild(label);
    });

    svg.appendChild(svgEl('line', {
      class: 'chart__baseline', x1: ml, y1: base, x2: width - CHART.mr, y2: base
    }));

    els.habitChart.textContent = '';
    els.habitChart.appendChild(svg);

    const conDatos = series.filter(function (p) { return p.hasData && p.value > 0; });

    if (capped) {
      const pasados = conDatos.filter(function (p) { return p.value > meta; }).length;
      els.hChartReadout.textContent = conDatos.length
        ? conDatos.length + ' días con registro · ' + pasados +
          (pasados === 1 ? ' pasado' : ' pasados') + ' del máximo de ' + fmtNum.format(meta) + ' ' + unidad
        : 'Todavía no hay valores registrados.';
      return;
    }

    const sobreMeta = conDatos.filter(function (p) { return p.value >= meta; }).length;
    els.hChartReadout.textContent = conDatos.length
      ? conDatos.length + ' días con registro · ' + sobreMeta + ' por encima de la meta de ' +
        fmtNum.format(meta) + ' ' + unidad
      : 'Todavía no hay valores registrados.';
  }

  function renderStreakList(dateKey) {
    const habits = S.getHabits().filter(function (h) { return !St.isAvoid(h); });
    const frag = document.createDocumentFragment();

    const rows = habits.map(function (h) {
      return {
        habit: h,
        current: St.currentStreak(h, dateKey),
        best: St.bestStreak(h, dateKey),
        rate: St.habitRate(h, dateKey, 30)
      };
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

    // Plegado por defecto, así que la cuenta va en la cabecera: es lo que
    // se quiere saber sin abrir.
    els.achCount.textContent = unlocked.length + '/' + St.ACHIEVEMENTS.length;
  }

  /* ── Ficha de un hábito ───────────────────────────────────── */

  function habitSummary(habit) {
    const days = habit.activeDays.length === 7
      ? 'todos los días'
      : habit.activeDays.map(U.weekdayName).join(', ');

    let what;
    if (habit.type === 'quantity') what = habit.target.amount + ' ' + habit.target.unit + ' al día';
    else if (habit.type === 'schedule') what = habit.slots.map(function (s) { return St.SLOT_LABELS[s]; }).join(' + ');
    else if (St.isCapped(habit)) what = 'Máximo ' + habit.target.amount + ' ' + habit.target.unit + ' al día';
    else if (habit.type === 'avoid') {
      what = habit.slots
        ? 'A evitar: ' + habit.slots.map(function (s) { return St.SLOT_LABELS[s]; }).join(' + ')
        : 'A evitar · crítico con ' + St.limitOf(habit) + (St.limitOf(habit) === 1 ? ' fallo' : ' fallos');
    }
    else what = 'Check diario';

    // Si esta semana tiene plan propio, se dice: si no, la ficha diría unos
    // días y Hoy enseñaría otros.
    const semana = S.activeDaysFor(habit, U.todayKey());
    const plan = sameDayList(semana, habit.activeDays) ? ''
      : ' · Esta semana: ' + (semana.length ? semana.map(U.weekdayName).join(', ') : 'ninguno');

    return what + ' · ' + days + plan;
  }

  /**
   * Cartel de pausa en la ficha. Dice desde cuándo y por qué: al volver a
   * un hábito parado hace un mes, el motivo es la mitad de la decisión de
   * si retomarlo o dejarlo ir.
   */
  function renderPauseBanner(habit, todayKey) {
    const pausa = S.pauseInfo(habit);
    const ausencia = pausa ? null : S.absenceOf(habit);

    els.pauseBanner.hidden = !pausa && !ausencia;
    els.btnPauseHabit.hidden = !!pausa || habit.archived;
    // Reanudar es para la pausa indefinida; una ausencia se cancela en Plan.
    els.btnResumeHabit.hidden = !pausa;

    if (ausencia) {
      const m = U.pauseReasonById(ausencia.reason);
      const ultimo = U.addDaysKey(ausencia.to, -1);
      els.pauseBannerIcon.textContent = m ? m.icon : '⏸';
      els.pauseBannerTitle.textContent = (ausencia.from <= todayKey ? 'En pausa · ' : 'Ausencia programada · ') +
        pauseLabel(ausencia);
      els.pauseBannerMeta.textContent = 'Del ' + U.formatShort(U.fromKey(ausencia.from)) +
        ' al ' + U.formatShort(U.fromKey(ultimo)) + ' · se gestiona en Plan';
      return;
    }

    if (!pausa) return;

    const dias = U.daysBetween(pausa.from, todayKey);
    const motivo = U.pauseReasonById(pausa.reason);

    els.pauseBannerIcon.textContent = motivo ? motivo.icon : '⏸';
    els.pauseBannerTitle.textContent = 'En pausa · ' + pauseLabel(pausa);
    els.pauseBannerMeta.textContent = 'Desde el ' + U.formatShort(U.fromKey(pausa.from)) +
      (dias > 0 ? ' · ' + dias + (dias === 1 ? ' día' : ' días') : ' · hoy mismo');
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

    renderPauseBanner(habit, todayKey);

    // Solo la etiqueta: el botón lleva un SVG dentro y textContent lo borraría.
    const archiveLabel = habit.archived ? 'Restaurar hábito' : 'Archivar hábito';
    els.btnArchiveHabit.title = archiveLabel;
    els.btnArchiveHabit.setAttribute('aria-label', archiveLabel);
    els.btnArchiveHabit.classList.toggle('is-on', habit.archived);

    renderHabitSums(habit, todayKey, weekStart);
    renderHabitHeatmap(habit, monthDate, weekStart, todayKey);
    renderWeekBars(habit, todayKey, weekStart);
  }

  /**
   * Totales acumulados. Solo tiene sentido en los hábitos por cantidad: en
   * un check sumar "veces" ya lo dice la ficha "Veces cumplido".
   */
  function renderHabitSums(habit, todayKey, weekStart) {
    const capped = St.isCapped(habit);
    const conCantidad = habit.type === 'quantity' || capped;
    els.hSumsCard.hidden = !conCantidad;
    els.hChartCard.hidden = !conCantidad;
    if (!conCantidad) return;

    renderValueChart(habit, todayKey);

    const s = St.habitSums(habit, todayKey, weekStart);
    const u = habit.target.unit;
    const con = function (n) { return fmtNum.format(Math.round(n * 10) / 10) + ' ' + u; };

    els.hSumWeek.textContent = con(s.week);
    els.hSumMonth.textContent = con(s.month);
    els.hSumAvg.textContent = s.days ? con(s.avg) : '—';

    if (capped) {
      /* Con un máximo diario cambian tres fichas: lo útil no es el total de
         siempre sino compararte con la semana pasada, el "mejor día" sería
         el de más minutos (el peor), y la racha de apuntar importa menos que
         cuántos días te pasaste. */
      els.hSumTotalLabel.textContent = 'Semana pasada';
      els.hSumTotal.textContent = con(s.lastWeek);
      els.hSumBestLabel.textContent = 'Día más alto';
      els.hSumBest.textContent = s.best ? con(s.best) : '—';
      els.hSumDaysLabel.textContent = 'Pasados este mes';
      els.hSumDays.textContent = s.overMonth + (s.overMonth === 1 ? ' día' : ' días');

      els.hSumsNote.textContent = capWeekNote(habit, s);
      return;
    }

    els.hSumTotalLabel.textContent = 'Total histórico';
    els.hSumTotal.textContent = con(s.total);
    els.hSumBestLabel.textContent = 'Mejor día';
    els.hSumBest.textContent = s.best ? con(s.best) : '—';

    // Racha de apuntar, no de cumplir: en los pasos casi nunca llegas a la
    // meta, pero registrar a diario ya es constancia.
    els.hSumDaysLabel.textContent = 'Racha apuntando';
    const apuntando = St.logStreak(habit, todayKey);
    els.hSumDays.textContent = apuntando + (apuntando === 1 ? ' día' : ' días');

    els.hSumsNote.textContent = s.bestDay
      ? 'Tu mejor día fue el ' + U.formatShort(U.fromKey(s.bestDay)) + ', y llevas ' + s.days +
        ' días con registro en total. La media cuenta solo esos días, no los que no apuntaste nada.'
      : 'Todavía no has registrado ningún valor en este hábito.';
  }

  /**
   * La tendencia de un hábito con máximo, en una frase. Compara esta semana
   * con la anterior A ESTAS ALTURAS: un martes, dos días contra siete
   * siempre diría que vas mejor.
   */
  function capWeekNote(habit, s) {
    const u = ' ' + habit.target.unit;
    const fmt = function (n) { return fmtNum.format(Math.round(n)); };

    if (!s.days) return 'Todavía no has apuntado nada. Escribe en Hoy cuánto llevas cada día.';

    if (!s.lastWeekSoFar && !s.week) {
      return 'Esta semana todavía no has apuntado nada.';
    }

    const diff = s.week - s.lastWeekSoFar;
    let tendencia;
    if (!s.lastWeekSoFar) tendencia = 'La semana pasada no apuntaste nada a estas alturas, así que aún no hay con qué comparar.';
    else if (Math.abs(diff) < 1) tendencia = 'Igual que la semana pasada a estas alturas.';
    else if (diff < 0) tendencia = fmt(-diff) + u + ' menos que la semana pasada a estas alturas.';
    else tendencia = fmt(diff) + u + ' más que la semana pasada a estas alturas.';

    return 'Esta semana llevas ' + fmt(s.week) + u + '. ' + tendencia +
      ' La media cuenta solo los días que apuntaste algo.';
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
      const value = S.getLog(habit.id, key);
      let label;

      if (level === null) {
        label = date + ': no tocaba';
      } else if (habit.type === 'quantity') {
        // El valor exacto del día, que hasta ahora solo se veía volviendo a
        // ese día en Hoy: "8 de 10 páginas" dice mucho más que "sin cumplir".
        label = date + ': ' + (Number(value) || 0) + ' de ' + habit.target.amount +
                ' ' + habit.target.unit;
      } else if (St.isCapped(habit)) {
        label = date + ': ' + (Number(value) || 0) + ' de máximo ' + habit.target.amount +
                ' ' + habit.target.unit + (St.isComplete(habit, value) ? '' : ' · pasado');
      } else {
        label = date + ': ' + (St.isComplete(habit, value) ? 'cumplido' : 'sin cumplir');
      }

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
    els.setAccent.value = s.accent;
    els.setStreakGoal.value = s.streakGoal;
    els.streakGoalHint.textContent = 'Hoy tocan ' + St.dayStats(U.todayKey()).total +
      ' hábitos: necesitas ' + St.streakGoalFor(U.todayKey()) + '.';
    els.setControls.value = s.controls;
    els.setTheme.value = s.theme;
    els.setFontSize.value = s.fontSize;
    els.setBackup.value = String(s.backupDays);
    els.setHideDone.setAttribute('aria-checked', s.hideDone ? 'true' : 'false');
    els.setDayBar.setAttribute('aria-checked', s.showDayBar ? 'true' : 'false');
    els.setShowFreeze.setAttribute('aria-checked', s.showFreeze ? 'true' : 'false');
    els.setShowNotes.setAttribute('aria-checked', s.showNotes ? 'true' : 'false');
    els.setShowWeight.setAttribute('aria-checked', s.showWeight ? 'true' : 'false');

    applyControls(s.controls);
    applyTheme(s.theme);
    applyFontSize(s.fontSize);
    applyDayLayout(s);

    renderBackupStatus(s);
    els.setEffects.setAttribute('aria-checked', s.effects ? 'true' : 'false');
    renderArchived();
    renderBuildInfo();
  }

  /**
   * Estado de la copia de seguridad, con su color. "Fuera de plazo" se mide
   * contra el aviso que haya elegido el usuario; con los avisos en "Nunca"
   * se enseña el dato sin regañar, porque ahí no hay plazo que incumplir.
   */
  function renderBackupStatus(s) {
    const last = S.getGame().lastExport;
    const dias = last ? U.daysBetween(last, U.todayKey()) : null;
    const tarde = s.backupDays > 0 && dias !== null && dias >= s.backupDays;

    let estado = 'ok';
    if (!last) estado = 'never';
    else if (tarde) estado = 'late';

    els.backupStatus.dataset.state = estado;

    if (!last) {
      els.backupIcon.textContent = '⚠️';
      els.backupTitle.textContent = 'Sin ninguna copia';
      els.backupHint.textContent = 'Si este navegador pierde sus datos, no hay de dónde recuperarlos.';
      return;
    }

    const cuando = dias === 0 ? 'hoy'
      : dias === 1 ? 'ayer'
      : 'hace ' + dias + ' días';

    els.backupIcon.textContent = tarde ? '⚠️' : '💾';
    // Sin plazo no se puede decir "al día": no hay contra qué compararlo.
    els.backupTitle.textContent = tarde ? 'Copia atrasada'
      : s.backupDays > 0 ? 'Copia al día' : 'Última copia';
    els.backupHint.textContent = 'La última la exportaste ' + cuando +
      ', el ' + U.formatShort(U.fromKey(last)) + '.';
  }

  /** 1234 bytes → "1,2 KB"; por debajo de 10 KB con un decimal. */
  function formatKB(bytes) {
    const kb = bytes / 1024;
    return kb.toLocaleString('es-ES', { maximumFractionDigits: kb < 10 ? 1 : 0 }) + ' KB';
  }

  /** Suma lo que ocupan las respuestas guardadas en una caché. */
  function cacheBytes(name) {
    return caches.open(name).then(function (cache) {
      return cache.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (req) {
          return cache.match(req)
            .then(function (res) { return res ? res.blob() : null; })
            .then(function (b) { return b ? b.size : 0; });
        }));
      });
    }).then(function (sizes) {
      return sizes.reduce(function (a, b) { return a + b; }, 0);
    });
  }

  /**
   * Tus datos frente al tope de localStorage (5 MB). La caché de la app no
   * cuenta: va aparte y su cuota es de gigas. Lo que ocupen otras apps de
   * alexlobar.github.io sí resta, porque el tope es del origen entero.
   */
  function renderQuota(uso) {
    const pct = (uso.mine + uso.others) / uso.max * 100;
    let texto = 'Datos: ' + formatKB(uso.mine) + ' de ' + formatKB(uso.max) + ' máx.';
    if (uso.others >= 1024) texto += ' · otras apps: ' + formatKB(uso.others);
    if (pct >= 1) texto += ' (' + Math.round(pct) + ' %)';

    els.buildQuota.textContent = texto;
    els.buildQuota.dataset.state = pct >= 90 ? 'full' : pct >= 70 ? 'high' : 'ok';
    els.buildQuota.title = 'El navegador guarda hasta 5 MB por sitio. Un día con todos ' +
      'los hábitos, nota y peso ocupa menos de 1 KB.';
  }

  /**
   * ¿Puede el navegador borrar los datos por su cuenta? app.js pide la
   * protección al arrancar; aquí solo se enseña el resultado. Sin la API
   * (navegadores viejos) no se dice nada: no hay nada que el usuario pueda
   * hacer con esa información.
   */
  function renderPersist() {
    const box = els.buildPersist;
    if (!navigator.storage || !navigator.storage.persisted) { box.hidden = true; return; }

    navigator.storage.persisted().then(function (yes) {
      box.hidden = false;
      box.dataset.state = yes ? 'ok' : 'risk';
      box.textContent = yes ? '🔒 Protegidos: el navegador no los borrará'
                            : '⚠️ Sin proteger: el navegador podría borrarlos';
      box.title = yes
        ? 'El navegador los trata como persistentes: no los borra aunque le falte espacio.'
        : 'Si le falta espacio (o, en Safari, tras días sin abrirla) podría borrarlos. ' +
          'Instalar la app y usarla a menudo suele bastar para que los proteja. Exporta copias.';
    }).catch(function () { box.hidden = true; });
  }

  function setBuildHint(text) {
    els.buildHint.textContent = text;
    els.buildHint.hidden = !text;
  }

  /**
   * Una sola línea: la versión que guarda la caché offline, su fecha y lo
   * que ocupa todo (app guardada + tus datos). Solo dice algo más cuando la
   * caché no coincide con el código, que es la causa habitual de "he subido
   * los cambios y el móvil no los ve".
   */
  function renderBuildInfo() {
    const uso = S.storageUse();
    const datos = uso.mine;
    renderQuota(uso);
    renderPersist();
    const linea = function (version, appBytes) {
      return 'v' + version + (version === U.version ? ' · ' + U.buildDate() : '') +
             ' · ' + formatKB(appBytes + datos);
    };

    setBuildHint('');
    els.buildCache.dataset.state = 'plain';
    els.buildCache.title = '';

    // Se comprueba el protocolo y no isSecureContext: file:// cuenta como
    // contexto seguro, pero su CacheStorage no se puede leer.
    if (location.protocol === 'file:' || !window.caches) {
      els.buildCache.textContent = linea(U.version, 0);
      els.buildCache.title = 'Sin caché offline: solo cuentan tus datos';
      return;
    }

    const esperada = 'habitos-v' + U.version;
    els.buildCache.textContent = 'Comprobando…';

    caches.keys().then(function (keys) {
      const mias = keys.filter(function (k) { return k.indexOf('habitos-') === 0; });

      if (!mias.length) {
        els.buildCache.textContent = linea(U.version, 0);
        setBuildHint('Todavía no se ha guardado una copia offline.');
        return null;
      }

      // Si conviven dos (justo al actualizar) se enseña la nueva y se suman ambas.
      const vieja = mias.indexOf(esperada) < 0;
      const nombre = vieja ? mias[mias.length - 1] : esperada;
      return Promise.all(mias.map(cacheBytes)).then(function (sizes) {
        const app = sizes.reduce(function (a, b) { return a + b; }, 0);
        els.buildCache.textContent = linea(nombre.replace('habitos-v', ''), app);
        els.buildCache.title = 'App ' + formatKB(app) + ' + datos ' + formatKB(datos);
        els.buildCache.dataset.state = vieja ? 'stale' : 'ok';
        if (vieja) {
          setBuildHint('La copia offline no coincide con la v' + U.version +
            '. Cierra la app del todo y ábrela otra vez para que se actualice.');
        }
      });
    }).catch(function () {
      els.buildCache.textContent = linea(U.version, 0);
      els.buildCache.title = 'No se pudo leer la caché: solo cuentan tus datos';
    });
  }

  /**
   * Todos los hábitos, activos y archivados, agrupados por categoría y en
   * orden alfabético igual que en Hoy. Es el único sitio desde el que se
   * llega a un hábito archivado sin restaurarlo antes.
   */
  function renderArchived() {
    const todos = S.getHabits(true);
    const activos = todos.filter(function (h) { return !h.archived; }).length;

    const guardados = todos.length - activos;
    els.allHabitsCount.textContent = todos.length + (todos.length === 1 ? ' hábito' : ' hábitos') +
      (guardados ? ' · ' + guardados + (guardados === 1 ? ' archivado' : ' archivados') : '');

    const frag = document.createDocumentFragment();

    // Cada categoría va plegada: con trece hábitos la tarjeta ocupaba media
    // pantalla de Ajustes. Se despliega la que interese y ya está.
    groupByCategory(todos).forEach(function (group) {
      const wrap = el('li');
      const box = el('details', { class: 'archive-group' });
      if (group.cat.color) box.style.setProperty('--cat-color', group.cat.color);

      const head = el('summary', { class: 'archive-group__head' });
      head.appendChild(el('span', { class: 'archive-group__icon', 'aria-hidden': 'true', text: group.cat.icon }));
      head.appendChild(el('span', { class: 'archive-group__name', text: group.cat.name }));
      head.appendChild(el('span', { class: 'archive-group__count', text: String(group.habits.length) }));
      box.appendChild(head);

      const list = el('ul', { class: 'archive-group__list' });

      group.habits.forEach(function (habit) {
        const item = el('li', { class: 'archive-item' + (habit.archived ? ' is-archived' : '') });

        const open = el('button', {
          type: 'button', class: 'archive-item__open', 'data-open': habit.id,
          'aria-label': 'Ver la ficha de ' + habit.name
        });
        const pausa = S.pauseInfo(habit);

        open.appendChild(el('span', { class: 'archive-item__icon', 'aria-hidden': 'true', text: habit.icon }));
        open.appendChild(el('span', { class: 'archive-item__name', text: habit.name }));
        if (habit.archived) {
          open.appendChild(el('span', { class: 'archive-item__tag', text: 'Archivado' }));
        } else if (pausa) {
          open.appendChild(el('span', {
            class: 'archive-item__tag archive-item__tag--pause', text: pauseLabel(pausa)
          }));
        }
        item.appendChild(open);

        if (habit.archived) {
          item.appendChild(el('button', {
            type: 'button', class: 'btn btn--ghost', 'data-restore': habit.id,
            'aria-label': 'Restaurar ' + habit.name, text: 'Restaurar'
          }));
        } else if (pausa) {
          item.appendChild(el('button', {
            type: 'button', class: 'btn btn--ghost', 'data-resume': habit.id,
            'aria-label': 'Reanudar ' + habit.name, text: 'Reanudar'
          }));
        }
        list.appendChild(item);
      });

      box.appendChild(list);
      wrap.appendChild(box);
      frag.appendChild(wrap);
    });

    els.archiveList.textContent = '';
    els.archiveList.appendChild(frag);
  }

  /* ── Apariencia ───────────────────────────────────────────
     Tres atributos en <html> y el CSS hace el resto. Nada de clases
     repartidas por los componentes. ─────────────────────────── */

  const CONTROLS = ['compact', 'comfy', 'roomy'];
  const FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];

  function applyControls(mode) {
    document.documentElement.dataset.controls =
      CONTROLS.indexOf(mode) >= 0 ? mode : 'compact';
  }

  function applyTheme(theme) {
    const claro = theme === 'light';
    document.documentElement.dataset.theme = claro ? 'light' : 'dark';

    // La barra del navegador en el móvil tiene que seguir al tema.
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', claro ? '#f5f6fa' : '#0b0d12');
  }

  function applyFontSize(size) {
    document.documentElement.dataset.font =
      FONT_SIZES.indexOf(size) >= 0 ? size : 'normal';
  }

  /** Qué partes de Hoy se muestran. */
  function applyDayLayout(s) {
    els.dayProgress.hidden = !s.showDayBar;
    els.noteCard.hidden = !s.showNotes;
    els.weightEntryCard.hidden = !s.showWeight;
    // El de congelar además depende de si ese día hay algo que salvar, así
    // que aquí solo se marca la preferencia y renderDayExtras decide.
    document.documentElement.dataset.freeze = s.showFreeze ? 'on' : 'off';
  }

  /** El color elegido en Ajustes deriva el acento y los 4 niveles del heatmap. */
  function applyAccent(hex) {
    const root = document.documentElement.style;
    const claro = document.documentElement.dataset.theme === 'light';

    root.setProperty('--accent', hex);
    root.setProperty('--accent-hover', claro ? darken(hex, 0.14) : lighten(hex, 0.16));
    // Se ajusta para que el acento siga cumpliendo contraste como texto: se
    // aclara sobre fondo oscuro y se oscurece sobre fondo claro.
    root.setProperty('--accent-text', claro ? darken(hex, 0.28) : lighten(hex, 0.42));
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

  /** Mezcla hacia el negro, para el tema claro. */
  function darken(hex, amount) {
    return 'rgb(' + channels(hex).map(function (c) {
      return Math.round(c * (1 - amount));
    }).join(' ') + ')';
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
      if (habit.type === 'avoid' && !habit.target) els.fLimit.value = St.limitOf(habit);
      U.$$('input[name="type"]', form).forEach(function (r) { r.checked = r.value === habit.type; });
      U.$$('input[name="avoidMode"]', form).forEach(function (r) {
        r.checked = r.value === (St.isCapped(habit) ? 'cap' : 'fails');
      });

      if (habit.type === 'quantity' || St.isCapped(habit)) {
        field('target').value = habit.target.amount;
        field('unit').value = habit.target.unit;
        field('step').value = habit.target.step;
        U.$$('input[name="entry"]', form).forEach(function (r) {
          r.checked = r.value === habit.target.entry;
        });
      }
      U.$$('input[name="slots"]', form).forEach(function (c) {
        c.checked = !!habit.slots && habit.slots.indexOf(c.value) >= 0;
      });
      U.$$('input[name="days"]', form).forEach(function (c) {
        c.checked = habit.activeDays.indexOf(Number(c.value)) >= 0;
      });

    } else {
      U.$$('input[name="days"]', form).forEach(function (c) { c.checked = true; });
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
    const modo = els.habitForm.querySelector('input[name="avoidMode"]:checked');
    // Un hábito a evitar con máximo al día reutiliza los campos de cantidad.
    const cap = type === 'avoid' && !!modo && modo.value === 'cap';

    els.avoidModeFields.hidden = type !== 'avoid';
    els.capHint.hidden = !cap;
    els.quantityFields.hidden = type !== 'quantity' && !cap;
    els.entryFields.hidden = type !== 'quantity';
    els.fTargetLabel.textContent = cap ? 'Máximo al día' : 'Meta diaria';
    // Las franjas valen para los dos: cuándo cumplir, o cuándo no caer. Con
    // un máximo de cantidad no tienen sentido.
    els.slotFields.hidden = (type !== 'schedule' && type !== 'avoid') || cap;
    // "Dejar" invierte la lógica: conviene decirlo antes de guardar, no después.
    // El aviso habla del botón ✗, que solo existe contando fallos.
    els.avoidHint.hidden = type !== 'avoid' || cap;
    els.limitField.hidden = type !== 'avoid' || cap;

    // El incremento solo significa algo si se registra con los botones
    els.stepField.hidden = cap || !entry || entry.value !== 'stepper';
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
      activeDays: days
    };

    if (type === 'avoid') {
      const modo = form.querySelector('input[name="avoidMode"]:checked');

      if (modo && modo.value === 'cap') {
        data.target = {
          amount: Number(field('target').value) || 1,
          unit: field('unit').value.trim() || 'min',
          step: 1,
          entry: 'manual'
        };
        data.slots = null;
      } else {
        // `target: null` explícito: al editar se mezcla con lo guardado, y
        // sin esto un hábito que pasa a contar fallos conservaría su límite.
        data.target = null;
        data.limit = Number(els.fLimit.value) || 2;
        // Franjas opcionales aquí: sin ninguna marcada se cuentan fallos sueltos.
        const franjas = U.$$('input[name="slots"]:checked', form).map(function (c) { return c.value; });
        data.slots = franjas.length ? franjas : null;
      }
    }

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

    // Un aviso puede pedir más tiempo si lo que cuenta no se lee de un vistazo.
    if (o.duration > 0) life = o.duration;

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
    getMissingIds: function () { return missingIds.slice(); },
    renderHeader: renderHeader, renderHabitList: renderHabitList, updateCard: updateCard,
    renderDayExtras: renderDayExtras, pulse: pulse,
    renderWeek: renderWeek,
    openPauseModal: openPauseModal, closePauseModal: closePauseModal,
    renderPlanView: renderPlanView, setPlanOffset: setPlanOffset, getPlanOffset: getPlanOffset,
    resetPlanDraft: resetPlanDraft,
    togglePlanDay: togglePlanDay, resetPlanWeek: resetPlanWeek, readPlan: readPlan,
    openAbsenceModal: openAbsenceModal, closeAbsenceModal: closeAbsenceModal,
    setAbsenceAll: setAbsenceAll, syncAbsenceLength: syncAbsenceLength,
    readAbsenceForm: readAbsenceForm,
    readPauseForm: readPauseForm, syncPauseNote: syncPauseNote, pauseLabel: pauseLabel,
    openDayModal: openDayModal, closeDayModal: closeDayModal,
    readDayForm: readDayForm, syncDayNote: syncDayNote, dayMarkLabel: dayMarkLabel,
    renderDayPicker: renderDayPicker, toggleDayPicker: toggleDayPicker,
    isDayPickerOpen: isDayPickerOpen,
    renderProgress: renderProgress, renderHistory: renderHistory,
    renderNotes: renderNotes, growField: growField,
    renderWeight: renderWeight, renderWeightEntry: renderWeightEntry,
    streakMessage: streakMessage,
    renderLevelPanel: renderLevelPanel,
    showLevelUp: showLevelUp, hideLevelUp: hideLevelUp,
    renderAttributes: renderAttributes, renderHabitView: renderHabitView,
    renderSettings: renderSettings, renderPersist: renderPersist, applyAccent: applyAccent, applyControls: applyControls,
    applyTheme: applyTheme, applyFontSize: applyFontSize,
    openModal: openModal, closeModal: closeModal,
    toggleEmojiPicker: toggleEmojiPicker, markSelectedEmoji: markSelectedEmoji,
    syncTypeFields: syncTypeFields,
    readForm: readForm, toast: toast, celebrate: celebrate, buzz: buzz
  };
})();
