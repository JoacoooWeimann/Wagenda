// Lógica pura de objetivos del lado del cliente (sin React), para poder testearla.
import { toDateKey } from './calendar.js';

// Opciones del formulario. La estrategia sugerida repite la del servidor
// (planning/templates.js): el cliente no importa código del backend, y la
// que manda es la del servidor si el campo no viene.
export const GOAL_TYPES = [
  { value: 'academico', label: 'Académico', strategy: 'divisible' },
  { value: 'profesional', label: 'Profesional', strategy: 'divisible' },
  { value: 'fisico', label: 'Físico', strategy: 'fases' },
  { value: 'videojuego', label: 'Videojuego', strategy: 'fases' }
];

export const typeLabel = (type) => GOAL_TYPES.find(t => t.value === type)?.label ?? type;
export const suggestedStrategy = (type) => GOAL_TYPES.find(t => t.value === type)?.strategy ?? 'divisible';

// "Hoy" según la computadora del usuario, como "YYYY-MM-DD"
export function todayKey(now = new Date()) {
  return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const keyOf = (iso) => iso.slice(0, 10);

// "2026-10-05T00:00:00.000Z" -> "05/10"
export function dayMonth(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// Días de `fromKey` a `toKey` (ambos "YYYY-MM-DD"); se calcula en UTC para
// que no influya el horario de verano
export function daysBetweenKeys(fromKey, toKey) {
  const utc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((utc(toKey) - utc(fromKey)) / 86400000);
}

// En qué punto del plan está el objetivo hoy
export function goalStatus(goal, today) {
  const start = keyOf(goal.startDate);
  const deadline = keyOf(goal.deadline);
  if (today < start) return { kind: 'upcoming', text: `Empieza el ${dayMonth(goal.startDate)}` };
  if (today > deadline) return { kind: 'finished', text: 'Finalizado' };

  const week = goal.weeks.find(w => keyOf(w.startDate) <= today && today <= keyOf(w.endDate));
  const text = week ? `Semana ${week.number} de ${goal.weeks.length} · ${week.label}` : '';
  return { kind: 'active', text };
}

// "faltan N días" / "vence hoy" / "venció hace N días"
export function deadlineText(goal, today) {
  const days = daysBetweenKeys(today, keyOf(goal.deadline));
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'falta 1 día';
  if (days > 1) return `faltan ${days} días`;
  return days === -1 ? 'venció hace 1 día' : `venció hace ${-days} días`;
}

export function progressFromWeeks(weeks) {
  const tasks = weeks.flatMap(w => w.tasks);
  return { done: tasks.filter(t => t.done).length, total: tasks.length };
}

export const percent = ({ done, total }) => (total === 0 ? 0 : Math.round((done / total) * 100));

// Arma el body para la API con solo los parámetros de la estrategia elegida.
// Los números vacíos van como undefined: el servidor responde "obligatorio".
export function buildGoalPayload(form) {
  const toInt = (v) => (v === '' ? undefined : Number(v));
  const payload = {
    title: form.title,
    description: form.description,
    type: form.type,
    strategy: form.strategy,
    startDate: form.startDate,
    deadline: form.deadline
  };
  if (form.strategy === 'divisible') {
    payload.totalUnits = toInt(form.totalUnits);
    payload.unitName = form.unitName;
    payload.reviewWeek = form.reviewWeek;
  } else {
    payload.sessionsPerWeek = toInt(form.sessionsPerWeek);
  }
  return payload;
}
