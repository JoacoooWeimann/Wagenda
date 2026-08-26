import express from 'express';
import prisma from '../utiles/db.js';

const router = express.Router();
const GUEST_USER_ID = 1;

router.get('/api/tasks', async (req, res) => {
  const { year, month } = req.query;
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 1);

  const tasks = await prisma.task.findMany({
    where: { userId: GUEST_USER_ID, date: { gte: start, lt: end } },
    orderBy: { date: 'asc' }
  });

  res.json(tasks);
});

router.post('/api/tasks', async (req, res) => {
  const { title, description, date } = req.body;
  const task = await prisma.task.create({
    data: { title, description, date: new Date(date), userId: GUEST_USER_ID }
  });
  res.json(task);
});

router.patch('/api/tasks/:id', async (req, res) => {
  const task = await prisma.task.update({
    where: { id: Number(req.params.id) },
    data: { done: req.body.done }
  });
  res.json(task);
});

router.delete('/api/tasks/:id', async (req, res) => {
  await prisma.task.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

export default router;