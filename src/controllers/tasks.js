import prisma from '../utiles/db.js';
import { parseDateOnly, monthRangeUTC } from '../utiles/dates.js';

const GUEST_USER_ID = 1;

export async function getTasksForMonth(req, res) {
  const { year, month } = req.query;
  const { start: monthStart, end: monthEnd } = monthRangeUTC(Number(year), Number(month));

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
  const { title, description, startDate, endDate, priority, category } = req.body;

  if (!title || !startDate) {
    return res.status(400).json({ error: 'title y startDate son obligatorios' });
  }

  const start = parseDateOnly(startDate);
  const end = endDate ? parseDateOnly(endDate) : start;

  if (!start || !end) {
    return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD' });
  }
  if (end < start) {
    return res.status(400).json({ error: 'endDate no puede ser anterior a startDate' });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      startDate: start,
      endDate: end,
      priority: priority || 'normal',
      category: category || null,
      userId: GUEST_USER_ID
    }
  });

  res.json(task);
}

export async function updateTask(req, res) {
  const id = Number(req.params.id);
  const { title, description, startDate, endDate, priority, category, done } = req.body;

  const data = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (priority !== undefined) data.priority = priority;
  if (category !== undefined) data.category = category;
  if (done !== undefined) data.done = done;
  if (startDate !== undefined) data.startDate = parseDateOnly(startDate);
  if (endDate !== undefined) data.endDate = parseDateOnly(endDate);

  if (data.startDate === null || data.endDate === null) {
    return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD' });
  }

  const task = await prisma.task.update({ where: { id }, data });
  res.json(task);
}

export async function deleteTask(req, res) {
  await prisma.task.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}