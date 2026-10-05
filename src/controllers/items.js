import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateItemCreate, validateItemUpdate, validateEntry } from '../utiles/validation/trackers.js';
import { currentUserId } from '../utiles/currentUser.js';
import { syncItemAdded, syncItemUpdated, detachItemCopies } from '../utiles/groups/sharing.js';
import { findTracker, trackerDetail, TRACKER_NOT_FOUND, COPY_READ_ONLY } from './trackers.js';

// Ítems de un seguimiento (ejercicios, materias…) y sus registros. Los cambios
// de estructura devuelven el seguimiento completo: la página lo redibuja entero.

const ITEM_NOT_FOUND = 'Ítem no encontrado';

// Ítem del usuario a partir de la URL, o null (respuesta ya enviada)
async function findItem(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const item = await prisma.trackerItem.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!item) notFound(res, ITEM_NOT_FOUND);
  return item;
}

// Agregar un ítem a un seguimiento propio (no a una copia)
export async function createItem(req, res) {
  const { data, fields } = validateItemCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const tracker = await findTracker(req, res);
  if (!tracker) return;
  if (tracker.sourceTrackerId) return invalid(res, { tracker: COPY_READ_ONLY });

  // Si el seguimiento está compartido, los que se unieron reciben la copia
  await prisma.$transaction(async (tx) => {
    const item = await tx.trackerItem.create({ data: { ...data, trackerId: tracker.id, userId: tracker.userId } });
    await syncItemAdded(tx, item);
  });
  res.status(201).json(await trackerDetail(tracker.id));
}

// Editar o mover a otro seguimiento propio. Una copia vinculada no se edita:
// la define el dueño del original.
export async function updateItem(req, res) {
  const { data, fields, error } = validateItemUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const item = await findItem(req, res);
  if (!item) return;
  if (item.sourceItemId) return invalid(res, { item: COPY_READ_ONLY });

  if (data.trackerId && data.trackerId !== item.trackerId) {
    const target = await prisma.tracker.findFirst({ where: { id: data.trackerId, userId: item.userId } });
    if (!target) return invalid(res, { trackerId: TRACKER_NOT_FOUND });
    if (target.sourceTrackerId) return invalid(res, { trackerId: COPY_READ_ONLY });
  }

  // Los cambios del original se replican en las copias de quienes se unieron
  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.trackerItem.update({ where: { id: item.id }, data });
    await syncItemUpdated(tx, item, after);
    return after;
  });
  res.json(await trackerDetail(updated.trackerId));
}

// Borra el ítem con sus registros (Cascade); sus tareas quedan en el
// seguimiento, sin ítem (SetNull). Las copias de los demás quedan como personales.
export async function deleteItem(req, res) {
  const item = await findItem(req, res);
  if (!item) return;
  if (item.sourceItemId) return invalid(res, { item: COPY_READ_ONLY });

  await prisma.$transaction(async (tx) => {
    await detachItemCopies(tx, item.id);
    await tx.trackerItem.delete({ where: { id: item.id } });
  });
  res.json(await trackerDetail(item.trackerId));
}

// Registros: se cargan también en una copia (son datos de quien la tiene)
export async function addEntry(req, res) {
  const { data, fields } = validateEntry(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const item = await findItem(req, res);
  if (!item) return;

  const entry = await prisma.trackerEntry.create({ data: { ...data, itemId: item.id } });
  res.status(201).json(entry);
}

export async function deleteEntry(req, res) {
  const entryId = parseId(req.params.entryId);
  if (!entryId) return invalid(res, { entryId: 'id inválido' });

  const item = await findItem(req, res);
  if (!item) return;

  const { count } = await prisma.trackerEntry.deleteMany({ where: { id: entryId, itemId: item.id } });
  if (count === 0) return notFound(res, 'Registro no encontrado');
  res.json({ ok: true });
}
