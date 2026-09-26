// Lógica pura de tareas del lado del cliente (sin React), separada del
// componente para poder testearla.
import { toDateKey } from './calendar.js';

const ORDEN_PRIORIDAD = { alta: 0, normal: 1, baja: 2 };

// Las fechas llegan como medianoche UTC ("2026-09-09T00:00:00.000Z"): nos quedamos
// con la parte "YYYY-MM-DD" y comparamos strings. Con ceros a la izquierda, el orden
// alfabético coincide con el cronológico, y no interviene la zona horaria local.
export function dayInRange(year, month, day, task) {
  const key = toDateKey(year, month, day);
  return key >= task.startDate.slice(0, 10) && key <= task.endDate.slice(0, 10);
}

export function highestPriority(tasks) {
  if (tasks.some(t => t.priority === 'alta')) return 'alta';
  if (tasks.some(t => t.priority === 'normal')) return 'normal';
  if (tasks.length > 0) return 'baja';
  return null;
}

// Pendientes primero y, dentro de cada grupo, de mayor a menor prioridad.
// sort es estable: los empates conservan el orden por startDate que manda el servidor.
export function sortForDay(tasks) {
  return [...tasks].sort((a, b) =>
    (a.done - b.done) || (ORDEN_PRIORIDAD[a.priority] - ORDEN_PRIORIDAD[b.priority])
  );
}

export const isMultiDay = (task) => task.startDate.slice(0, 10) !== task.endDate.slice(0, 10);

// "2026-09-09T00:00:00.000Z" -> "9/9"
export function shortDate(iso) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}
