// Generador de planes: función pura. Recibe un objetivo ya validado y devuelve
// el plan en memoria (semanas con sus tareas). No toca la base: el controller
// decide si solo mostrarlo (preview) o guardarlo.
import { buildWeeks } from './weeks.js';
import { planDivisible, planFases, PlanError } from './strategies.js';
import { TYPE_LABELS } from './templates.js';

export { PlanError } from './strategies.js';
export const MAX_WEEKS = 52;

const TITLE_MAX = 100; // mismo límite que el título de una Task

export function generatePlan(goal) {
  const weeks = buildWeeks(goal.startDate, goal.deadline);
  if (weeks.length > MAX_WEEKS) {
    throw new PlanError('deadline', `El plazo no puede superar las ${MAX_WEEKS} semanas`);
  }

  const planned = goal.strategy === 'divisible'
    ? planDivisible(weeks, goal)
    : planFases(weeks, goal);

  // Marca de la fecha límite: visible en el calendario, con prioridad alta.
  // Es un "hito": no cuenta para la cuota de la semana.
  planned.at(-1).tasks.push({
    startDate: goal.deadline,
    endDate: goal.deadline,
    title: `Fecha límite: ${goal.title}`.slice(0, TITLE_MAX),
    priority: 'alta',
    kind: 'hito'
  });

  // Completa los campos comunes para que cada tarea tenga la forma de una Task
  const category = TYPE_LABELS[goal.type];
  return {
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
        category
      }))
    }))
  };
}
