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

// Tablero "Gimnasio" de joaco con press banca y sentadilla, compartido en el grupo
async function sharedGym(group) {
  const board = await ok(as(joaco).post('/api/boards', { name: 'Gimnasio' }), 201);
  const bench = await ok(as(joaco).post('/api/trackers', { name: 'Press banca', unit: 'kg', boardId: board.id }), 201);
  const squat = await ok(as(joaco).post('/api/trackers', { name: 'Sentadilla', unit: 'kg', boardId: board.id }), 201);
  const detail = await ok(as(joaco).post(`/api/groups/${group.id}/shares`, { boardId: board.id }), 201);
  return { board, bench, squat, share: detail.shares[0] };
}

// La copia que tiene un usuario de un seguimiento original
const copyOf = (user, sourceId) => ctx.prisma.tracker.findFirst({ where: { userId: user.id, sourceTrackerId: sourceId } });

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

describe('tableros compartidos', () => {
  it('compartir no expone a nadie: cada uno elige unirse y recibe su copia', async () => {
    const group = await friendsGroup();
    const { bench, share } = await sharedGym(group);
    assert.equal(share.participants, 1); // solo el dueño

    const joined = await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    assert.equal(joined.shares[0].joined, true);
    assert.equal(joined.shares[0].participants, 2);

    const [luciaBoard] = await ok(as(lucia).get('/api/boards'));
    assert.equal(luciaBoard.name, 'Gimnasio');
    assert.deepEqual(luciaBoard.sharedBy, { name: 'Joaco', username: 'joaco' });
    const luciaBench = await copyOf(lucia, bench.id);
    assert.equal(luciaBench.unit, 'kg');
    assert.equal(luciaBench.boardId, luciaBoard.id);

    // tomi no se unió: no tiene nada
    assert.deepEqual(await ok(as(tomi).get('/api/trackers')), []);
  });

  it('el ranking muestra a los que participan, sin notas y con el límite semanal', async () => {
    const group = await friendsGroup({ weeklyLimit: 2 });
    const { bench, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    const luciaBench = await copyOf(lucia, bench.id);

    const entry = (user, id, date, value) => ok(as(user).post(`/api/trackers/${id}/entries`, { date, value, note: 'privada' }), 201);
    await entry(joaco, bench.id, '2026-10-05', 80);
    await entry(lucia, luciaBench.id, '2026-10-05', 50);
    await entry(lucia, luciaBench.id, '2026-10-06', 55);
    await entry(lucia, luciaBench.id, '2026-10-07', 200); // tercero de la semana: el grupo no lo cuenta
    await entry(lucia, luciaBench.id, '2026-10-12', 60);  // semana siguiente: sí

    const ranking = await ok(as(tomi).get(`/api/groups/${group.id}/shares/${share.id}/ranking`));
    assert.equal(ranking.weeklyLimit, 2);
    const benchRows = ranking.trackers.find(t => t.name === 'Press banca').rows;
    assert.deepEqual(benchRows.map(r => [r.user.username, r.summary.best?.value, r.summary.count]), [
      ['joaco', 80, 1],
      ['lucia', 60, 3]
    ]);
    assert.ok(!JSON.stringify(ranking).includes('privada'));
    assert.deepEqual(benchRows.map(r => r.activity), [0, 0]); // todavía sin tareas vinculadas
    // lucia en su cuenta ve todo: el límite es solo de lo que ve el grupo
    assert.equal((await ok(as(lucia).get(`/api/trackers/${luciaBench.id}`))).summary.best.value, 200);
  });

  it('los cambios del dueño se replican; las copias no se editan', async () => {
    const group = await friendsGroup();
    const { board, bench, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);

    await ok(as(joaco).patch(`/api/trackers/${bench.id}`, { name: 'Press plano', unit: 'lb' }));
    await ok(as(joaco).post('/api/trackers', { name: 'Peso muerto', unit: 'kg', boardId: board.id }), 201);
    await ok(as(joaco).patch(`/api/boards/${board.id}`, { name: 'Gym' }));

    const luciaTrackers = await ok(as(lucia).get('/api/trackers'));
    assert.deepEqual(luciaTrackers.map(t => [t.name, t.unit]), [['Peso muerto', 'kg'], ['Press plano', 'lb'], ['Sentadilla', 'kg']]);
    assert.equal((await ok(as(lucia).get('/api/boards')))[0].name, 'Gym');

    const copy = luciaTrackers[1];
    assert.equal((await as(lucia).patch(`/api/trackers/${copy.id}`, { name: 'Mío' })).status, 400);
    assert.equal((await as(lucia).del(`/api/trackers/${copy.id}`)).status, 400);
    assert.equal((await as(lucia).post('/api/trackers', { name: 'Extra', boardId: copy.boardId })).status, 400);
    assert.equal((await as(lucia).patch(`/api/boards/${copy.boardId}`, { name: 'Mío' })).status, 400);
    // pero sí carga sus registros
    await ok(as(lucia).post(`/api/trackers/${copy.id}/entries`, { date: '2026-10-05', value: 100 }), 201);
  });

  it('al salir, las copias quedan como personales con su historial', async () => {
    const group = await friendsGroup();
    const { bench, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    const copy = await copyOf(lucia, bench.id);
    await ok(as(lucia).post(`/api/trackers/${copy.id}/entries`, { date: '2026-10-05', value: 50 }), 201);

    const after = await ok(as(lucia).del(`/api/groups/${group.id}/shares/${share.id}/join`));
    assert.equal(after.shares[0].joined, false);

    const detached = await ctx.prisma.tracker.findUnique({ where: { id: copy.id }, include: { entries: true, board: true } });
    assert.equal(detached.sourceTrackerId, null);
    assert.equal(detached.board.sourceBoardId, null);
    assert.equal(detached.entries.length, 1);
    // ya es suyo: lo puede editar
    await ok(as(lucia).patch(`/api/trackers/${copy.id}`, { name: 'Mi press' }));
  });

  it('unido en dos grupos: una sola copia, y sigue vinculada hasta salir de ambos', async () => {
    const group = await friendsGroup();
    const { bench, board, share } = await sharedGym(group);
    const other = await ok(as(joaco).post('/api/groups', { name: 'Facultad' }), 201);
    await ok(as(lucia).post('/api/groups/join', { code: other.inviteCode }), 201);
    const otherShare = (await ok(as(joaco).post(`/api/groups/${other.id}/shares`, { boardId: board.id }), 201)).shares[0];

    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    await ok(as(lucia).post(`/api/groups/${other.id}/shares/${otherShare.id}/join`), 201);
    assert.equal(await ctx.prisma.tracker.count({ where: { userId: lucia.id, sourceTrackerId: bench.id } }), 1);

    await ok(as(lucia).del(`/api/groups/${group.id}/members/me`));
    assert.ok((await copyOf(lucia, bench.id)), 'sigue vinculada por el otro grupo');

    await ok(as(lucia).del(`/api/groups/${other.id}/shares/${otherShare.id}/join`));
    assert.equal(await copyOf(lucia, bench.id), null);
  });

  it('expulsar o borrar el original desvincula; el administrador puede quitar un tablero ajeno', async () => {
    const group = await friendsGroup();
    const { board, bench, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    await ok(as(tomi).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);

    assert.equal((await as(lucia).del(`/api/groups/${group.id}/members/${tomi.id}`)).status, 403);
    const afterKick = await ok(as(joaco).del(`/api/groups/${group.id}/members/${tomi.id}`));
    assert.deepEqual(afterKick.members.map(m => m.username), ['joaco', 'lucia']);
    assert.equal(await copyOf(tomi, bench.id), null);
    assert.equal(await ctx.prisma.tracker.count({ where: { userId: tomi.id } }), 2); // conserva sus seguimientos

    await ok(as(joaco).del(`/api/boards/${board.id}`));
    assert.equal(await copyOf(lucia, bench.id), null);
    assert.equal(await ctx.prisma.boardShare.count(), 0);

    // tablero de lucia, quitado por el administrador
    const luciaBoard = await ok(as(lucia).post('/api/boards', { name: 'CS2' }), 201);
    const shared = await ok(as(lucia).post(`/api/groups/${group.id}/shares`, { boardId: luciaBoard.id }), 201);
    assert.equal((await as(tomi).del(`/api/groups/${group.id}/shares/${shared.shares[0].id}`)).status, 404); // ya no es miembro
    const moderated = await ok(as(joaco).del(`/api/groups/${group.id}/shares/${shared.shares[0].id}`));
    assert.deepEqual(moderated.shares, []);
  });

  it('no se comparte una copia, un tablero ajeno ni dos veces el mismo', async () => {
    const group = await friendsGroup();
    const { board, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    const [luciaCopy] = await ok(as(lucia).get('/api/boards'));

    assert.ok((await as(lucia).post(`/api/groups/${group.id}/shares`, { boardId: luciaCopy.id })).body.fields.boardId);
    assert.ok((await as(lucia).post(`/api/groups/${group.id}/shares`, { boardId: board.id })).body.fields.boardId);
    assert.ok((await as(joaco).post(`/api/groups/${group.id}/shares`, { boardId: board.id })).body.fields.boardId);
    assert.equal((await as(joaco).post(`/api/groups/${group.id}/shares/${share.id}/join`)).status, 400); // es suyo
  });
});

describe('actividad en el ranking', () => {
  it('cuenta solo la cantidad de tareas hechas, con el límite semanal y sin títulos', async () => {
    const group = await friendsGroup({ weeklyLimit: 2 });
    const { bench, share } = await sharedGym(group);
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    const luciaBench = await copyOf(lucia, bench.id);

    const doneTask = async (user, trackerId, date, title) => {
      const t = await ok(as(user).post('/api/tasks', { title, startDate: date, trackerId }), 201);
      await ok(as(user).patch(`/api/tasks/${t.id}`, { done: true }));
    };
    await doneTask(joaco, bench.id, '2026-10-05', 'Pecho secreto');
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) await doneTask(lucia, luciaBench.id, d, 'Rutina'); // 3 en la semana: cuentan 2
    await doneTask(lucia, luciaBench.id, '2026-10-12', 'Rutina');

    const ranking = await ok(as(tomi).get(`/api/groups/${group.id}/shares/${share.id}/ranking`));
    const rows = ranking.trackers.find(t => t.name === 'Press banca').rows;
    assert.deepEqual(rows.map(r => [r.user.username, r.activity]), [['joaco', 1], ['lucia', 3]]);
    assert.ok(!JSON.stringify(ranking).includes('Pecho secreto'));
    assert.ok(!JSON.stringify(ranking).includes('2026-10-0'));
  });

  it('las copias reciben el tipo del original', async () => {
    const group = await friendsGroup();
    const board = await ok(as(joaco).post('/api/boards', { name: 'Facu' }), 201);
    const source = await ok(as(joaco).post('/api/trackers', { name: 'Estudio', kind: 'actividad', boardId: board.id }), 201);
    const share = (await ok(as(joaco).post(`/api/groups/${group.id}/shares`, { boardId: board.id }), 201)).shares[0];
    await ok(as(lucia).post(`/api/groups/${group.id}/shares/${share.id}/join`), 201);
    assert.equal((await copyOf(lucia, source.id)).kind, 'actividad');
  });
});
