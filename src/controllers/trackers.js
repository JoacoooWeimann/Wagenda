import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateTrackerCreate, validateTrackerUpdate } from '../utiles/validation/trackers.js';
import { currentUserId } from '../utiles/currentUser.js';
import { trackerSummary, activityBy } from '../utiles/trackers.js';
import { syncTrackerUpdated, detachAllCopies, removeJoins } from '../utiles/groups/sharing.js';

// Un seguimiento es un área ("Gimnasio", "Facultad") con ítems adentro.
// Sus ítems, registros y actividad viajan juntos: la página los muestra todos.

export const TRACKER_NOT_FOUND = 'Seguimiento no encontrado';
export const COPY_READ_ONLY = 'Es parte de un seguimiento compartido: lo define su dueño';

// Ítems ordenados por nombre, con su historial en orden cronológico
// (a igual fecha, en el orden en que se cargó)
const WITH_ITEMS = {
  items: {
    orderBy: { name: 'asc' },
    include: { entries: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } }
  },
  // Si es la copia de uno compartido, de quién es el original
  sourceTracker: { select: { user: { select: { name: true, username: true } } } }
};

// Agrega a cada seguimiento su actividad, la de cada ítem y el resumen de los
// ítems de medición. Todo calculado: nada de esto se guarda.
async function withDetails(trackers) {
  const byTracker = await activityBy(prisma, 'trackerId', trackers.map(t => t.id));
  const byItem = await activityBy(prisma, 'itemId', trackers.flatMap(t => t.items.map(i => i.id)));
  return trackers.map(({ sourceTracker, items, ...tracker }) => ({
    ...tracker,
    sharedBy: sourceTracker?.user ?? null,
    activity: byTracker.get(tracker.id),
    items: items.map(item => ({
      ...item,
      summary: trackerSummary(item.entries, item.higherIsBetter),
      activity: byItem.get(item.id)
    }))
  }));
}

export const trackerDetail = async (id) =>
  (await withDetails([await prisma.tracker.findUnique({ where: { id }, include: WITH_ITEMS })]))[0];

// Seguimiento del usuario a partir de la URL, o null (respuesta ya enviada)
export async function findTracker(req, res, param = 'id') {
  const id = parseId(req.params[param]);
  if (!id) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const tracker = await prisma.tracker.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!tracker) notFound(res, TRACKER_NOT_FOUND);
  return tracker;
}

export async function listTrackers(req, res) {
  const trackers = await prisma.tracker.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { name: 'asc' },
    include: WITH_ITEMS
  });
  res.json(await withDetails(trackers));
}

// Opciones para elegir en formularios (tareas, objetivos): seguimientos con sus
// ítems, sin registros ni actividad
export async function trackerOptions(req, res) {
  const trackers = await prisma.tracker.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, itemLabel: true, sourceTrackerId: true,
      items: { orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true, unit: true } }
    }
  });
  res.json(trackers);
}

export async function getTracker(req, res) {
  const tracker = await findTracker(req, res);
  if (tracker) res.json(await trackerDetail(tracker.id));
}

export async function createTracker(req, res) {
  const { data, fields } = validateTrackerCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const tracker = await prisma.tracker.create({ data: { ...data, userId: currentUserId(req) } });
  res.status(201).json(await trackerDetail(tracker.id));
}

// Nombre, descripción y etiqueta de ítems se replican en las copias
export async function updateTracker(req, res) {
  const { data, fields, error } = validateTrackerUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const tracker = await findTracker(req, res);
  if (!tracker) return;
  if (tracker.sourceTrackerId) return invalid(res, { tracker: COPY_READ_ONLY });

  await prisma.$transaction(async (tx) => {
    await syncTrackerUpdated(tx, await tx.tracker.update({ where: { id: tracker.id }, data }));
  });
  res.json(await trackerDetail(tracker.id));
}

// Borra el seguimiento con sus ítems y registros (Cascade); las tareas quedan,
// sin seguimiento (SetNull).
//   - Original compartido: las copias de los demás quedan como personales.
//   - Copia: primero deja de participar en todos los grupos.
export async function deleteTracker(req, res) {
  const tracker = await findTracker(req, res);
  if (!tracker) return;

  await prisma.$transaction(async (tx) => {
    if (tracker.sourceTrackerId) {
      await removeJoins(tx, { userId: tracker.userId, share: { trackerId: tracker.sourceTrackerId } });
    } else {
      await detachAllCopies(tx, tracker.id);
    }
    await tx.tracker.delete({ where: { id: tracker.id } });
  });
  res.json({ ok: true });
}
