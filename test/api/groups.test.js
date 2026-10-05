import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });

// Tres amigos con sesión: joaco (id 1, crea el grupo), lucia y tomi
let joaco, lucia, tomi;
beforeEach(async () => {
  await ctx.reset();
  const make = async (id, name, username) => {
    if (id !== 1) await ctx.prisma.user.create({ data: { id, name, username } });
    else await ctx.prisma.user.update({ where: { id }, data: { name, username } });
    return { id, cookie: await ctx.sessionCookie(id) };
  };
  joaco = await make(1, 'Joaco', 'joaco');
  lucia = await make(2, 'Lucía', 'lucia');
  tomi = await make(3, 'Tomi', 'tomi');
});

const as = (user) => ({
  get: (url) => ctx.request('GET', url, undefined, { cookie: user.cookie }),
  post: (url, body = {}) => ctx.request('POST', url, body, { cookie: user.cookie }),
  patch: (url, body) => ctx.request('PATCH', url, body, { cookie: user.cookie }),
  del: (url) => ctx.request('DELETE', url, undefined, { cookie: user.cookie })
});

async function ok(promise, status = 200) {
  const res = await promise;
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
}

// Grupo de joaco con lucia y tomi adentro
async function friendsGroup(extra = {}) {
  const group = await ok(as(joaco).post('/api/groups', { name: 'Los pibes', ...extra }), 201);
  await ok(as(lucia).post('/api/groups/join', { code: group.inviteCode }), 201);
  await ok(as(tomi).post('/api/groups/join', { code: group.inviteCode.toLowerCase() }), 201);
  return group;
}

// Seguimiento "Gimnasio" de joaco con press banca y sentadilla, compartido en el grupo
async function sharedGym(group) {
  const gym = await ok(as(joaco).post('/api/trackers', { name: 'Gimnasio', itemLabel: 'Ejercicio' }), 201);
  await ok(as(joaco).post(`/api/trackers/${gym.id}/items`, { name: 'Press banca', unit: 'kg' }), 201);
  const full = await ok(as(joaco).post(`/api/trackers/${gym.id}/items`, { name: 'Sentadilla', unit: 'kg' }), 201);
  const [bench, squat] = full.items;
  const detail = await ok(as(joaco).post(`/api/groups/${group.id}/shares`, { trackerId: gym.id }), 201);
  return { gym, bench, squat, share: detail.shares[0] };
}

// La copia que tiene un usuario de un seguimiento o de un ítem original
const trackerCopy = (user, sourceId) => ctx.prisma.tracker.findFirst({ where: { userId: user.id, sourceTrackerId: sourceId } });
const copyOf = (user, sourceItemId) => ctx.prisma.trackerItem.findFirst({ where: { userId: user.id, sourceItemId } });
const joinShare = (user, group, share) => ok(as(user).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
const entry = (user, itemId, date, value) =>
  ok(as(user).post(`/api/items/${itemId}/entries`, { date, value, note: 'privada' }), 201);
const doneTask = async (user, body, title = 'Rutina') => {
  const t = await ok(as(user).post('/api/tasks', { title, ...body }), 201);
  await ok(as(user).patch(`/api/tasks/${t.id}`, { done: true }));
};

describe('grupos', () => {
  it('se crea, se entra con el código y solo los miembros lo ven', async () => {
    const group = await friendsGroup({ description: 'Del barrio' });
    assert.equal(group.myRole, 'owner');
    assert.match(group.inviteCode, /^[2-9A-HJ-NP-Z]{8}$/);

    const seenByLucia = await ok(as(lucia).get(`/api/groups/${group.id}`));
    assert.equal(seenByLucia.myRole, 'member');
    assert.deepEqual(seenByLucia.members.map(m => m.username), ['joaco', 'lucia', 'tomi']);
    assert.deepEqual((await ok(as(lucia).get('/api/groups'))).map(g => [g.name, g.memberCount]), [['Los pibes', 3]]);

    // entrar dos veces no duplica
    assert.equal((await as(lucia).post('/api/groups/join', { code: group.inviteCode })).status, 200);
    assert.equal((await as(lucia).post('/api/groups/join', { code: 'NOEXISTE' })).body.fields.code, 'Código de invitación inválido');

    const outsider = { cookie: await ctx.sessionCookie((await ctx.prisma.user.create({ data: { name: 'X' } })).id) };
    assert.equal((await as(outsider).get(`/api/groups/${group.id}`)).status, 404);
  });

  it('solo quien administra edita, regenera el código y borra', async () => {
    const group = await friendsGroup();
    assert.equal((await as(lucia).patch(`/api/groups/${group.id}`, { name: 'Mío' })).status, 403);
    assert.equal((await as(lucia).post(`/api/groups/${group.id}/code`)).status, 403);
    assert.equal((await as(lucia).del(`/api/groups/${group.id}`)).status, 403);

    const edited = await ok(as(joaco).patch(`/api/groups/${group.id}`, { name: 'Gym bros', weeklyLimit: 3 }));
    assert.equal(edited.name, 'Gym bros');
    assert.equal(edited.weeklyLimit, 3);
    assert.ok((await as(joaco).patch(`/api/groups/${group.id}`, { weeklyLimit: 0 })).body.fields.weeklyLimit);

    const regenerated = await ok(as(joaco).post(`/api/groups/${group.id}/code`));
    assert.notEqual(regenerated.inviteCode, group.inviteCode);
    assert.equal((await as(tomi).post('/api/groups/join', { code: group.inviteCode })).status, 400); // el viejo ya no sirve
  });

  it('transferir: el nuevo administra y el anterior puede salir', async () => {
    const group = await friendsGroup();
    assert.equal((await as(joaco).del(`/api/groups/${group.id}/members/me`)).status, 400); // primero transferir
    assert.ok((await as(joaco).post(`/api/groups/${group.id}/transfer`, { userId: 99 })).body.fields.userId);

    const after = await ok(as(joaco).post(`/api/groups/${group.id}/transfer`, { userId: lucia.id }));
    assert.equal(after.myRole, 'member');
    assert.equal(after.members.find(m => m.username === 'lucia').role, 'owner');
    await ok(as(joaco).del(`/api/groups/${group.id}/members/me`));
    assert.equal((await as(joaco).get(`/api/groups/${group.id}`)).status, 404);
  });
});

describe('seguimientos compartidos', () => {
  it('compartir no expone a nadie: cada uno elige unirse y recibe su copia con los ítems', async () => {
    const group = await friendsGroup();
    const { gym, bench, share } = await sharedGym(group);
    assert.equal(share.participants, 1); // solo el dueño
    assert.deepEqual(share.tracker.items, ['Press banca', 'Sentadilla']);

    const joined = await joinShare(lucia, group, share);
    assert.equal(joined.shares[0].joined, true);
    assert.equal(joined.shares[0].participants, 2);

    const [luciaGym] = await ok(as(lucia).get('/api/trackers'));
    assert.deepEqual([luciaGym.name, luciaGym.itemLabel], ['Gimnasio', 'Ejercicio']);
    assert.deepEqual(luciaGym.sharedBy, { name: 'Joaco', username: 'joaco' });
    assert.equal(luciaGym.sourceTrackerId, gym.id);
    assert.equal((await copyOf(lucia, bench.id)).unit, 'kg');

    assert.deepEqual(await ok(as(tomi).get('/api/trackers')), []); // tomi no se unió
  });

  it('el ranking muestra a los que participan: actividad del seguimiento y de cada ítem, sin notas y con el límite', async () => {
    const group = await friendsGroup({ weeklyLimit: 2 });
    const { gym, bench, share } = await sharedGym(group);
    await joinShare(lucia, group, share);
    const luciaBench = await copyOf(lucia, bench.id);
    const luciaGym = await trackerCopy(lucia, gym.id);

    await entry(joaco, bench.id, '2026-10-05', 80);
    await entry(lucia, luciaBench.id, '2026-10-05', 50);
    await entry(lucia, luciaBench.id, '2026-10-06', 55);
    await entry(lucia, luciaBench.id, '2026-10-07', 200); // tercero de la semana: el grupo no lo cuenta
    await entry(lucia, luciaBench.id, '2026-10-12', 60);

    await doneTask(joaco, { startDate: '2026-10-05', itemId: bench.id }, 'Pecho secreto');
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) await doneTask(lucia, { startDate: d, trackerId: luciaGym.id }); // 3: cuentan 2
    await doneTask(lucia, { startDate: '2026-10-12', itemId: luciaBench.id });

    const ranking = await ok(as(tomi).get(`/api/groups/${group.id}/shares/${share.id}/ranking`));
    assert.deepEqual(ranking.tracker, { id: gym.id, name: 'Gimnasio', itemLabel: 'Ejercicio' });
    assert.deepEqual(ranking.activity.map(r => [r.user.username, r.activity]), [['joaco', 1], ['lucia', 3]]);

    const benchRows = ranking.items.find(i => i.name === 'Press banca').rows;
    assert.deepEqual(benchRows.map(r => [r.user.username, r.summary.best?.value, r.summary.count, r.activity]), [
      ['joaco', 80, 1, 1],
      ['lucia', 60, 3, 1]
    ]);
    // De las tareas solo viaja la cantidad: ni títulos ni fechas. De los registros, nunca la nota.
    const text = JSON.stringify(ranking);
    assert.ok(!text.includes('privada') && !text.includes('Pecho secreto') && !text.includes('Rutina'));
    assert.deepEqual(Object.keys(ranking.activity[0]).sort(), ['activity', 'isMe', 'user']);
    assert.equal(typeof benchRows[0].activity, 'number');
    // en su cuenta, lucia ve todo: el límite es solo de lo que ve el grupo
    const mine = await ok(as(lucia).get(`/api/trackers/${luciaGym.id}`));
    assert.equal(mine.items.find(i => i.id === luciaBench.id).summary.best.value, 200);
  });

  it('los cambios del dueño se replican; las copias no se editan pero se usan', async () => {
    const group = await friendsGroup();
    const { gym, bench, share } = await sharedGym(group);
    await joinShare(lucia, group, share);

    await ok(as(joaco).patch(`/api/items/${bench.id}`, { name: 'Press plano', unit: 'lb' }));
    await ok(as(joaco).post(`/api/trackers/${gym.id}/items`, { name: 'Cardio', kind: 'actividad' }), 201);
    await ok(as(joaco).patch(`/api/trackers/${gym.id}`, { name: 'Gym', itemLabel: 'Máquina' }));

    const [copy] = await ok(as(lucia).get('/api/trackers'));
    assert.deepEqual([copy.name, copy.itemLabel], ['Gym', 'Máquina']);
    assert.deepEqual(copy.items.map(i => [i.name, i.kind, i.unit]), [
      ['Cardio', 'actividad', null], ['Press plano', 'medicion', 'lb'], ['Sentadilla', 'medicion', 'kg']
    ]);

    const copyItem = copy.items[1];
    assert.equal((await as(lucia).patch(`/api/trackers/${copy.id}`, { name: 'Mío' })).status, 400);
    assert.equal((await as(lucia).post(`/api/trackers/${copy.id}/items`, { name: 'Extra' })).status, 400);
    assert.equal((await as(lucia).patch(`/api/items/${copyItem.id}`, { name: 'Mío' })).status, 400);
    assert.equal((await as(lucia).del(`/api/items/${copyItem.id}`)).status, 400);
    // pero carga registros y vincula tareas
    await entry(lucia, copyItem.id, '2026-10-05', 100);
    await doneTask(lucia, { startDate: '2026-10-05', itemId: copyItem.id });
  });

  it('al salir, la copia queda como personal con su historial', async () => {
    const group = await friendsGroup();
    const { gym, bench, share } = await sharedGym(group);
    await joinShare(lucia, group, share);
    const copyItem = await copyOf(lucia, bench.id);
    await entry(lucia, copyItem.id, '2026-10-05', 50);

    const after = await ok(as(lucia).del(`/api/groups/${group.id}/shares/${share.id}/join`));
    assert.equal(after.shares[0].joined, false);

    const detached = await ctx.prisma.trackerItem.findUnique({ where: { id: copyItem.id }, include: { entries: true, tracker: true } });
    assert.equal(detached.sourceItemId, null);
    assert.equal(detached.tracker.sourceTrackerId, null);
    assert.equal(detached.entries.length, 1);
    await ok(as(lucia).patch(`/api/items/${copyItem.id}`, { name: 'Mi press' })); // ya es suyo
    assert.equal(await trackerCopy(lucia, gym.id), null);
  });

  it('unido en dos grupos: una sola copia, y sigue vinculada hasta salir de ambos', async () => {
    const group = await friendsGroup();
    const { gym, bench, share } = await sharedGym(group);
    const other = await ok(as(joaco).post('/api/groups', { name: 'Facultad' }), 201);
    await ok(as(lucia).post('/api/groups/join', { code: other.inviteCode }), 201);
    const otherShare = (await ok(as(joaco).post(`/api/groups/${other.id}/shares`, { trackerId: gym.id }), 201)).shares[0];

    await joinShare(lucia, group, share);
    await joinShare(lucia, other, otherShare);
    assert.equal(await ctx.prisma.tracker.count({ where: { userId: lucia.id, sourceTrackerId: gym.id } }), 1);

    await ok(as(lucia).del(`/api/groups/${group.id}/members/me`));
    assert.ok(await copyOf(lucia, bench.id), 'sigue vinculada por el otro grupo');

    await ok(as(lucia).del(`/api/groups/${other.id}/shares/${otherShare.id}/join`));
    assert.equal(await copyOf(lucia, bench.id), null);
  });

  it('expulsar, borrar un ítem o el original desvincula; el administrador puede quitar uno ajeno', async () => {
    const group = await friendsGroup();
    const { gym, bench, squat, share } = await sharedGym(group);
    await joinShare(lucia, group, share);
    await joinShare(tomi, group, share);

    assert.equal((await as(lucia).del(`/api/groups/${group.id}/members/${tomi.id}`)).status, 403);
    const afterKick = await ok(as(joaco).del(`/api/groups/${group.id}/members/${tomi.id}`));
    assert.deepEqual(afterKick.members.map(m => m.username), ['joaco', 'lucia']);
    assert.equal(await copyOf(tomi, bench.id), null);
    assert.equal(await ctx.prisma.trackerItem.count({ where: { userId: tomi.id } }), 2); // conserva sus ítems

    // borrar un ítem del original: la copia de lucia queda como ítem suyo
    const luciaSquat = await copyOf(lucia, squat.id);
    await ok(as(joaco).del(`/api/items/${squat.id}`));
    assert.equal((await ctx.prisma.trackerItem.findUnique({ where: { id: luciaSquat.id } })).sourceItemId, null);

    await ok(as(joaco).del(`/api/trackers/${gym.id}`));
    assert.equal(await copyOf(lucia, bench.id), null);
    assert.equal(await ctx.prisma.trackerShare.count(), 0);

    const luciaCs = await ok(as(lucia).post('/api/trackers', { name: 'CS2' }), 201);
    const shared = await ok(as(lucia).post(`/api/groups/${group.id}/shares`, { trackerId: luciaCs.id }), 201);
    assert.equal((await as(tomi).del(`/api/groups/${group.id}/shares/${shared.shares[0].id}`)).status, 404); // ya no es miembro
    assert.deepEqual((await ok(as(joaco).del(`/api/groups/${group.id}/shares/${shared.shares[0].id}`))).shares, []);
  });

  it('no se comparte una copia, uno ajeno ni dos veces el mismo', async () => {
    const group = await friendsGroup();
    const { gym, share } = await sharedGym(group);
    await joinShare(lucia, group, share);
    const luciaCopy = await trackerCopy(lucia, gym.id);

    assert.ok((await as(lucia).post(`/api/groups/${group.id}/shares`, { trackerId: luciaCopy.id })).body.fields.trackerId);
    assert.ok((await as(lucia).post(`/api/groups/${group.id}/shares`, { trackerId: gym.id })).body.fields.trackerId);
    assert.ok((await as(joaco).post(`/api/groups/${group.id}/shares`, { trackerId: gym.id })).body.fields.trackerId);
    assert.equal((await as(joaco).post(`/api/groups/${group.id}/shares/${share.id}/join`)).status, 400); // es suyo
  });
});
