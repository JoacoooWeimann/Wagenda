// Arma la "agenda" de un usuario: lo que el planificador (función pura)
// necesita saber de su semana. Es la única parte que lee la base.
import prisma from '../db.js';
import { DEFAULT_WINDOW } from './slots.js';

// Las 7 franjas (los días sin configurar, con la de por defecto) y la rutina.
// La usan "Mi semana" (GET /api/week) y el planificador.
export async function loadWeek(userId) {
  const [windows, routine] = await Promise.all([
    prisma.dayWindow.findMany({ where: { userId } }),
    prisma.routineBlock.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      include: { tracker: { select: { id: true, name: true } } }
    })
  ]);
  return {
    windows: Array.from({ length: 7 }, (_, weekday) => {
      const saved = windows.find(w => w.weekday === weekday);
      return {
        weekday,
        startMinute: saved?.startMinute ?? DEFAULT_WINDOW.startMinute,
        endMinute: saved?.endMinute ?? DEFAULT_WINDOW.endMinute,
        isDefault: !saved
      };
    }),
    routine
  };
}

// Agenda para planificar entre `start` y `end`: franjas, rutina y lo ocupado
// por fecha (las tareas con horario que ya tiene). Así una sesión nueva no
// pisa nada de lo que ya estaba.
export async function loadAgenda(userId, start, end) {
  const { windows, routine } = await loadWeek(userId);
  const timed = await prisma.task.findMany({
    where: { userId, startMinute: { not: null }, startDate: { gte: start, lte: end } },
    select: { startDate: true, startMinute: true, endMinute: true }
  });
  const busy = {};
  for (const t of timed) {
    const key = t.startDate.toISOString().slice(0, 10);
    (busy[key] ??= []).push({ startMinute: t.startMinute, endMinute: t.endMinute });
  }
  return { windows, routine, busy };
}
