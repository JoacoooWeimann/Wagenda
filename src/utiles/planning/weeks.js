import { addDays, daysBetween } from '../dates.js';

// Divide [start, deadline] (fechas UTC a medianoche, ambos incluidos) en semanas
// de lunes a domingo, como las filas del calendario. La primera y la última
// pueden ser parciales; `days` (su capacidad) permite darles menos carga.
export function buildWeeks(start, deadline) {
  if (deadline < start) throw new RangeError('deadline no puede ser anterior a start');

  const weeks = [];
  let weekStart = start;
  while (weekStart <= deadline) {
    const daysToSunday = 6 - ((weekStart.getUTCDay() + 6) % 7); // lunes=0 ... domingo=6
    const sunday = addDays(weekStart, daysToSunday);
    const weekEnd = sunday < deadline ? sunday : deadline;

    weeks.push({
      number: weeks.length + 1,
      startDate: weekStart,
      endDate: weekEnd,
      days: daysBetween(weekStart, weekEnd) + 1
    });
    weekStart = addDays(weekEnd, 1);
  }
  return weeks;
}
