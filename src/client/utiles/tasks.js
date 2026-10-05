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

// Objetivos en los que se puede registrar una sesión ese día: por fases, abiertos,
// con el día dentro del plazo y que no sea futuro (una sesión es algo que ya pasó).
// La usan el modal del calendario y la card del inicio.
export function sessionGoalsFor(goals, dateKey, today) {
  if (dateKey > today) return [];
  return goals.filter(g =>
    g.strategy === 'fases' &&
    (g.status ?? 'activo') === 'activo' &&
    g.startDate.slice(0, 10) <= dateKey && dateKey <= g.deadline.slice(0, 10)
  );
}

// Resumen de un día para las previews del inicio: las primeras `max` tareas
// (en el mismo orden que la lista del día), cuántas quedan afuera y cuántas
// están hechas
export function daySummary(tasks, max = 5) {
  const sorted = sortForDay(tasks);
  return {
    items: sorted.slice(0, max),
    more: Math.max(0, sorted.length - max),
    done: tasks.filter(t => t.done).length,
    total: tasks.length
  };
}

// Color de la etiqueta de una categoría: siempre el mismo para el mismo nombre
// (sin importar mayúsculas ni espacios), sin guardarlo en ningún lado. Se suma
// el código de cada letra y se elige uno de los N colores de la paleta
// (--wg-tag-0 … --wg-tag-5 en main.css).
export const TAG_COLORS = 6;
export function categoryColor(category) {
  const name = category.trim().toLowerCase();
  let sum = 0;
  for (const char of name) sum = (sum * 31 + char.codePointAt(0)) % 997;
  return sum % TAG_COLORS;
}
