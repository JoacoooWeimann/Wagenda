import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors } from '../utiles/validation/common.js';
import { currentUserId } from '../utiles/currentUser.js';
import { TASK_WITH_GOAL } from '../utiles/queries.js';
import { closedGoalError } from '../utiles/validation/goals.js';
import { monthRangeUTC } from '../utiles/dates.js';
import {
  validateTaskCreate,
  validateTaskUpdate,
  validateMonthQuery,
  checkDateOrder,
  parseId
} from '../utiles/validation/tasks.js';

const TASK_NOT_FOUND = 'Tarea no encontrada';

export async function getTasksForMonth(req, res) {
  const { data, fields } = validateMonthQuery(req.query);
  if (hasErrors(fields)) return invalid(res, fields);

  const { start: monthStart, end: monthEnd } = monthRangeUTC(data.year, data.month);

  const tasks = await prisma.task.findMany({
    where: {
      userId: currentUserId(req),
      startDate: { lt: monthEnd },
      endDate: { gte: monthStart },
      // Lo pendiente de un objetivo cerrado ya no se va a hacer: no se muestra.
      // Lo hecho sí (es historial). No se borra nada: al reabrir vuelve a aparecer.
      NOT: { done: false, goalWeek: { is: { goal: { is: { status: { not: 'activo' } } } } } }
    },
    orderBy: { startDate: 'asc' },
    include: TASK_WITH_GOAL
  });

  res.json(tasks);
}

export async function createTask(req, res) {
  const { data, fields } = validateTaskCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const task = await prisma.task.create({
    data: { ...data, userId: currentUserId(req) },
    include: TASK_WITH_GOAL
  });

  res.status(201).json(task);
}

const sameDay = (a, b) => a.getTime() === b.getTime();

// Para una tarea de un plan con fechas (posiblemente) nuevas, decide a qué semana
// pertenece: la que contiene su fecha de inicio. Devuelve { weekId } o { fields }.
// El hito (fecha límite) no se mueve: es la fecha límite del objetivo.
async function resolvePlanWeek(task, start, end) {
  const { goal } = task.goalWeek;
  const moved = !sameDay(start, task.startDate) || !sameDay(end, task.endDate);
  if (!moved) return { weekId: task.goalWeekId };

  if (task.kind === 'hito') {
    return { fields: { startDate: 'La fecha límite de un objetivo no se puede mover' } };
  }
  if (start < goal.startDate || end > goal.deadline) {
    return { fields: { startDate: 'Fuera del plazo del objetivo' } };
  }

  const week = await prisma.goalWeek.findFirst({
    where: { goalId: goal.id, startDate: { lte: start }, endDate: { gte: start } }
  });
  return { weekId: week.id };
}

export async function updateTask(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const { data, fields, error } = validateTaskUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  // Filtrar también por userId: con varios usuarios, nadie puede editar tareas ajenas
  const current = await prisma.task.findFirst({
    where: { id, userId: currentUserId(req) },
    include: { goalWeek: { include: { goal: true } } }
  });
  if (!current) return notFound(res, TASK_NOT_FOUND);

  // Si el PATCH trae una sola fecha, la otra sale de lo guardado
  const start = data.startDate ?? current.startDate;
  const end = data.endDate ?? current.endDate;
  const dateErrors = checkDateOrder(start, end, {});
  if (hasErrors(dateErrors)) return invalid(res, dateErrors);

  // Tarea de un plan: no se edita si el objetivo está cerrado, y sus fechas
  // determinan en qué semana está
  if (current.goalWeek) {
    const closed = closedGoalError(current.goalWeek.goal);
    if (closed) return invalid(res, closed);

    const plan = await resolvePlanWeek(current, start, end);
    if (plan.fields) return invalid(res, plan.fields);
    data.goalWeekId = plan.weekId;
  }

  const task = await prisma.task.update({ where: { id }, data, include: TASK_WITH_GOAL });
  res.json(task);
}

export async function deleteTask(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  // Filtrar por userId: una tarea ajena responde igual que una inexistente
  const task = await prisma.task.findFirst({
    where: { id, userId: currentUserId(req) },
    include: { goalWeek: { select: { goal: { select: { status: true } } } } }
  });
  if (!task) return notFound(res, TASK_NOT_FOUND);
  const closed = task.goalWeek && closedGoalError(task.goalWeek.goal);
  if (closed) return invalid(res, closed);

  await prisma.task.delete({ where: { id } });
  res.json({ ok: true });
}
