// Generador de planes: función pura. Recibe un objetivo ya validado y devuelve
// el plan en memoria (semanas con sus tareas). No toca la base: el controller
// decide si solo mostrarlo (preview) o guardarlo.
import { buildWeeks, MAX_WEEKS } from './weeks.js';
import { planDivisible, planFases, PlanError } from './strategies.js';
import { TYPE_LABELS } from './templates.js';
import { createCalendar, placeWeekSessions, splitSittings } from './schedule.js';

export { PlanError } from './strategies.js';
export { MAX_WEEKS } from './weeks.js';
export { resizePlan, FREE_WEEK_LABEL } from './resize.js';

const TITLE_MAX = 100; // mismo límite que el título de una Task

// Título del hito de fecha límite. Exportado: al renombrar el objetivo, el
// controller lo recalcula con la misma regla.
export const milestoneTitle = (goalTitle) => `Fecha límite: ${goalTitle}`.slice(0, TITLE_MAX);

// Sesiones a ubicar en una semana del plan, cada una con su duración:
//   - fases: la cuota de la semana, sesiones de `sessionMinutes`
//   - contenido: cada contenido en sentadas de hasta `sessionMinutes` según lo
//     que lleva ("Unidad 3 · 1/2"); preparación y refuerzo, una sentada; el
//     repaso, dos.
export function weekSessions(week, goal) {
  const max = goal.sessionMinutes;
  if (goal.strategy === 'fases') {
    return Array.from({ length: week.target }, () => ({ title: `${week.label} · sesión`, kind: 'sesion', minutes: max }));
  }
  return week.tasks.flatMap(task => {
    const minutes = task.minutes ?? (week.label === 'Repaso' ? 2 * max : max);
    const sittings = splitSittings(minutes, max);
    return sittings.map((m, i) => ({
      title: sittings.length > 1 ? `${task.title} · ${i + 1}/${sittings.length}` : task.title,
      minutes: m
    }));
  });
}

// Ubica las sesiones de cada semana en el tiempo libre (ver schedule.js).
// Devuelve las semanas con sus tareas con horario y los avisos de las que no entraron.
function scheduleWeeks(planned, goal, agenda) {
  const calendar = createCalendar(agenda);
  const warnings = [];
  const weeks = planned.map(week => {
    const sessions = weekSessions(week, goal);
    const { tasks, unplaced } = placeWeekSessions(week, sessions, calendar, goal.timePreference);
    if (unplaced > 0) {
      warnings.push(`Semana ${week.number}: ${unplaced} ${unplaced === 1 ? 'sesión' : 'sesiones'} sin lugar en tu tiempo libre`);
    }
    // En contenido la cuota es la cantidad de sentadas; en fases, la de siempre
    return { ...week, tasks, target: goal.strategy === 'fases' ? week.target : tasks.length };
  });
  return { weeks, warnings };
}

// `agenda` (opcional): franjas, rutina y lo ocupado del usuario. Si el objetivo
// tiene duración de sesión (`sessionMinutes`), cada sesión se ubica con día y
// horario en el tiempo libre; si no, el plan es el de siempre (semanas sin horarios).
export function generatePlan(goal, agenda = null) {
  const weeks = buildWeeks(goal.startDate, goal.deadline);
  if (weeks.length > MAX_WEEKS) {
    throw new PlanError('deadline', `El plazo no puede superar las ${MAX_WEEKS} semanas`);
  }

  let planned = goal.strategy === 'divisible'
    ? planDivisible(weeks, goal)
    : planFases(weeks, goal);

  let warnings = [];
  if (goal.sessionMinutes && agenda) {
    ({ weeks: planned, warnings } = scheduleWeeks(planned, goal, agenda));
  }

  // Marca de la fecha límite: visible en el calendario, con prioridad alta.
  // Es un "hito": no cuenta para la cuota de la semana.
  planned.at(-1).tasks.push({
    startDate: goal.deadline,
    endDate: goal.deadline,
    title: milestoneTitle(goal.title),
    priority: 'alta',
    kind: 'hito'
  });

  // Completa los campos comunes para que cada tarea tenga la forma de una Task
  const category = TYPE_LABELS[goal.type];
  return {
    warnings,
    weeks: planned.map(({ number, startDate, endDate, label, target, tasks }) => ({
      number,
      startDate,
      endDate,
      label,
      target,
      tasks: tasks.map(t => ({
        title: t.title,
        description: t.description ?? null,
        startDate: t.startDate,
        endDate: t.endDate,
        priority: t.priority ?? 'normal',
        kind: t.kind ?? 'tarea',
        category,
        startMinute: t.startMinute ?? null,
        endMinute: t.endMinute ?? null
      }))
    }))
  };
}
