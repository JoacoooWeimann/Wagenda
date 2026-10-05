// Horarios del día como intervalos [inicio, fin) en minutos desde las 00:00.
// Funciones puras y sin dependencias: las usan el planificador (servidor) y la
// agenda (cliente), así el cálculo de "tiempo libre" es uno solo.

export const DAY_MINUTES = 1440;
// Franja activa de un día que el usuario no configuró: 08:00–23:00
export const DEFAULT_WINDOW = { startMinute: 8 * 60, endMinute: 23 * 60 };
// Margen alrededor de lo ocupado: no se planifica pegado al trabajo o la cursada
export const MARGIN_MINUTES = 15;

// ¿Se pisan dos intervalos? (tocarse en el borde no es pisarse: 9–10 y 10–11 no)
export const overlaps = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

// Une intervalos que se pisan o se tocan, ordenados por inicio
export function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const merged = [];
  for (const { startMinute, endMinute } of sorted) {
    const last = merged.at(-1);
    if (last && startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, endMinute);
    else merged.push({ startMinute, endMinute });
  }
  return merged;
}

// Huecos libres de un día: la franja menos lo ocupado, con `margin` minutos de
// aire antes y después de cada cosa ocupada. Devuelve [{ startMinute, endMinute }].
export function freeSlots(window, busy, margin = 0) {
  const blocked = mergeIntervals(busy.map(b => ({
    startMinute: Math.max(0, b.startMinute - margin),
    endMinute: Math.min(DAY_MINUTES, b.endMinute + margin)
  })));
  const free = [];
  let cursor = window.startMinute;
  for (const b of blocked) {
    if (b.endMinute <= cursor) continue;
    if (b.startMinute >= window.endMinute) break;
    if (b.startMinute > cursor) free.push({ startMinute: cursor, endMinute: b.startMinute });
    cursor = Math.max(cursor, b.endMinute);
  }
  if (cursor < window.endMinute) free.push({ startMinute: cursor, endMinute: window.endMinute });
  return free;
}

// "HH:MM" <-> minutos
export const minutesToTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

// Día de la semana (0 = lunes … 6 = domingo) de una fecha UTC a medianoche
export const weekdayOf = (date) => (date.getUTCDay() + 6) % 7;
