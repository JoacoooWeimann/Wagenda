import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateBoardCreate, validateBoardUpdate } from '../utiles/validation/trackers.js';
import { currentUserId } from '../utiles/currentUser.js';

const BOARD_NOT_FOUND = 'Tablero no encontrado';

// Los tableros viajan sin sus seguimientos: la página ya los pide con sus
// registros (GET /api/trackers) y los agrupa por boardId. Así no se mandan dos veces.
export async function listBoards(req, res) {
  const boards = await prisma.board.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { name: 'asc' }
  });
  res.json(boards);
}

export async function createBoard(req, res) {
  const { data, fields } = validateBoardCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const board = await prisma.board.create({ data: { ...data, userId: currentUserId(req) } });
  res.status(201).json(board);
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

  res.json(await prisma.board.update({ where: { id: board.id }, data }));
}

// SetNull en la base: sus seguimientos (y sus registros) no se borran, pasan a
// "Sin tablero". Borrar una forma de organizar no destruye historial.
export async function deleteBoard(req, res) {
  const board = await findBoard(req, res);
  if (!board) return;

  await prisma.board.delete({ where: { id: board.id } });
  res.json({ ok: true });
}
