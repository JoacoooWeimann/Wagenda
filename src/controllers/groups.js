import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import { validateGroupCreate, validateGroupUpdate } from '../utiles/validation/groups.js';
import { currentUserId } from '../utiles/currentUser.js';
import { generateInviteCode, normalizeInviteCode } from '../utiles/groups/inviteCode.js';
import { joinShare, removeJoins, removeShares } from '../utiles/groups/sharing.js';
import { trackerSummary, limitPerWeek, activityBy, cappedActivityTotal } from '../utiles/trackers.js';

// Un grupo ajeno responde igual que uno inexistente: no revela que existe
const GROUP_NOT_FOUND = 'Grupo no encontrado';
const SHARE_NOT_FOUND = 'Seguimiento compartido no encontrado';
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

// Seguimiento compartido en el grupo, a partir de la URL, o null (respuesta ya enviada)
async function findShare(req, res, groupId) {
  const shareId = parseId(req.params.shareId);
  const share = shareId && await prisma.trackerShare.findFirst({
    where: { id: shareId, groupId },
    include: { tracker: { select: { id: true, name: true, itemLabel: true, userId: true } } }
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

// Detalle del grupo para un miembro: miembros y seguimientos compartidos (con
// si el usuario participa). Nunca incluye sus datos: eso es el ranking.
async function groupDetail(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { orderBy: { joinedAt: 'asc' }, include: { user: USER_PUBLIC } },
      shares: {
        orderBy: { createdAt: 'asc' },
        include: {
          tracker: {
            select: {
              id: true, name: true, description: true, itemLabel: true, user: USER_PUBLIC,
              items: { orderBy: { name: 'asc' }, select: { name: true } }
            }
          },
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
    shares: group.shares.map(({ id, tracker: { user, items, ...tracker }, joins }) => ({
      id,
      tracker: { ...tracker, items: items.map(i => i.name) },
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
// seguimientos del grupo, los suyos dejan de estar compartidos ahí, y sale.
// Sus copias quedan como personales: nadie pierde sus datos.
async function removeMember(tx, groupId, userId) {
  await removeJoins(tx, { userId, share: { groupId } });
  await removeShares(tx, { groupId, tracker: { userId } });
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

// --- Seguimientos compartidos ----------------------------------------------

// Un miembro comparte un seguimiento suyo (un original: una copia ya es de otro)
export async function shareTracker(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;

  const trackerId = Number.isInteger(req.body?.trackerId) ? req.body.trackerId : null;
  const tracker = trackerId && await prisma.tracker.findFirst({ where: { id: trackerId, userId: found.userId } });
  if (!tracker) return invalid(res, { trackerId: 'Seguimiento no encontrado' });
  if (tracker.sourceTrackerId) {
    return invalid(res, { trackerId: 'Es una copia de un seguimiento compartido: solo su dueño lo comparte' });
  }

  const already = await prisma.trackerShare.findUnique({
    where: { groupId_trackerId: { groupId: found.group.id, trackerId } }
  });
  if (already) return invalid(res, { trackerId: 'Ese seguimiento ya está compartido en el grupo' });

  await prisma.trackerShare.create({ data: { groupId: found.group.id, trackerId } });
  res.status(201).json(await groupDetail(found.group.id, found.userId));
}

// Deja de compartirlo su dueño, o lo quita quien administra el grupo (moderación)
export async function unshareTracker(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;
  if (share.tracker.userId !== found.userId && found.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Solo su dueño o quien administra el grupo pueden quitarlo' });
  }

  await prisma.$transaction(tx => removeShares(tx, { id: share.id }));
  res.json(await groupDetail(found.group.id, found.userId));
}

// "Unirme": recibe la copia del seguimiento (ver sharing.js)
export async function joinTracker(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;
  if (share.tracker.userId === found.userId) return res.status(400).json({ error: 'Es tu seguimiento: ya participás' });

  const already = await prisma.shareJoin.findUnique({ where: { shareId_userId: { shareId: share.id, userId: found.userId } } });
  if (!already) await prisma.$transaction(tx => joinShare(tx, share, found.userId));
  res.status(already ? 200 : 201).json(await groupDetail(found.group.id, found.userId));
}

export async function leaveTracker(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;

  await prisma.$transaction(tx => removeJoins(tx, { shareId: share.id, userId: found.userId }));
  res.json(await groupDetail(found.group.id, found.userId));
}

// Ranking de un seguimiento compartido, por participante (el dueño con el
// original, los demás con su copia):
//   - activity: tareas hechas en todo el seguimiento (ej. todo el gimnasio)
//   - items: por cada ítem, el resumen de valores y la actividad de ese ítem
// Solo números: nunca títulos, notas ni fechas. Con límite semanal, cuentan los
// primeros N de cada semana. El orden lo elige la vista.
export async function getRanking(req, res) {
  const found = await findMembership(req, res);
  if (!found) return;
  const share = await findShare(req, res, found.group.id);
  if (!share) return;
  const { weeklyLimit } = found.group;

  const ENTRIES = { select: { date: true, value: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }] };
  const joins = await prisma.shareJoin.findMany({ where: { shareId: share.id }, include: { user: USER_PUBLIC } });
  const owner = await prisma.user.findUnique({ where: { id: share.tracker.userId }, ...USER_PUBLIC });
  const sourceItems = await prisma.trackerItem.findMany({
    where: { trackerId: share.tracker.id },
    orderBy: { name: 'asc' },
    include: { entries: ENTRIES }
  });
  const copies = await prisma.tracker.findMany({
    where: { sourceTrackerId: share.tracker.id, userId: { in: joins.map(j => j.userId) } },
    include: { items: { include: { entries: ENTRIES } } }
  });

  // Seguimiento de cada participante: el original para el dueño, la copia para los demás
  const participants = [
    { user: owner, trackerId: share.tracker.id, items: sourceItems, itemFor: (source) => source },
    ...joins.flatMap(({ user }) => {
      const copy = copies.find(c => c.userId === user.id);
      return copy
        ? [{ user, trackerId: copy.id, items: copy.items, itemFor: (source) => copy.items.find(i => i.sourceItemId === source.id) }]
        : [];
    })
  ];

  const trackerActivity = await activityBy(prisma, 'trackerId', participants.map(p => p.trackerId));
  const itemActivity = await activityBy(prisma, 'itemId', participants.flatMap(p => p.items.map(i => i.id)));
  const isMe = (user) => user.id === found.userId;

  res.json({
    tracker: { id: share.tracker.id, name: share.tracker.name, itemLabel: share.tracker.itemLabel },
    weeklyLimit,
    activity: participants.map(p => ({
      user: p.user, isMe: isMe(p.user), activity: cappedActivityTotal(trackerActivity.get(p.trackerId), weeklyLimit)
    })),
    items: sourceItems.map(source => ({
      id: source.id,
      name: source.name,
      unit: source.unit,
      kind: source.kind,
      higherIsBetter: source.higherIsBetter,
      rows: participants.flatMap(p => {
        const item = p.itemFor(source);
        if (!item) return [];
        return [{
          user: p.user,
          isMe: isMe(p.user),
          summary: trackerSummary(limitPerWeek(item.entries, weeklyLimit), item.higherIsBetter),
          activity: cappedActivityTotal(itemActivity.get(item.id), weeklyLimit)
        }];
      })
    }))
  });
}
