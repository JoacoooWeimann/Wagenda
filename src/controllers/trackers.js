import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateTrackerCreate, validateTrackerUpdate, validateEntry } from '../utiles/validation/trackers.js';
import { currentUserId } from '../utiles/currentUser.js';
import { trackerSummary } from '../utiles/trackers.js';
import { syncTrackerAdded, syncTrackerUpdated, detachTrackerCopies } from '../utiles/groups/sharing.js';

const TRACKER_NOT_FOUND = 'Seguimiento no encontrado';
// Copias de tableros compartidos: la estructura la define el dueño del original
const COPY_READ_ONLY = 'Es parte de un tablero compartido: lo define su dueño';

// Historial en orden cronológico; a igual fecha, en el orden en que se cargó
const WITH_ENTRIES = { entries: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } };

// Un seguimiento solo va a un tablero propio, y no a la copia de uno
// compartido. Devuelve los errores por campo, o null si está bien (o no se pidió tablero).
async function boardError(boardId, userId) {
  if (!boardId) return null;
  const board = await prisma.board.findFirst({ where: { id: boardId, userId } });
  if (!board) return { boardId: 'Tablero no encontrado' };
  return board.sourceBoardId ? { boardId: COPY_READ_ONLY } : null;
}

const withSummary = (tracker) => ({ ...tracker, summary: trackerSummary(tracker.entries, tracker.higherIsBetter) });

// Seguimiento del usuario a partir del id de la URL, o null (respuesta ya enviada)
async function findTracker(req, res, include) {
  const id = parseId(req.params.id);
  if (!id) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const tracker = await prisma.tracker.findFirst({ where: { id, userId: currentUserId(req) }, include });
  if (!tracker) notFound(res, TRACKER_NOT_FOUND);
  return tracker;
}

export async function listTrackers(req, res) {
  const trackers = await prisma.tracker.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { name: 'asc' },
    include: WITH_ENTRIES
  });
  res.json(trackers.map(withSummary));
}

export async function getTracker(req, res) {
  const tracker = await findTracker(req, res, WITH_ENTRIES);
  if (tracker) res.json(withSummary(tracker));
}

export async function createTracker(req, res) {
  const { data, fields } = validateTrackerCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const userId = currentUserId(req);
  const badBoard = await boardError(data.boardId, userId);
  if (badBoard) return invalid(res, badBoard);

  // Si el tablero está compartido, los que se unieron reciben la copia
  const tracker = await prisma.$transaction(async (tx) => {
    const created = await tx.tracker.create({ data: { ...data, userId }, include: WITH_ENTRIES });
    await syncTrackerAdded(tx, created);
    return created;
  });
  res.status(201).json(withSummary(tracker));
}

export async function updateTracker(req, res) {
  const { data, fields, error } = validateTrackerUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const tracker = await findTracker(req, res);
  if (!tracker) return;
  if (tracker.sourceTrackerId) return invalid(res, { tracker: COPY_READ_ONLY });
  const badBoard = await boardError(data.boardId, tracker.userId);
  if (badBoard) return invalid(res, badBoard);

  // Los cambios del original se replican en las copias de quienes se unieron
  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.tracker.update({ where: { id: tracker.id }, data, include: WITH_ENTRIES });
    await syncTrackerUpdated(tx, tracker, after);
    return after;
  });
  res.json(withSummary(updated));
}

// Cascade: borra sus registros. Los objetivos vinculados quedan sin seguimiento
// (SetNull). Las copias de los demás no se borran: quedan como personales.
// Una copia no se borra suelta (dejaría un hueco en el ranking): se sale del tablero.
export async function deleteTracker(req, res) {
  const tracker = await findTracker(req, res);
  if (!tracker) return;
  if (tracker.sourceTrackerId) return invalid(res, { tracker: COPY_READ_ONLY });

  await prisma.$transaction(async (tx) => {
    await detachTrackerCopies(tx, tracker.id);
    await tx.tracker.delete({ where: { id: tracker.id } });
  });
  res.json({ ok: true });
}

export async function addEntry(req, res) {
  const { data, fields } = validateEntry(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const tracker = await findTracker(req, res);
  if (!tracker) return;

  const entry = await prisma.trackerEntry.create({ data: { ...data, trackerId: tracker.id } });
  res.status(201).json(entry);
}

export async function deleteEntry(req, res) {
  const entryId = parseId(req.params.entryId);
  if (!entryId) return invalid(res, { entryId: 'id inválido' });

  const tracker = await findTracker(req, res);
  if (!tracker) return;

  const { count } = await prisma.trackerEntry.deleteMany({ where: { id: entryId, trackerId: tracker.id } });
  if (count === 0) return notFound(res, 'Registro no encontrado');
  res.json({ ok: true });
}
