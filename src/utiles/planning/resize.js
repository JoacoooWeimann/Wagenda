// Cambio de plazo de un objetivo ya creado: función pura, como generatePlan.
// Recibe el objetivo, sus semanas guardadas (con sus tareas) y la nueva fecha
// límite, y devuelve las operaciones a aplicar. El controller las ejecuta en una
// transacción.
//
// Regla: el pasado no se toca y no se pierden datos. El plan es editable, así
// que en vez de re-planificar (y pisar lo que el usuario cambió a mano):
//   - extender agrega semanas al final (fases: siguen la última fase;
//     contenido: quedan libres para llenarlas con "Editar plan")
//   - acortar mueve las tareas de las semanas quitadas a la nueva última semana
// El nuevo plazo nunca es anterior a hoy (lo valida el controller), así que
// ninguna sesión registrada queda afuera: las sesiones tienen fecha <= hoy.
import { buildWeeks, MAX_WEEKS } from './weeks.js';
import { weekQuota, PlanError } from './strategies.js';
import { daysBetween } from '../dates.js';
import { createCalendar, placeWeekSessions } from './schedule.js';

export const FREE_WEEK_LABEL = 'Semana libre';

const sameDay = (a, b) => a.getTime() === b.getTime();
const daysOf = (week) => daysBetween(week.startDate, week.endDate) + 1;

// Sesiones por semana de referencia para las semanas nuevas de un objetivo por
// fases: la cuota de la última semana completa (la cantidad por semana no se
// guarda, ver schema). Si no hay ninguna completa, se escala la última.
function referenceSessions(weeks) {
  const full = weeks.findLast(w => daysOf(w) === 7);
  if (full) return full.target;
  const last = weeks.at(-1);
  return Math.round(last.target * 7 / daysOf(last));
}

// Lo que se mueve o se estira deja de tener horario (abarca la semana o cambió
// de día): queda "sin horario" para reubicarlo a mano
const NO_TIME = { startMinute: null, endMinute: null };

// `agenda` (solo en objetivos con horarios): para ubicar las sesiones de las
// semanas nuevas en el tiempo libre, como al crear el objetivo
export function resizePlan(goal, weeks, newDeadline, agenda = null) {
  const grid = buildWeeks(goal.startDate, newDeadline);
  if (grid.length > MAX_WEEKS) {
    throw new PlanError('deadline', `El plazo no puede superar las ${MAX_WEEKS} semanas`);
  }

  const isFases = goal.strategy === 'fases';
  const scheduled = Boolean(goal.sessionMinutes && agenda);
  const ops = { updateWeeks: [], createWeeks: [], deleteWeekIds: [], updateTasks: [], deleteTaskIds: [], milestone: null, warnings: [] };

  // Mismo inicio => la semana i empieza el mismo día en las dos grillas. Solo
  // cambia el fin de la última semana conservada.
  const kept = Math.min(weeks.length, grid.length);
  const last = weeks[kept - 1];
  const lastEnd = grid[kept - 1].endDate;
  const lastDays = grid[kept - 1].days;

  if (!sameDay(last.endDate, lastEnd)) {
    const update = { id: last.id, endDate: lastEnd };
    if (isFases) {
      // Acortada: no puede pedir más sesiones que días. Estirada: la cuota de
      // una semana más larga, sin bajar la que el usuario haya puesto.
      update.target = lastEnd < last.endDate
        ? Math.min(last.target, lastDays)
        : Math.max(last.target, weekQuota(referenceSessions(weeks), lastDays));
    }
    ops.updateWeeks.push(update);

    for (const task of last.tasks) {
      if (task.kind === 'hito') continue;
      // Las que cubrían la semana entera (los contenidos) siguen cubriéndola
      if (sameDay(task.startDate, last.startDate) && sameDay(task.endDate, last.endDate)) {
        ops.updateTasks.push({ id: task.id, startDate: task.startDate, endDate: lastEnd, ...NO_TIME });
      } else if (task.endDate > lastEnd) {
        // Se pasa del nuevo plazo: se recorta
        const startDate = task.startDate > lastEnd ? lastEnd : task.startDate;
        ops.updateTasks.push({ id: task.id, startDate, endDate: lastEnd, ...NO_TIME });
      }
    }
  }

  // Acortar: las tareas de las semanas quitadas pasan a la nueva última semana,
  // cubriéndola entera y conservando si estaban hechas. Excepción: en un
  // objetivo por fases con horarios, las sesiones pendientes que había
  // planificado el sistema se descartan (amontonadas en la última semana
  // inflarían su cuota); lo que hizo el usuario nunca se descarta.
  for (const week of weeks.slice(kept)) {
    for (const task of week.tasks) {
      if (task.kind === 'hito') continue;
      if (isFases && goal.sessionMinutes && task.kind === 'sesion' && !task.done) {
        ops.deleteTaskIds.push(task.id);
        continue;
      }
      ops.updateTasks.push({ id: task.id, startDate: last.startDate, endDate: lastEnd, goalWeekId: last.id, ...NO_TIME });
    }
    ops.deleteWeekIds.push(week.id);
  }

  // Extender: semanas nuevas al final. En fases con horarios, cada una trae
  // sus sesiones ya ubicadas en el tiempo libre.
  const reference = isFases ? referenceSessions(weeks) : 0;
  const calendar = scheduled && isFases ? createCalendar(agenda) : null;
  for (const week of grid.slice(kept)) {
    const newWeek = {
      number: week.number,
      startDate: week.startDate,
      endDate: week.endDate,
      label: isFases ? weeks.at(-1).label : FREE_WEEK_LABEL,
      // En contenido la cuota se deriva de las tareas; la columna queda en 0
      target: isFases ? weekQuota(reference, week.days) : 0
    };
    if (calendar) {
      const sessions = Array.from({ length: newWeek.target }, () =>
        ({ title: `${newWeek.label} · sesión`, kind: 'sesion', minutes: goal.sessionMinutes }));
      const { tasks, unplaced } = placeWeekSessions(week, sessions, calendar, goal.timePreference);
      newWeek.tasks = tasks;
      if (unplaced > 0) ops.warnings.push(`Semana ${week.number}: ${unplaced} ${unplaced === 1 ? 'sesión' : 'sesiones'} sin lugar en tu tiempo libre`);
    }
    ops.createWeeks.push(newWeek);
  }

  // El hito va a la nueva fecha, en la última semana (el controller resuelve su id)
  const milestone = weeks.flatMap(w => w.tasks).find(t => t.kind === 'hito');
  if (milestone) ops.milestone = { id: milestone.id, date: newDeadline };

  return ops;
}
