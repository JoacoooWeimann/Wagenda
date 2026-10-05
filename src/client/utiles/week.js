// Lógica pura de "Mi semana" y la agenda (sin React), para poder testearla.
// Los intervalos y el tiempo libre son los mismos del servidor: se importan de
// ahí (funciones puras sin dependencias) para que haya un solo cálculo.
export { freeSlots, minutesToTime, timeToMinutes, overlaps, MARGIN_MINUTES } from '../../utiles/schedule/slots.js';

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Rango visible de la grilla por defecto (6:00 a 24:00)
export const GRID = { startMinute: 6 * 60, endMinute: 24 * 60 };

// Rango de la grilla para una semana: desde la hora en punto más temprana que
// se use (una franja o un bloque de madrugada) o las 6, hasta las 24
export function weekGrid(windows, routine) {
  const earliest = Math.min(GRID.startMinute, ...windows.map(w => w.startMinute), ...routine.map(b => b.startMinute));
  return { startMinute: Math.floor(earliest / 60) * 60, endMinute: GRID.endMinute };
}

// Posición vertical de un bloque en una grilla, en porcentaje: lo que queda
// fuera del rango se recorta
export function gridPosition({ startMinute, endMinute }, grid = GRID) {
  const span = grid.endMinute - grid.startMinute;
  const start = Math.max(startMinute, grid.startMinute);
  const end = Math.min(endMinute, grid.endMinute);
  return {
    top: ((start - grid.startMinute) / span) * 100,
    height: Math.max(0, ((end - start) / span) * 100)
  };
}

// Horas a marcar en la grilla: [6, 7, …, 23]
export const gridHours = (grid = GRID) =>
  Array.from({ length: (grid.endMinute - grid.startMinute) / 60 }, (_, i) => grid.startMinute / 60 + i);

// "09:00–17:00"
export const timeRange = (minutes, toTime) => `${toTime(minutes.startMinute)}–${toTime(minutes.endMinute)}`;

// Duración legible: 90 -> "1 h 30 min", 60 -> "1 h", 45 -> "45 min"
export function durationText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
