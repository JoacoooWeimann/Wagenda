// Copias vinculadas de tableros compartidos. Único lugar que crea, sincroniza y
// desvincula copias: los controllers solo llaman a estas funciones.
//
// Reglas:
//   - Al unirse a un tablero compartido, el usuario recibe una copia del tablero
//     y de sus seguimientos (Board.sourceBoardId, Tracker.sourceTrackerId).
//     Los registros que cargue son suyos.
//   - Una copia está vinculada mientras el usuario tenga al menos una unión
//     (ShareJoin) a ese tablero, en cualquier grupo. Mientras tanto, su
//     estructura (nombre, unidad, qué se mide) la define el dueño del original.
//   - Al dejar de participar (salir del tablero o del grupo, que lo expulsen,
//     que se deje de compartir o se borre el original), la copia NO se borra:
//     se desvincula y queda como tablero personal, con todo su historial.
//
// Todas reciben `tx` (cliente de una transacción): cada evento se aplica entero o no se aplica.

// Copia vinculada que tiene un usuario de un tablero, o null
const linkedCopy = (tx, userId, boardId) =>
  tx.board.findFirst({ where: { userId, sourceBoardId: boardId } });

const trackerCopyData = (tracker, userId, boardId) => ({
  name: tracker.name,
  kind: tracker.kind,
  unit: tracker.unit,
  higherIsBetter: tracker.higherIsBetter,
  userId,
  boardId,
  sourceTrackerId: tracker.id
});

// Une al usuario a un tablero compartido. Si ya tiene la copia (porque se unió
// en otro grupo), la reutiliza: una sola copia por tablero, con un solo historial.
export async function joinShare(tx, share, userId) {
  const board = await tx.board.findUnique({ where: { id: share.boardId }, include: { trackers: true } });

  if (!(await linkedCopy(tx, userId, board.id))) {
    const copy = await tx.board.create({
      data: { name: board.name, description: board.description, userId, sourceBoardId: board.id }
    });
    for (const tracker of board.trackers) {
      await tx.tracker.create({ data: trackerCopyData(tracker, userId, copy.id) });
    }
  }
  await tx.shareJoin.create({ data: { shareId: share.id, userId } });
}

// Desvincula la copia de un tablero (y sus seguimientos): pasa a ser personal
async function detachBoardCopy(tx, copy) {
  await tx.tracker.updateMany({ where: { boardId: copy.id }, data: { sourceTrackerId: null } });
  await tx.board.update({ where: { id: copy.id }, data: { sourceBoardId: null } });
}

// Borra uniones y desvincula las copias de quienes ya no participan del tablero
// en ningún grupo. `where` filtra ShareJoin (ej. { shareId } o { userId, share: { groupId } }).
export async function removeJoins(tx, where) {
  const joins = await tx.shareJoin.findMany({ where, include: { share: { select: { boardId: true } } } });
  await tx.shareJoin.deleteMany({ where: { id: { in: joins.map(j => j.id) } } });

  for (const { userId, share: { boardId } } of joins) {
    const remaining = await tx.shareJoin.count({ where: { userId, share: { boardId } } });
    if (remaining > 0) continue;
    const copy = await linkedCopy(tx, userId, boardId);
    if (copy) await detachBoardCopy(tx, copy);
  }
}

// Deja de compartir tableros (todas las uniones de esas comparticiones se van)
export async function removeShares(tx, where) {
  const shares = await tx.boardShare.findMany({ where, select: { id: true } });
  const ids = shares.map(s => s.id);
  await removeJoins(tx, { shareId: { in: ids } });
  await tx.boardShare.deleteMany({ where: { id: { in: ids } } });
}

// Antes de borrar un tablero original: todas sus copias quedan como personales
export async function detachAllCopies(tx, boardId) {
  await removeShares(tx, { boardId });
  for (const copy of await tx.board.findMany({ where: { sourceBoardId: boardId } })) {
    await detachBoardCopy(tx, copy);
  }
}

// --- Cambios del dueño en el original --------------------------------------

// Nombre y descripción del tablero
export async function syncBoardUpdated(tx, board) {
  await tx.board.updateMany({
    where: { sourceBoardId: board.id },
    data: { name: board.name, description: board.description }
  });
}

// Seguimiento nuevo en un tablero (o que entra a uno): copia para cada
// participante (cada copia vinculada del tablero es un participante)
export async function syncTrackerAdded(tx, tracker) {
  if (!tracker.boardId) return;
  const copies = await tx.board.findMany({ where: { sourceBoardId: tracker.boardId } });
  for (const copy of copies) {
    await tx.tracker.create({ data: trackerCopyData(tracker, copy.userId, copy.id) });
  }
}

// Seguimiento que sale del tablero o se borra: sus copias se desvinculan y
// salen del tablero copia (sería raro dejarlas en un tablero que ya no lo tiene)
export async function detachTrackerCopies(tx, trackerId) {
  await tx.tracker.updateMany({ where: { sourceTrackerId: trackerId }, data: { sourceTrackerId: null, boardId: null } });
}

// Edición de un seguimiento original. `before` y `after` son el seguimiento
// antes y después del cambio.
export async function syncTrackerUpdated(tx, before, after) {
  if (before.boardId !== after.boardId) {
    await detachTrackerCopies(tx, after.id);
    await syncTrackerAdded(tx, after);
    return;
  }
  await tx.tracker.updateMany({
    where: { sourceTrackerId: after.id },
    data: { name: after.name, kind: after.kind, unit: after.unit, higherIsBetter: after.higherIsBetter }
  });
}
