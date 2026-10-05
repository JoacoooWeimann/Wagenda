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

// Día (local) en que se cerró el objetivo. closedAt es un instante, no una
// fecha de calendario: se pasa a la fecha de la computadora del usuario.
export const closedKey = (goal) => todayKey(new Date(goal.closedAt));

export const isClosed = (goal) => goal.status !== undefined && goal.status !== 'activo';

// En qué punto del plan está el objetivo hoy
export function goalStatus(goal, today) {
  const start = keyOf(goal.startDate);
  const deadline = keyOf(goal.deadline);
  if (isClosed(goal)) {
    const text = goal.status === 'logrado' ? `✔ Logrado el ${dayMonth(closedKey(goal))}` : 'Abandonado';
    return { kind: 'closed', text };
  }
  if (today < start) return { kind: 'upcoming', text: `Empieza el ${dayMonth(goal.startDate)}` };
  if (today > deadline) return { kind: 'finished', text: 'Terminó el plazo · ¿lo lograste?' };

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

// Qué se cuenta en cada estrategia: sesiones (fases) o tareas del plan (divisible)
export function countNoun(strategy, n) {
  if (strategy === 'fases') return n === 1 ? 'sesión' : 'sesiones';
  return n === 1 ? 'tarea' : 'tareas';
}

// Recalcula `done` de cada semana a partir de sus tareas (el hito no cuenta).
// Mismo criterio que el servidor; se usa cuando el plan ya está cargado y el
// usuario marca tareas o registra sesiones desde esta página.
export function withWeekDone(weeks) {
  return weeks.map(w => ({ ...w, done: w.tasks.filter(t => t.done && t.kind !== 'hito').length }));
}

// Cumplimiento: Σ min(hecho, cuota) / Σ cuota (el exceso de una semana no compensa otra)
export function progressFromWeeks(weeks) {
  return {
    done: weeks.reduce((n, w) => n + Math.min(w.done, w.target), 0),
    total: weeks.reduce((n, w) => n + w.target, 0)
  };
}

// Resumen de una semana según el día de hoy
export function weekSummary(week, today, strategy) {
  const { done, target } = week;
  const start = keyOf(week.startDate);
  const end = keyOf(week.endDate);
  const noun = (n) => countNoun(strategy, n);

  if (today < start) return { state: 'future', text: `Cuota: ${target} ${noun(target)}` };
  if (today <= end) {
    const left = daysBetweenKeys(today, end);
    const when = left === 0 ? 'último día' : left === 1 ? 'queda 1 día' : `quedan ${left} días`;
    return { state: 'current', text: `Llevás ${done} de ${target} · ${when}` };
  }
  if (done > target) return { state: 'exceeded', text: `★ Superaste la cuota (${done}/${target})` };
  if (done === target) return { state: 'met', text: `✔ Cuota cumplida (${done}/${target})` };
  const missing = target - done;
  return { state: 'short', text: `✖ Te ${missing === 1 ? 'faltó' : 'faltaron'} ${missing} ${noun(missing)} (${done}/${target})` };
}

// Ritmo: cuánto se debería llevar según las semanas ya cerradas, y cuánto falta.
// La semana en curso no cuenta: todavía se puede completar.
export function paceOf(weeks, today) {
  const closed = weeks.filter(w => keyOf(w.endDate) < today);
  const expected = closed.reduce((n, w) => n + w.target, 0);
  const behind = closed.reduce((n, w) => n + (w.target - Math.min(w.done, w.target)), 0);
  const total = weeks.reduce((n, w) => n + w.target, 0);
  return { expected, behind, markerPercent: total === 0 ? 0 : Math.round((expected / total) * 100) };
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
    payload.contents = form.contents.map(c => ({ name: c.name, count: toInt(c.count) }));
    payload.reviewWeek = form.reviewWeek;
  } else {
    payload.sessionsPerWeek = toInt(form.sessionsPerWeek);
    if (form.itemId) payload.itemId = Number(form.itemId);
  }
  return payload;
}

// Link al calendario en el mes más útil: el actual si el objetivo está en curso,
// el de inicio si todavía no empezó, el de la fecha límite si ya terminó, y el
// del cierre (dentro del plazo) si se cerró
export function calendarLink(goal, today) {
  const { kind } = goalStatus(goal, today);
  let key = kind === 'upcoming' ? goal.startDate : kind === 'finished' ? goal.deadline : today;
  if (kind === 'closed') {
    const closed = closedKey(goal);
    key = [keyOf(goal.startDate), closed, keyOf(goal.deadline)].sort()[1]; // el del medio: dentro del plazo
  }
  return `/calendar?year=${Number(key.slice(0, 4))}&month=${Number(key.slice(5, 7))}`;
}

export const MAX_CONTENT_TYPES = 5;

// Cuántas semanas (lunes a domingo) toca el rango [startKey, endKey]: misma
// grilla que buildWeeks en el servidor
export function weekCount(startKey, endKey) {
  const weekday = new Date(`${startKey}T00:00:00Z`).getUTCDay();
  const offset = (weekday + 6) % 7; // lunes=0 ... domingo=6
  return Math.ceil((offset + daysBetweenKeys(startKey, endKey) + 1) / 7);
}

// Explica qué va a pasar con el plan al cambiar el plazo (misma regla que
// resizePlan en el servidor, que es quien lo aplica)
export function deadlineChangeNote(goal, newKey) {
  const current = goal.weeks.length;
  const next = weekCount(keyOf(goal.startDate), newKey);
  if (next > current) {
    const n = next - current;
    const added = n === 1 ? 'Se agrega 1 semana' : `Se agregan ${n} semanas`;
    return goal.strategy === 'fases'
      ? `${added} de «${goal.weeks.at(-1).label}».`
      : `${added} ${n === 1 ? 'libre' : 'libres'}, para completar con «Editar plan».`;
  }
  if (next < current) {
    const n = current - next;
    return `${n === 1 ? 'Se quita 1 semana' : `Se quitan ${n} semanas`}; sus tareas pasan a la semana ${next}.`;
  }
  return 'Cambia el fin de la última semana.';
}
