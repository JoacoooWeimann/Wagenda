import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import {
  validateWindow, validateRoutineCreate, validateRoutineUpdate, checkTimeOrder, isWeekday
} from '../utiles/validation/week.js';
import { currentUserId } from '../utiles/currentUser.js';
import { overlaps, splitOvernight } from '../utiles/schedule/slots.js';
import { loadWeek } from '../utiles/schedule/agenda.js';
import { parseDateOnly } from '../utiles/dates.js';
import { weekdayOf } from '../utiles/schedule/slots.js';
import { TASK_WITH_GOAL } from '../utiles/queries.js';

// "Mi semana": la franja activa de cada día y la rutina fija (trabajo,
// cursada, entrenamiento). Es lo que usa el planificador para saber cuándo
// hay tiempo libre.

const ROUTINE_NOT_FOUND = 'Bloque no encontrado';
// La carga vive en utiles/schedule/agenda.js: también la usa el planificador

export async function getWeek(req, res) {
  res.json(await loadWeek(currentUserId(req)));
}

export async function putWindow(req, res) {
  const weekday = Number(req.params.weekday);
  if (!isWeekday(weekday)) return invalid(res, { weekday: 'Día inválido' });
  const { data, fields } = validateWindow(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const userId = currentUserId(req);
  await prisma.dayWindow.upsert({
    where: { userId_weekday: { userId, weekday } },
    update: data,
    create: { ...data, weekday, userId }
  });
  res.json(await loadWeek(userId));
}

// El seguimiento de un bloque tiene que ser propio
async function trackerError(trackerId, userId) {
  if (!trackerId) return null;
  const tracker = await prisma.tracker.findFirst({ where: { id: trackerId, userId } });
  return tracker ? null : { trackerId: 'Seguimiento no encontrado' };
}

// Bloques del mismo día no se pisan: la agenda y el planificador asumen que
// la rutina es una sola fila por día. Devuelve el bloque con el que choca, o null.
async function clash(userId, block, exceptId) {
  const sameDay = await prisma.routineBlock.findMany({
    where: { userId, weekday: block.weekday, ...(exceptId ? { id: { not: exceptId } } : {}) }
  });
  return sameDay.find(other => overlaps(block, other)) ?? null;
}

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const clashMessage = (other) => `Se superpone con «${other.title}» del ${DAY_NAMES[other.weekday]}`;

// Crea el bloque en cada día elegido; si alguno choca, no se crea ninguno.
// Uno que cruza la medianoche se guarda como dos tramos (splitOvernight).
export async function createRoutine(req, res) {
  const { data, fields } = validateRoutineCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const userId = currentUserId(req);
  const badTracker = await trackerError(data.trackerId, userId);
  if (badTracker) return invalid(res, badTracker);

  const { weekdays, startMinute, endMinute, ...rest } = data;
  const segments = weekdays.flatMap(weekday => splitOvernight({ weekday, startMinute, endMinute }));
  for (const [i, segment] of segments.entries()) {
    const other = (await clash(userId, segment))
      ?? segments.slice(0, i).find(s => s.weekday === segment.weekday && overlaps(s, segment)); // entre los nuevos
    if (other) return invalid(res, { startMinute: other.title ? clashMessage(other) : 'Los días elegidos se superponen entre sí' });
  }

  await prisma.$transaction(segments.map(segment =>
    prisma.routineBlock.create({ data: { ...rest, ...segment, userId } })
  ));
  res.status(201).json(await loadWeek(userId));
}

async function findBlock(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const block = await prisma.routineBlock.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!block) notFound(res, ROUTINE_NOT_FOUND);
  return block;
}

export async function updateRoutine(req, res) {
  const { data, fields, error } = validateRoutineUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const block = await findBlock(req, res);
  if (!block) return;

  // El orden y los choques se controlan con el bloque como queda
  const after = { ...block, ...data };
  const order = checkTimeOrder(after, {});
  if (hasErrors(order)) return invalid(res, order);
  const badTracker = await trackerError(data.trackerId, block.userId);
  if (badTracker) return invalid(res, badTracker);
  const other = await clash(block.userId, after, block.id);
  if (other) return invalid(res, { startMinute: clashMessage(other) });

  await prisma.routineBlock.update({ where: { id: block.id }, data });
  res.json(await loadWeek(block.userId));
}

export async function deleteRoutine(req, res) {
  const block = await findBlock(req, res);
  if (!block) return;
  await prisma.routineBlock.delete({ where: { id: block.id } });
  res.json(await loadWeek(block.userId));
}

// --- Rutina hecha ("fui al gimnasio") ------------------------------------------
// Tildar un bloque de la rutina en una fecha crea una tarea ya hecha de ese día,
// con su horario y su seguimiento: así suma actividad, aparece en el calendario
// y en los rankings como cualquier tarea. Destildarlo la borra. Una por bloque y
// fecha (índice único). Que la fecha no sea futura lo controla la pantalla.

// Fecha de la URL que corresponde al día de la semana del bloque, o null
// (respuesta ya enviada)
function blockDate(req, res, block) {
  const date = parseDateOnly(req.params.date ?? req.body?.date);
  if (!date) {
    invalid(res, { date: 'Fecha inválida (formato YYYY-MM-DD)' });
    return null;
  }
  if (weekdayOf(date) !== block.weekday) {
    invalid(res, { date: 'Ese bloque no es de ese día de la semana' });
    return null;
  }
  return date;
}

export async function markRoutineDone(req, res) {
  const block = await findBlock(req, res);
  if (!block) return;
  const date = blockDate(req, res, block);
  if (!date) return;

  // Idempotente: si ya estaba tildado, devuelve la misma tarea
  const existing = await prisma.task.findUnique({
    where: { routineBlockId_startDate: { routineBlockId: block.id, startDate: date } },
    include: TASK_WITH_GOAL
  });
  if (existing) return res.json(existing);

  const task = await prisma.task.create({
    data: {
      title: block.title,
      startDate: date,
      endDate: date,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      done: true,
      userId: block.userId,
      trackerId: block.trackerId,
      routineBlockId: block.id
    },
    include: TASK_WITH_GOAL
  });
  res.status(201).json(task);
}

export async function unmarkRoutineDone(req, res) {
  const block = await findBlock(req, res);
  if (!block) return;
  const date = blockDate(req, res, block);
  if (!date) return;

  await prisma.task.deleteMany({ where: { routineBlockId: block.id, startDate: date } });
  res.json({ ok: true });
}
