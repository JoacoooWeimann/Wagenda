import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateGoalCreate } from '../utiles/validation/goals.js';
import { currentUserId } from '../utiles/currentUser.js';
import { generatePlan, PlanError } from '../utiles/planning/index.js';
import { TYPE_LABELS } from '../utiles/planning/templates.js';
import { parseDateOnly } from '../utiles/dates.js';
import { TASK_WITH_GOAL } from '../utiles/queries.js';

const GOAL_NOT_FOUND = 'Objetivo no encontrado';

// Valida y genera el plan. Devuelve { goal, plan } o { fields } si algo es inválido.
// Un PlanError (ej. plazo corto para "fases") es un error de datos esperable: se
// devuelve asociado a su campo, igual que los errores de validación.
function buildGoalAndPlan(body) {
  const { data, fields } = validateGoalCreate(body);
  if (hasErrors(fields)) return { fields };

  try {
    return { goal: data, plan: generatePlan(data) };
  } catch (err) {
    if (err instanceof PlanError) return { fields: { [err.field]: err.message } };
    throw err; // inesperado: lo maneja errorHandler
  }
}

// Lo hecho en una semana: tareas marcadas como hechas, sin contar el hito de fecha límite
const doneInWeek = (week) => week.tasks.filter(t => t.done && t.kind !== 'hito').length;

// Agrega `done` a cada semana (sin `tasks` si no se piden) y calcula el cumplimiento:
//   Σ min(hecho, cuota) / Σ cuota
// El min es por semana: el exceso de una semana no compensa la falta de otra,
// porque el plan apunta a la constancia (el exceso queda como "cuota superada").
function withProgress(goal, { keepTasks }) {
  const weeks = goal.weeks.map(({ tasks, ...week }) => ({
    ...week,
    done: doneInWeek({ tasks }),
    ...(keepTasks ? { tasks } : {})
  }));
  const progress = {
    done: weeks.reduce((n, w) => n + Math.min(w.done, w.target), 0),
    total: weeks.reduce((n, w) => n + w.target, 0)
  };
  return { ...goal, weeks, progress };
}

const WEEKS_WITH_TASKS = {
  weeks: { orderBy: { number: 'asc' }, include: { tasks: { orderBy: { startDate: 'asc' } } } }
};

// Genera el plan sin guardarlo: el usuario lo revisa antes de confirmar
export function previewGoal(req, res) {
  const { plan, fields } = buildGoalAndPlan(req.body);
  if (fields) return invalid(res, fields);
  res.json(plan);
}

export async function createGoal(req, res) {
  const { goal, plan, fields } = buildGoalAndPlan(req.body);
  if (fields) return invalid(res, fields);

  const userId = currentUserId(req);
  const { reviewWeek, ...goalData } = goal; // reviewWeek solo influye en la generación

  // Un único create anidado: Prisma lo ejecuta en una transacción, así que o se
  // guardan el objetivo, sus semanas y sus tareas, o no se guarda nada.
  const created = await prisma.goal.create({
    data: {
      ...goalData,
      userId,
      weeks: {
        create: plan.weeks.map(week => ({
          number: week.number,
          startDate: week.startDate,
          endDate: week.endDate,
          label: week.label,
          target: week.target,
          tasks: { create: week.tasks.map(task => ({ ...task, userId })) }
        }))
      }
    },
    include: WEEKS_WITH_TASKS
  });

  res.status(201).json(withProgress(created, { keepTasks: true }));
}

export async function listGoals(req, res) {
  const goals = await prisma.goal.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { deadline: 'asc' },
    include: {
      weeks: {
        orderBy: { number: 'asc' },
        include: { tasks: { select: { done: true, kind: true } } }
      }
    }
  });

  // La lista necesita el resumen de cada semana (cuota, hecho, etiqueta) pero no
  // las tareas: esas se piden al desplegar el plan.
  res.json(goals.map(goal => withProgress(goal, { keepTasks: false })));
}

export async function getGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const goal = await prisma.goal.findFirst({
    where: { id, userId: currentUserId(req) },
    include: WEEKS_WITH_TASKS
  });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);

  res.json(withProgress(goal, { keepTasks: true }));
}

export async function deleteGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  // Cascade en la base: borra también sus semanas y las tareas de esas semanas
  const { count } = await prisma.goal.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (count === 0) return notFound(res, GOAL_NOT_FOUND);

  res.json({ ok: true });
}

// Registra una sesión de un objetivo por fases el día que se hizo. Es una Task
// ya hecha, en esa fecha y vinculada a la semana que la contiene: así aparece en
// el calendario y se borra/desmarca como cualquier otra tarea.
export async function logSession(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const date = parseDateOnly(req.body?.date);
  if (!date) return invalid(res, { date: 'Fecha inválida (formato YYYY-MM-DD)' });

  const userId = currentUserId(req);
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);
  if (goal.strategy !== 'fases') {
    return invalid(res, { strategy: 'Solo los objetivos por fases registran sesiones' });
  }

  const week = await prisma.goalWeek.findFirst({
    where: { goalId: goal.id, startDate: { lte: date }, endDate: { gte: date } }
  });
  if (!week) return invalid(res, { date: 'La fecha está fuera del plazo del objetivo' });

  const session = await prisma.task.create({
    data: {
      title: `${week.label} · sesión`,
      startDate: date,
      endDate: date,
      done: true,
      kind: 'sesion',
      category: TYPE_LABELS[goal.type],
      userId,
      goalWeekId: week.id
    },
    include: TASK_WITH_GOAL
  });
  res.status(201).json(session);
}
