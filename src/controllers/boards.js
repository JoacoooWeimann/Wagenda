import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateBoardCreate, validateBoardUpdate } from '../utiles/validation/trackers.js';
import { currentUserId } from '../utiles/currentUser.js';
import { syncBoardUpdated, detachAllCopies, removeJoins } from '../utiles/groups/sharing.js';

const BOARD_NOT_FOUND = 'Tablero no encontrado';

// Los tableros viajan sin sus seguimientos: la página ya los pide con sus
// registros (GET /api/trackers) y los agrupa por boardId. Así no se mandan dos veces.
// Una copia de un tablero compartido trae quién es el dueño del original.
export async function listBoards(req, res) {
  const boards = await prisma.board.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { name: 'asc' },
    include: { sourceBoard: { select: { user: { select: { name: true, username: true } } } } }
  });
  res.json(boards.map(({ sourceBoard, ...board }) => ({ ...board, sharedBy: sourceBoard?.user ?? null })));
}

export async function createBoard(req, res) {
  const { data, fields } = validateBoardCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const board = await prisma.board.create({ data: { ...data, userId: currentUserId(req) } });
  res.status(201).json({ ...board, sharedBy: null });
}

// Tablero del usuario a partir del id de la URL, o null (respuesta ya enviada)
async function findBoard(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const board = await prisma.board.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!board) notFound(res, BOARD_NOT_FOUND);
  return board;
}

export async function updateBoard(req, res) {
  const { data, fields, error } = validateBoardUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const board = await findBoard(req, res);
  if (!board) return;
  if (board.sourceBoardId) return invalid(res, { board: 'Es una copia de un tablero compartido: lo define su dueño' });

  // Nombre y descripción se replican en las copias
  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.board.update({ where: { id: board.id }, data });
    await syncBoardUpdated(tx, after);
    return after;
  });
  res.json({ ...updated, sharedBy: null });
}

// SetNull en la base: sus seguimientos (y sus registros) no se borran, pasan a
// "Sin tablero". Borrar una forma de organizar no destruye historial.
//   - Original compartido: las copias de los demás quedan como personales.
//   - Copia: equivale a salir del tablero compartido en todos los grupos.
export async function deleteBoard(req, res) {
  const board = await findBoard(req, res);
  if (!board) return;

  await prisma.$transaction(async (tx) => {
    if (board.sourceBoardId) {
      await removeJoins(tx, { userId: board.userId, share: { boardId: board.sourceBoardId } });
    } else {
      await detachAllCopies(tx, board.id);
    }
    await tx.board.delete({ where: { id: board.id } });
  });
  res.json({ ok: true });
}
