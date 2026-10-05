// Copias vinculadas de seguimientos compartidos. Único lugar que crea,
// sincroniza y desvincula copias: los controllers solo llaman a estas funciones.
//
// Reglas:
//   - Al unirse a un seguimiento compartido, el usuario recibe una copia del
//     seguimiento y de sus ítems (Tracker.sourceTrackerId, TrackerItem.sourceItemId).
//     Los registros y tareas que cargue son suyos.
//   - Una copia está vinculada mientras el usuario tenga al menos una unión
//     (ShareJoin) a ese seguimiento, en cualquier grupo. Mientras tanto, su
//     estructura (nombre, ítems, unidades) la define el dueño del original.
//   - Al dejar de participar (salir del seguimiento o del grupo, que lo
//     expulsen, que se deje de compartir o se borre el original), la copia NO
//     se borra: se desvincula y queda como seguimiento personal, con su historial.
//
// Todas reciben `tx` (cliente de una transacción): cada evento se aplica entero o no se aplica.

// Copia vinculada que tiene un usuario de un seguimiento, o null
const linkedCopy = (tx, userId, trackerId) =>
  tx.tracker.findFirst({ where: { userId, sourceTrackerId: trackerId } });

const itemCopyData = (item, userId, trackerId) => ({
  name: item.name,
  kind: item.kind,
  unit: item.unit,
  higherIsBetter: item.higherIsBetter,
  userId,
  trackerId,
  sourceItemId: item.id
});

// Une al usuario a un seguimiento compartido. Si ya tiene la copia (porque se
// unió en otro grupo), la reutiliza: una sola copia, con un solo historial.
export async function joinShare(tx, share, userId) {
  const tracker = await tx.tracker.findUnique({ where: { id: share.trackerId }, include: { items: true } });

  if (!(await linkedCopy(tx, userId, tracker.id))) {
    const copy = await tx.tracker.create({
      data: {
        name: tracker.name, description: tracker.description, itemLabel: tracker.itemLabel,
        userId, sourceTrackerId: tracker.id
      }
    });
    for (const item of tracker.items) {
      await tx.trackerItem.create({ data: itemCopyData(item, userId, copy.id) });
    }
  }
  await tx.shareJoin.create({ data: { shareId: share.id, userId } });
}

// Desvincula una copia (y sus ítems): pasa a ser personal
async function detachCopy(tx, copy) {
  await tx.trackerItem.updateMany({ where: { trackerId: copy.id }, data: { sourceItemId: null } });
  await tx.tracker.update({ where: { id: copy.id }, data: { sourceTrackerId: null } });
}

// Borra uniones y desvincula las copias de quienes ya no participan del
// seguimiento en ningún grupo. `where` filtra ShareJoin.
export async function removeJoins(tx, where) {
  const joins = await tx.shareJoin.findMany({ where, include: { share: { select: { trackerId: true } } } });
  await tx.shareJoin.deleteMany({ where: { id: { in: joins.map(j => j.id) } } });

  for (const { userId, share: { trackerId } } of joins) {
    const remaining = await tx.shareJoin.count({ where: { userId, share: { trackerId } } });
    if (remaining > 0) continue;
    const copy = await linkedCopy(tx, userId, trackerId);
    if (copy) await detachCopy(tx, copy);
  }
}

// Deja de compartir seguimientos (todas las uniones de esas comparticiones se van)
export async function removeShares(tx, where) {
  const shares = await tx.trackerShare.findMany({ where, select: { id: true } });
  const ids = shares.map(s => s.id);
  await removeJoins(tx, { shareId: { in: ids } });
  await tx.trackerShare.deleteMany({ where: { id: { in: ids } } });
}

// Antes de borrar un seguimiento original: todas sus copias quedan como personales
export async function detachAllCopies(tx, trackerId) {
  await removeShares(tx, { trackerId });
  for (const copy of await tx.tracker.findMany({ where: { sourceTrackerId: trackerId } })) {
    await detachCopy(tx, copy);
  }
}

// --- Cambios del dueño en el original --------------------------------------

export async function syncTrackerUpdated(tx, tracker) {
  await tx.tracker.updateMany({
    where: { sourceTrackerId: tracker.id },
    data: { name: tracker.name, description: tracker.description, itemLabel: tracker.itemLabel }
  });
}

// Ítem nuevo en un seguimiento (o que entra a uno): copia para cada
// participante (cada copia vinculada del seguimiento es un participante)
export async function syncItemAdded(tx, item) {
  const copies = await tx.tracker.findMany({ where: { sourceTrackerId: item.trackerId } });
  for (const copy of copies) {
    await tx.trackerItem.create({ data: itemCopyData(item, copy.userId, copy.id) });
  }
}

// Ítem que sale del seguimiento o se borra: sus copias se desvinculan y quedan
// como ítems personales de quien las tenía, con sus registros
export async function detachItemCopies(tx, itemId) {
  await tx.trackerItem.updateMany({ where: { sourceItemId: itemId }, data: { sourceItemId: null } });
}

// Edición de un ítem original (`before` y `after`: antes y después del cambio)
export async function syncItemUpdated(tx, before, after) {
  if (before.trackerId !== after.trackerId) {
    await detachItemCopies(tx, after.id);
    await syncItemAdded(tx, after);
    return;
  }
  await tx.trackerItem.updateMany({
    where: { sourceItemId: after.id },
    data: { name: after.name, kind: after.kind, unit: after.unit, higherIsBetter: after.higherIsBetter }
  });
}
