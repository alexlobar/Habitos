/* ============================================================
   utils.js — Utilidades puras: fechas, DOM y varios.
   No conoce el estado de la app ni toca localStorage.
   ============================================================ */
window.HT = window.HT || {};

HT.utils = (function () {
  'use strict';

  /* ── Fechas ───────────────────────────────────────────────
     Toda la app identifica un día con una clave "YYYY-MM-DD"
     construida en HORA LOCAL. Usar toISOString() aquí sería un
     bug: convierte a UTC y desplaza un día entero a quien esté
     en un huso negativo o de madrugada. ───────────────────── */

  /* ── Versión ──────────────────────────────────────────────
     Fuente única de la versión: MAYOR.MENOR.PARCHE.
       · PARCHE (1.0.1) → correcciones y retoques visuales.
       · MENOR  (1.1.0) → funcionalidad nueva compatible.
       · MAYOR  (2.0.0) → rediseño o cambio de datos incompatible.
     No se sube sola: se cambia a mano al publicar una versión. El único
     otro sitio donde aparece es CACHE en sw.js, porque un service worker
     no puede leer este archivo; si se desincronizan, Ajustes lo avisa en
     vez de callarse. ─────────────────────────────────────── */
  const VERSION = '1.0.1';
  const BUILD_DATE = '2026-09-17';

  /* ── Colores predeterminados ──────────────────────────────
     Catálogo de acentos. Hoy solo se usa el primero, pero la tabla ya
     está aquí para que añadir el resto sea rellenar la lista y pintar un
     selector: ningún componente define su color, todos leen los tokens
     que applyAccent() deriva de este valor. ───────────────── */
  const ACCENTS = [
    { id: 'system', name: 'Azul System', hex: '#4361ee' },
    { id: 'violet', name: 'Violeta',     hex: '#7c5cff' },
    { id: 'green',  name: 'Verde',       hex: '#12a07a' },
    { id: 'orange', name: 'Naranja',     hex: '#d9700f' },
    { id: 'red',    name: 'Rojo',        hex: '#d63d5c' }
  ];
  const DEFAULT_ACCENT = ACCENTS[0].hex;

  function accentById(id) {
    return ACCENTS.filter(function (a) { return a.id === id; })[0] || null;
  }

  const DAY_NAMES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                       'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /** Date → "YYYY-MM-DD" en hora local. */
  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /** "YYYY-MM-DD" → Date a medianoche local. */
  function fromKey(key) {
    const parts = String(key).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function isValidKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
    const d = fromKey(key);
    return !isNaN(d.getTime()) && toKey(d) === key;   // descarta 2025-02-30
  }

  function todayKey() {
    return toKey(new Date());
  }

  /** Suma días respetando cambios de mes, año bisiesto y horario de verano. */
  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function addDaysKey(key, n) {
    return toKey(addDays(fromKey(key), n));
  }

  /** Días naturales entre dos claves (b - a). Inmune al horario de verano. */
  function daysBetween(keyA, keyB) {
    const a = fromKey(keyA);
    const b = fromKey(keyB);
    return Math.round((b - a) / 86400000);
  }

  /** Lunes (weekStart=1) o domingo (weekStart=0) de la semana de `date`. */
  function startOfWeek(date, weekStart) {
    const diff = (date.getDay() - weekStart + 7) % 7;
    return addDays(date, -diff);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /** Día 0 del mes siguiente = último día de este mes (28/29/30/31). */
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Rejilla del mes para el heatmap: huecos `null` al inicio para
   * alinear el día 1 con su columna, después una clave por día.
   */
  function monthGrid(year, month, weekStart) {
    const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    const total = daysInMonth(year, month);
    const cells = new Array(lead).fill(null);
    for (let d = 1; d <= total; d++) cells.push(toKey(new Date(year, month, d)));
    return cells;
  }

  /**
   * Rejilla anual en orden de columna (una columna = una semana), para
   * pintarla con `grid-auto-flow: column` sobre 7 filas. Los días que caen
   * fuera del año van como `null` para dejar el hueco.
   */
  function yearGrid(year, weekStart) {
    const first = new Date(year, 0, 1);
    const last = new Date(year, 11, 31);
    const start = startOfWeek(first, weekStart);
    const end = addDays(startOfWeek(last, weekStart), 6);

    const cells = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      cells.push(d.getFullYear() === year ? toKey(d) : null);
    }
    return cells;
  }

  /** Cabeceras de columna del calendario, rotadas según el inicio de semana. */
  function weekdayLabels(weekStart) {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(DAY_NAMES[(i + weekStart) % 7]);
    return out;
  }

  /** Números de día (0=domingo) en el orden en que se muestran. */
  function weekdayOrder(weekStart) {
    const out = [];
    for (let i = 0; i < 7; i++) out.push((i + weekStart) % 7);
    return out;
  }

  function weekdayName(dow) {
    return DAY_SHORT[dow];
  }

  function monthName(month) {
    return MONTH_SHORT[month];
  }

  /** Últimos `n` días hasta `endKey` incluido, en orden cronológico. */
  function lastNDays(endKey, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(addDaysKey(endKey, -i));
    return out;
  }

  const fmtLong = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  const fmtShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

  /** "v1.0.0 · 17/09/2026" */
  function buildLabel() {
    const d = fromKey(BUILD_DATE);
    return 'v' + VERSION + ' · ' +
           String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function formatLong(date) { return fmtLong.format(date); }
  function formatMonth(date) { return fmtMonth.format(date); }
  function formatShort(date) { return fmtShort.format(date); }

  /* ── DOM ──────────────────────────────────────────────────── */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** createEl('button', { class:'btn', 'aria-pressed':'false' }, ['Texto']) */
  function createEl(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === false || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === '--') node.style.setProperty(k, v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ── Varios ───────────────────────────────────────────────── */

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function debounce(fn, wait) {
    let t = null;
    function wrapped() {
      const args = arguments;
      const self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    }
    wrapped.cancel = function () { clearTimeout(t); t = null; };
    return wrapped;
  }

  return {
    version: VERSION, buildLabel: buildLabel,
    ACCENTS: ACCENTS, DEFAULT_ACCENT: DEFAULT_ACCENT, accentById: accentById,
    toKey: toKey, fromKey: fromKey, isValidKey: isValidKey, todayKey: todayKey,
    addDays: addDays, addDaysKey: addDaysKey, daysBetween: daysBetween,
    startOfWeek: startOfWeek, startOfMonth: startOfMonth, daysInMonth: daysInMonth,
    monthGrid: monthGrid, yearGrid: yearGrid,
    weekdayLabels: weekdayLabels, weekdayOrder: weekdayOrder,
    weekdayName: weekdayName, monthName: monthName, lastNDays: lastNDays,
    formatLong: formatLong, formatMonth: formatMonth, formatShort: formatShort,
    $: $, $$: $$, createEl: createEl,
    uid: uid, clamp: clamp, debounce: debounce
  };
})();
