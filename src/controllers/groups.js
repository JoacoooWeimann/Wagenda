import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateGroupCreate, validateGroupUpdate } from '../utiles/validation/groups.js';
import { currentUserId } from '../utiles/currentUser.js';
import { generateInviteCode, normalizeInviteCode } from '../utiles/groups/inviteCode.js';
import { joinShare, removeJoins, removeShares } from '../utiles/groups/sharing.js';
import { trackerSummary, limitPerWeek, activityByTracker, cappedActivityTotal } from '../utiles/trackers.js';

// Un grupo ajeno responde igual que uno inexistente: no revela que existe
const GROUP_NOT_FOUND = 'Grupo no encontrado';
const SHARE_NOT_FOUND = 'Tablero compartido no encontrado';
const OWNER_ONLY = { error: 'Solo quien administra el grupo puede hacer esto' };

const USER_PUBLIC = { select: { id: true, name: true, username: true } };

// Grupo del que el usuario es miembro, a partir de la URL. Devuelve
// { group, membership, userId } o null (respuesta ya enviada).
async function findMembership(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const userId = currentUserId(req);
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: { group: true }
  });
  if (!membership) {
    notFound(res, GROUP_NOT_FOUND);
    return null;
  }
  return { group: membership.group, membership, userId };
}

// Igual, pero además exige ser quien administra el grupo
async function findOwnership(req, res) {
  const found = await findMembership(req, res);
  if (found && found.membership.role !== 'owner') {
    res.status(403).json(OWNER_ONLY);
    return null;
  }
  return found;
}

// Tablero compartido en el grupo, a partir de la URL, o null (respuesta ya enviada)
async function findShare(req, res, groupId) {
  const shareId = parseId(req.params.shareId);
  const share = shareId && await prisma.boardShare.findFirst({
    where: { id: shareId, groupId },
    include: { board: { select: { id: true, name: true, userId: true } } }
  });
  if (!share) notFound(res, SHARE_NOT_FOUND);
  return share || null;
}

// Código único: ante el (improbable) choque con uno existente, se genera otro
async function uniqueInviteCode() {
  for (;;) {
    const code = generateInviteCode();
    if (!(await prisma.group.findUnique({ where: { inviteCode: code } }))) return code;
  }
}

// Detalle del grupo para un miembro: miembros y tableros compartidos (con si
// el usuario participa). Nunca incluye datos de los tableros: eso es el ranking.
async function groupDetail(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { orderBy: { joinedAt: 'asc' }, include: { user: USER_PUBLIC } },
      shares: {
        orderBy: { createdAt: 'asc' },
        include: {
          board: { select: { id: true, name: true, description: true, user: USER_PUBLIC } },
          joins: { select: { userId: true } }
        }
      }
    }
  });
  const me = group.members.find(m => m.userId === userId);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    weeklyLimit: group.weeklyLimit,
    inviteCode: group.inviteCode,
    myRole: me.role,
    members: group.members.map(m => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })),
    shares: group.shares.map(({ id, board: { user, ...board }, joins }) => ({
      id,
      board,
      owner: user,
      isMine: user.id === userId,
      joined: joins.some(j => j.userId === userId),
      participants: joins.length + 1 // los que se unieron + el dueño
    }))
  };
}

// --- Grupos ----------------------------------------------------------------

export async function listGroups(req, res) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: currentUserId(req) },
    include: { group: { include: { _count: { select: { members: true } } } } },
    orderBy: { group: { name: 'asc' } }
  });
  res.json(memberships.map(({ role, group: { _count, ...group } }) => ({
    id: group.id, name: group.name, description: group.description, myRole: role, memberCount: _count.members
  })));
}

export async function getGroup(req, res) {
  const found = await findMembership(req, res);
  if (found) res.json(await groupDetail(found.group.id, found.userId));
}

// Quien crea el grupo lo administra
export async function createGroup(req, res) {
  const { data, fields } = validateGroupCreate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);

  const userId = currentUserId(req);
  const group = await prisma.group.create({
    data: { ...data, inviteCode: await uniqueInviteCode(), members: { create: { userId, role: 'owner' } } }
  });
  res.status(201).json(await groupDetail(group.id, userId));
}

export async function updateGroup(req, res) {
  const { data, fields, error } = validateGroupUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const found = await findOwnership(req, res);
  if (!found) return;

  await prisma.group.update({ where: { id: found.group.id }, data });
  res.json(await groupDetail(found.group.id, found.userId));
}

// Las copias de quienes participaban quedan como personales (ver sharing.js)
export async function deleteGroup(req, res) {
  const found = await findOwnership(req, res);
  if (!found) return;

  await prisma.$transaction(async (tx) => {
    await removeShares(tx, { groupId: found.group.id });
    await tx.group.delete({ where: { id: found.group.id } });
  });
  res.json({ ok: true });
}

// Invalida el link anterior (por si se filtró)
export async function regenerateCode(req, res) {
  const found = await findOwnership(req, res);
  if (!found) return;

  await prisma.group.update({ where: { id: found.group.id }, data: { inviteCode: await uniqueInviteCode() } });
  res.json(await groupDetail(found.group.id, found.userId));
}

// Entrar con el código. Entrar no comparte nada: cada uno elige a qué unirse.
export async function joinGroup(req, res) {
  const code = normalizeInviteCode(req.body?.code);
  const group = code && await prisma.group.findUnique({ where: { inviteCode: code } });
  if (!group) return invalid(res, { code: 'Código de invitación inválido' });

  const userId = currentUserId(req);
  const existing = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } });
  if (!existing) await prisma.groupMember.create({ data: { groupId: group.id, userId } });
  res.status(existing ? 200 : 201).json(await groupDetail(group.id, userId));
}

// Salida de un miembro (por su cuenta o expulsado): deja de participar de los
// tableros del grupo, sus tableros dejan de estar compartidos ahí, y sale.
// Sus copias quedan como personales: nadie pierde sus datos.
async function removeMember(tx, groupId, userId) {
  await removeJoins(tx, { userId, share: { groupId } });
  await removeShares(tx, { groupId, board: { userId } });
  await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
}

export async function leaveGroup(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  // El grupo siempre tiene quien lo administre
  if (found.membership.role === 'owner') {
    return res.status(400).json({ error: 'Transferí el grupo a otro miembro antes de salir, o borralo' });
  }

  await prisma.$transaction(tx => removeMember(tx, found.group.id, found.userId));
  res.json({ ok: true });
}

export async function kickMember(req, res) {
  const found = await findOwnership(req, res);
  if (!found) return;
  const targetId = parseId(req.params.userId);
  if (targetId === found.userId) return res.status(400).json({ error: 'No podés expulsarte: transferí el grupo o borralo' });

  const target = targetId && await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: found.group.id, userId: targetId } }
  });
  if (!target) return notFound(res, 'Miembro no encontrado');

  await prisma.$transaction(tx => removeMember(tx, found.group.id, targetId));
  res.json(await groupDetail(found.group.id, found.userId));
}

// Pasa la administración a otro miembro; quien la tenía queda como miembro
export async function transferGroup(req, res) {
  const found = await findOwnership(req, res);
  if (!found) return;
  const targetId = Number.isInteger(req.body?.userId) ? req.body.userId : null;
  const target = targetId && targetId !== found.userId && await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: found.group.id, userId: targetId } }
  });
  if (!target) return invalid(res, { userId: 'Elegí otro miembro del grupo' });

  await prisma.$transaction([
    prisma.groupMember.update({ where: { id: target.id }, data: { role: 'owner' } }),
    prisma.groupMember.update({ where: { id: found.membership.id }, data: { role: 'member' } })
  ]);
  res.json(await groupDetail(found.group.id, found.userId));
}

// --- Tableros compartidos ----------------------------------------------------

// Un miembro comparte un tablero suyo (un original: una copia ya es de otro)
export async function shareBoard(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;

  const boardId = Number.isInteger(req.body?.boardId) ? req.body.boardId : null;
  const board = boardId && await prisma.board.findFirst({ where: { id: boardId, userId: found.userId } });
  if (!board) return invalid(res, { boardId: 'Tablero no encontrado' });
  if (board.sourceBoardId) return invalid(res, { boardId: 'Es una copia de un tablero compartido: solo su dueño lo comparte' });

  const already = await prisma.boardShare.findUnique({ where: { groupId_boardId: { groupId: found.group.id, boardId } } });
  if (already) return invalid(res, { boardId: 'Ese tablero ya está compartido en el grupo' });

  await prisma.boardShare.create({ data: { groupId: found.group.id, boardId } });
  res.status(201).json(await groupDetail(found.group.id, found.userId));
}

// Deja de compartirlo su dueño, o lo quita quien administra el grupo (moderación)
export async function unshareBoard(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;
  if (share.board.userId !== found.userId && found.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Solo su dueño o quien administra el grupo pueden quitarlo' });
  }

  await prisma.$transaction(tx => removeShares(tx, { id: share.id }));
  res.json(await groupDetail(found.group.id, found.userId));
}

// "Unirme": recibe la copia del tablero (ver sharing.js)
export async function joinBoard(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;
  if (share.board.userId === found.userId) return res.status(400).json({ error: 'Es tu tablero: ya participás' });

  const already = await prisma.shareJoin.findUnique({ where: { shareId_userId: { shareId: share.id, userId: found.userId } } });
  if (!already) await prisma.$transaction(tx => joinShare(tx, share, found.userId));
  res.status(already ? 200 : 201).json(await groupDetail(found.group.id, found.userId));
}

export async function leaveBoard(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;

  await prisma.$transaction(tx => removeJoins(tx, { shareId: share.id, userId: found.userId }));
  res.json(await groupDetail(found.group.id, found.userId));
}

// Ranking de un tablero compartido: por cada seguimiento, el resumen de cada
// participante (el dueño con el original, los demás con su copia). Solo
// valores y fechas: las notas son privadas. Con límite semanal, cuentan solo
// los primeros N registros de cada semana. El orden lo elige la vista.
export async function getRanking(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;

  const ENTRIES = { select: { date: true, value: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }] };
  const joins = await prisma.shareJoin.findMany({ where: { shareId: share.id }, include: { user: USER_PUBLIC } });
  const owner = await prisma.user.findUnique({ where: { id: share.board.userId }, ...USER_PUBLIC });
  const sources = await prisma.tracker.findMany({
    where: { boardId: share.board.id },
    orderBy: { name: 'asc' },
    include: { entries: ENTRIES }
  });
  const copies = await prisma.tracker.findMany({
    where: { sourceTrackerId: { in: sources.map(t => t.id) }, userId: { in: joins.map(j => j.userId) } },
    include: { entries: ENTRIES }
  });

  // Actividad: solo la cantidad de tareas hechas (nunca títulos ni fechas),
  // con el mismo límite semanal que los registros
  const activity = await activityByTracker(prisma, [...sources, ...copies].map(t => t.id));

  const row = (user, tracker) => {
    const { weeklyLimit } = found.group;
    const entries = limitPerWeek(tracker.entries, weeklyLimit);
    return {
      user,
      isMe: user.id === found.userId,
      summary: trackerSummary(entries, tracker.higherIsBetter),
      activity: cappedActivityTotal(activity.get(tracker.id), weeklyLimit)
    };
  };

  res.json({
    board: { id: share.board.id, name: share.board.name },
    weeklyLimit: found.group.weeklyLimit,
    trackers: sources.map(source => ({
      id: source.id,
      name: source.name,
      unit: source.unit,
      kind: source.kind,
      higherIsBetter: source.higherIsBetter,
      rows: [
        row(owner, source),
        ...joins.flatMap(({ user }) => {
          const copy = copies.find(c => c.sourceTrackerId === source.id && c.userId === user.id);
          return copy ? [row(user, copy)] : [];
        })
      ]
    }))
  });
}
