// src/client/utiles/calendar.js
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function buildCalendar(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7; // 0=lunes

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
  const todayDate = today.getDate();

  const days = [];
  for (let i = 0; i < firstWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, isToday: isCurrentMonth && d === todayDate });
  }
  while (days.length % 7 !== 0) days.push(null);

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return { weeks };
}
// Clave "YYYY-MM-DD" de un día del calendario. Se arma a mano (sin toISOString)
// para no pasar por UTC: en zonas UTC+ eso devolvería el día anterior.
export function toDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const DIAS_COMPLETOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// "YYYY-MM-DD" <-> fecha UTC: las cuentas de días se hacen en UTC, así el
// horario de verano no corre el resultado (en UTC no existe)
const keyToUTC = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))));
const utcToKey = (date) => toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

// Día anterior / siguiente (delta = -1 / +1), cruzando meses y años
export function shiftDay(key, delta) {
  const date = keyToUTC(key);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcToKey(date);
}

// "2026-10-04" -> "Domingo 4 de octubre"
export function dayTitle(key) {
  const date = keyToUTC(key);
  return `${DIAS_COMPLETOS[date.getUTCDay()]} ${date.getUTCDate()} de ${MESES[date.getUTCMonth()].toLowerCase()}`;
}

// "Hoy" / "Mañana" / "Ayer", o null si es otro día
export function relativeLabel(key, today) {
  if (key === today) return 'Hoy';
  if (key === shiftDay(today, 1)) return 'Mañana';
  if (key === shiftDay(today, -1)) return 'Ayer';
  return null;
}

// ?date= de la URL: "YYYY-MM-DD" de una fecha real, o null
export function parseDateParam(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return utcToKey(keyToUTC(value)) === value ? value : null; // descarta 2026-02-31
}

// Año y mes (números) de una clave, para pedir las tareas del mes
export const monthOf = (key) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
