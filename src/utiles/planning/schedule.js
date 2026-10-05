// Ubicación de sesiones en el tiempo libre: función pura, como el resto del
// planificador. No lee la base: recibe la "agenda" ya armada (franjas por día de
// la semana, rutina y lo ocupado por fecha) y devuelve día y horario de cada
// sesión.
//
// Reglas (ver README, "Planificación con horarios"):
//   - Tiempo libre de un día = su franja menos la rutina, las tareas con horario
//     y lo que ya se ubicó, con MARGIN_MINUTES de aire alrededor de cada cosa.
//   - En el día, el primer hueco que entra dentro del horario preferido; si no
//     hay, cualquier hueco del día (pickSlot).
//   - Las N sesiones de una semana se reparten parejas en sus días (días
//     ideales). Si el ideal no tiene lugar, se prueban los días siguientes de la
//     semana y después los anteriores. Sin lugar en toda la semana, la sesión
//     queda sin horario en su día ideal, y se avisa.
import { freeSlots, MARGIN_MINUTES, weekdayOf } from '../schedule/slots.js';
import { addDays } from '../dates.js';

export const PREFERENCE_RANGES = {
  manana: { startMinute: 6 * 60, endMinute: 12 * 60 },
  tarde: { startMinute: 12 * 60, endMinute: 19 * 60 },
  noche: { startMinute: 19 * 60, endMinute: 24 * 60 },
  cualquiera: { startMinute: 0, endMinute: 24 * 60 }
};

const dateKey = (date) => date.toISOString().slice(0, 10);

// Primer hueco donde entran `minutes`: dentro de la preferencia y, si no hay,
// en cualquier parte del día. Devuelve { startMinute, endMinute } o null.
export function pickSlot(free, minutes, preference = 'cualquiera') {
  const range = PREFERENCE_RANGES[preference] ?? PREFERENCE_RANGES.cualquiera;
  for (const slot of free) {
    const start = Math.max(slot.startMinute, range.startMinute);
    const end = Math.min(slot.endMinute, range.endMinute);
    if (end - start >= minutes) return { startMinute: start, endMinute: start + minutes };
  }
  for (const slot of free) {
    if (slot.endMinute - slot.startMinute >= minutes) {
      return { startMinute: slot.startMinute, endMinute: slot.startMinute + minutes };
    }
  }
  return null;
}

// Estado del calendario mientras se planifica: sabe qué está ocupado cada día
// (rutina + tareas con horario + lo que ya se ubicó) y calcula los huecos.
// `agenda` = { windows: [7 franjas], routine: [{ weekday, startMinute, endMinute }],
//              busy: { "YYYY-MM-DD": [{ startMinute, endMinute }] } }
export function createCalendar(agenda) {
  const placed = new Map();
  return {
    free(date) {
      const weekday = weekdayOf(date);
      const key = dateKey(date);
      const busy = [
        ...agenda.routine.filter(r => r.weekday === weekday),
        ...(agenda.busy[key] ?? []),
        ...(placed.get(key) ?? [])
      ];
      return freeSlots(agenda.windows[weekday], busy, MARGIN_MINUTES);
    },
    occupy(date, interval) {
      const key = dateKey(date);
      placed.set(key, [...(placed.get(key) ?? []), interval]);
    }
  };
}

// Índices de los días ideales para n sesiones en una semana de `days` días:
// repartidos parejos (en el medio de cada tramo). Con más sesiones que días,
// se repiten días.
export function idealDayIndexes(days, n) {
  return Array.from({ length: n }, (_, i) => Math.min(days - 1, Math.floor(((i + 0.5) * days) / n)));
}

// Ubica las sesiones de una semana. `sessions` = [{ minutes, ...datos de la
// tarea }]. Devuelve { tasks, unplaced }: tasks con startDate/endDate (un día) y,
// si se ubicó, startMinute/endMinute; unplaced = cuántas quedaron sin lugar.
export function placeWeekSessions(week, sessions, calendar, preference) {
  const days = Array.from({ length: week.days }, (_, i) => addDays(week.startDate, i));
  const ideals = idealDayIndexes(days.length, sessions.length);
  let unplaced = 0;

  const tasks = sessions.map(({ minutes, ...task }, i) => {
    const ideal = ideals[i];
    // El ideal, después los siguientes de la semana, después los anteriores
    const order = [...days.slice(ideal), ...days.slice(0, ideal).reverse()];
    for (const day of order) {
      const slot = pickSlot(calendar.free(day), minutes, preference);
      if (slot) {
        calendar.occupy(day, slot);
        return { ...task, startDate: day, endDate: day, ...slot };
      }
    }
    unplaced++;
    return { ...task, startDate: days[ideal], endDate: days[ideal] };
  });
  return { tasks, unplaced };
}

// Divide `minutes` en sentadas de hasta `max` minutos, parejas y redondeadas a
// 5: 120 en sentadas de 60 -> [60, 60]; 100 -> [50, 50]; 45 -> [45]
export function splitSittings(minutes, max) {
  const parts = Math.max(1, Math.ceil(minutes / max));
  const each = Math.ceil(minutes / parts / 5) * 5;
  return Array(parts).fill(Math.min(each, max));
}
