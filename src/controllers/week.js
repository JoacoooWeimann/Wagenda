import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import {
  validateWindow, validateRoutineCreate, validateRoutineUpdate, checkTimeOrder, isWeekday
} from '../utiles/validation/week.js';
import { currentUserId } from '../utiles/currentUser.js';
import { overlaps } from '../utiles/schedule/slots.js';
import { loadWeek } from '../utiles/schedule/agenda.js';

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

// Crea el bloque en cada día elegido; si alguno choca, no se crea ninguno
export async function createRoutine(req, res) {
  const { data, fields } = validateRoutineCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const userId = currentUserId(req);
  const badTracker = await trackerError(data.trackerId, userId);
  if (badTracker) return invalid(res, badTracker);

  const { weekdays, ...block } = data;
  for (const weekday of weekdays) {
    const other = await clash(userId, { ...block, weekday });
    if (other) return invalid(res, { startMinute: clashMessage(other) });
  }

  await prisma.$transaction(weekdays.map(weekday =>
    prisma.routineBlock.create({ data: { ...block, weekday, userId } })
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
