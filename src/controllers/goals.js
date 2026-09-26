import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateGoalCreate } from '../utiles/validation/goals.js';
import { currentUserId } from '../utiles/currentUser.js';
import { generatePlan, PlanError } from '../utiles/planning/index.js';

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

// Progreso = tareas hechas / total (incluye la marca de fecha límite: marcarla
// como hecha es "cumplí el objetivo")
function progressOf(weeks) {
  const tasks = weeks.flatMap(w => w.tasks);
  return { done: tasks.filter(t => t.done).length, total: tasks.length };
}

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
          tasks: { create: week.tasks.map(task => ({ ...task, userId })) }
        }))
      }
    },
    include: {
      weeks: { orderBy: { number: 'asc' }, include: { tasks: { orderBy: { startDate: 'asc' } } } }
    }
  });

  res.status(201).json({ ...created, progress: progressOf(created.weeks) });
}

export async function listGoals(req, res) {
  const goals = await prisma.goal.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { deadline: 'asc' },
    include: { weeks: { select: { tasks: { select: { done: true } } } } }
  });

  // La lista solo necesita el progreso, no las semanas completas
  res.json(goals.map(({ weeks, ...goal }) => ({ ...goal, progress: progressOf(weeks) })));
}

export async function getGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const goal = await prisma.goal.findFirst({
    where: { id, userId: currentUserId(req) },
    include: {
      weeks: { orderBy: { number: 'asc' }, include: { tasks: { orderBy: { startDate: 'asc' } } } }
    }
  });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);

  res.json({ ...goal, progress: progressOf(goal.weeks) });
}

export async function deleteGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  // Cascade en la base: borra también sus semanas y las tareas de esas semanas
  const { count } = await prisma.goal.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (count === 0) return notFound(res, GOAL_NOT_FOUND);

  res.json({ ok: true });
}
