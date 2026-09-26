import prisma from '../utiles/db.js';
import { monthRangeUTC } from '../utiles/dates.js';
import {
  validateTaskCreate,
  validateTaskUpdate,
  validateMonthQuery,
  checkDateOrder,
  parseId
} from '../utiles/validation/tasks.js';

const GUEST_USER_ID = 1;

const hasErrors = (fields) => Object.keys(fields).length > 0;

function invalid(res, fields) {
  return res.status(400).json({ error: 'Datos inválidos', fields });
}

function notFound(res) {
  return res.status(404).json({ error: 'Tarea no encontrada' });
}

export async function getTasksForMonth(req, res) {
  const { data, fields } = validateMonthQuery(req.query);
  if (hasErrors(fields)) return invalid(res, fields);

  const { start: monthStart, end: monthEnd } = monthRangeUTC(data.year, data.month);

  const tasks = await prisma.task.findMany({
    where: {
      userId: GUEST_USER_ID,
      startDate: { lt: monthEnd },
      endDate: { gte: monthStart }
    },
    orderBy: { startDate: 'asc' }
  });

  res.json(tasks);
}

export async function createTask(req, res) {
  const { data, fields } = validateTaskCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const task = await prisma.task.create({
    data: { ...data, userId: GUEST_USER_ID }
  });

  res.status(201).json(task);
}

export async function updateTask(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const { data, fields, error } = validateTaskUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  // Filtrar también por userId: con varios usuarios, nadie puede editar tareas ajenas
  const current = await prisma.task.findFirst({ where: { id, userId: GUEST_USER_ID } });
  if (!current) return notFound(res);

  // Si el PATCH trae una sola fecha, la otra sale de lo guardado
  const start = data.startDate ?? current.startDate;
  const end = data.endDate ?? current.endDate;
  const dateErrors = checkDateOrder(start, end, {});
  if (hasErrors(dateErrors)) return invalid(res, dateErrors);

  const task = await prisma.task.update({ where: { id }, data });
  res.json(task);
}

export async function deleteTask(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  // deleteMany permite filtrar por userId y devuelve cuántas borró (0 = no existe o es ajena)
  const { count } = await prisma.task.deleteMany({ where: { id, userId: GUEST_USER_ID } });
  if (count === 0) return notFound(res);

  res.json({ ok: true });
}
