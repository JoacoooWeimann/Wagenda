// Las tareas usan "fechas de calendario" (un día, sin hora). Convención:
// viajan como "YYYY-MM-DD" y se guardan como medianoche UTC de ese día,
// así el valor no depende de la zona horaria del servidor ni del navegador.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM-DD" -> Date a las 00:00 UTC, o null si el formato o la fecha no son válidos
export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_ONLY.exec(value);
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  // Date.UTC "corrige" fechas imposibles (2026-02-31 -> 3 de marzo); las rechazamos
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

// Rango [inicio, fin) del mes en UTC, para consultas "tareas que tocan este mes"
export function monthRangeUTC(year, month) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Suma días a una fecha UTC. Con fechas a medianoche UTC no hay horario de
// verano que corra el resultado (UTC no tiene).
export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Días entre dos fechas UTC a medianoche (b - a)
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}
