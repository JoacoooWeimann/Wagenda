import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

async function createTracker(body = { name: 'Press banca', unit: 'kg' }) {
  const res = await ctx.request('POST', '/api/trackers', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}
const addEntry = (tracker, date, value, extra = {}) =>
  ctx.request('POST', `/api/trackers/${tracker.id}/entries`, { date, value, ...extra });

const running = (extra = {}) => ({
  title: 'Fuerza', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-29', sessionsPerWeek: 3, ...extra
});

describe('seguimientos', () => {
  it('crea, lista con resumen, edita y borra', async () => {
    const tracker = await createTracker();
    assert.equal(tracker.higherIsBetter, true);
    assert.deepEqual(tracker.summary, { count: 0, last: null, best: null, change: null });

    await addEntry(tracker, '2026-10-05', 80);
    await addEntry(tracker, '2026-10-19', 85, { note: 'nuevo récord' });
    await addEntry(tracker, '2026-10-12', 82.5); // se carga fuera de orden

    const [listed] = (await ctx.request('GET', '/api/trackers')).body;
    assert.deepEqual(listed.entries.map(e => e.value), [80, 82.5, 85]); // orden cronológico
    assert.equal(listed.summary.best.value, 85);
    assert.equal(listed.summary.change, 5);

    const edited = await ctx.request('PATCH', `/api/trackers/${tracker.id}`, { name: 'Press plano', unit: '' });
    assert.equal(edited.body.name, 'Press plano');
    assert.equal(edited.body.unit, null);

    assert.equal((await ctx.request('DELETE', `/api/trackers/${tracker.id}`)).status, 200);
    assert.equal(await ctx.prisma.trackerEntry.count(), 0); // cascade
  });

  it('con higherIsBetter false, la mejor marca es la menor', async () => {
    const tracker = await createTracker({ name: '5 km', unit: 'min', higherIsBetter: false });
    await addEntry(tracker, '2026-10-05', 30);
    await addEntry(tracker, '2026-10-12', 28);
    await addEntry(tracker, '2026-10-19', 29);
    const { body } = await ctx.request('GET', `/api/trackers/${tracker.id}`);
    assert.equal(body.summary.best.value, 28);
    assert.equal(body.summary.last.value, 29);
  });

  it('valida los datos y borra registros', async () => {
    const bad = await ctx.request('POST', '/api/trackers', { name: '', boardId: 'x', higherIsBetter: 'si' });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['boardId', 'higherIsBetter', 'name']);

    const tracker = await createTracker();
    const badEntry = await addEntry(tracker, '2026-13-01', 'mucho');
    assert.deepEqual(Object.keys(badEntry.body.fields).sort(), ['date', 'value']);

    const entry = (await addEntry(tracker, '2026-10-05', 80)).body;
    assert.equal((await ctx.request('DELETE', `/api/trackers/${tracker.id}/entries/${entry.id}`)).status, 200);
    assert.equal((await ctx.request('DELETE', `/api/trackers/${tracker.id}/entries/${entry.id}`)).status, 404);
  });

  it('los seguimientos de otro usuario no se ven ni se tocan', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.tracker.create({ data: { name: 'Ajeno', userId: other.id } });

    assert.deepEqual((await ctx.request('GET', '/api/trackers')).body, []);
    assert.equal((await ctx.request('GET', `/api/trackers/${foreign.id}`)).status, 404);
    assert.equal((await addEntry(foreign, '2026-10-05', 1)).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/trackers/${foreign.id}`)).status, 404);
    // tampoco se puede vincular a un objetivo propio
    const res = await ctx.request('POST', '/api/goals', running({ trackerId: foreign.id }));
    assert.equal(res.body.fields.trackerId, 'Seguimiento no encontrado');
  });
});

describe('objetivos vinculados a un seguimiento', () => {
  it('la sesión con valor crea también el registro, en la misma fecha', async () => {
    const tracker = await createTracker();
    const goal = (await ctx.request('POST', '/api/goals', running({ trackerId: tracker.id }))).body;
    assert.deepEqual(goal.tracker, { id: tracker.id, name: 'Press banca', unit: 'kg', kind: 'medicion' });

    const res = await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06', value: 82.5, note: 'fácil' });
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, 'sesion');

    const [entry] = (await ctx.request('GET', `/api/trackers/${tracker.id}`)).body.entries;
    assert.equal(entry.value, 82.5);
    assert.equal(entry.note, 'fácil');
    assert.equal(entry.date, '2026-10-06T00:00:00.000Z');

    // sin valor, solo la sesión
    await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-07' });
    assert.equal(await ctx.prisma.trackerEntry.count(), 1);
    assert.equal(await ctx.prisma.task.count({ where: { kind: 'sesion' } }), 2);
  });

  it('sin seguimiento vinculado, el valor se rechaza y no se crea nada', async () => {
    const goal = (await ctx.request('POST', '/api/goals', running())).body;
    const res = await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06', value: 80 });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.value);
    assert.equal(await ctx.prisma.task.count({ where: { kind: 'sesion' } }), 0);
  });

  it('se vincula y desvincula al editar; borrar el seguimiento no borra el objetivo', async () => {
    const tracker = await createTracker();
    const goal = (await ctx.request('POST', '/api/goals', running())).body;

    const linked = await ctx.request('PATCH', `/api/goals/${goal.id}`, { trackerId: tracker.id });
    assert.equal(linked.body.tracker.id, tracker.id);
    const unlinked = await ctx.request('PATCH', `/api/goals/${goal.id}`, { trackerId: null });
    assert.equal(unlinked.body.tracker, null);

    await ctx.request('PATCH', `/api/goals/${goal.id}`, { trackerId: tracker.id });
    await ctx.request('DELETE', `/api/trackers/${tracker.id}`);
    const after = (await ctx.request('GET', `/api/goals/${goal.id}`)).body;
    assert.equal(after.trackerId, null); // SetNull
  });

  it('solo los objetivos por fases se vinculan', async () => {
    const tracker = await createTracker();
    const goal = (await ctx.request('POST', '/api/goals', {
      title: 'Álgebra', type: 'academico', strategy: 'divisible',
      startDate: '2026-10-05', deadline: '2026-11-08', contents: [{ name: 'Unidad', count: 6 }]
    })).body;
    const res = await ctx.request('PATCH', `/api/goals/${goal.id}`, { trackerId: tracker.id });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.trackerId);
  });
});

describe('tableros', () => {
  const createBoard = async (body = { name: 'Gimnasio' }) => {
    const res = await ctx.request('POST', '/api/boards', body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };

  it('crea, lista, edita y valida', async () => {
    await createBoard({ name: 'Gimnasio', description: 'Fuerza' });
    await createBoard({ name: 'CS2' });
    assert.deepEqual((await ctx.request('GET', '/api/boards')).body.map(b => b.name), ['CS2', 'Gimnasio']);

    const [cs] = (await ctx.request('GET', '/api/boards')).body;
    const edited = await ctx.request('PATCH', `/api/boards/${cs.id}`, { name: 'Counter-Strike 2' });
    assert.equal(edited.body.name, 'Counter-Strike 2');

    assert.ok((await ctx.request('POST', '/api/boards', { name: '' })).body.fields.name);
    assert.equal((await ctx.request('PATCH', `/api/boards/${cs.id}`, {})).status, 400);
  });

  it('un seguimiento se crea dentro de un tablero y se mueve a otro o a ninguno', async () => {
    const gym = await createBoard();
    const cs = await createBoard({ name: 'CS2' });
    const tracker = await createTracker({ name: 'Rating', boardId: gym.id });
    assert.equal(tracker.boardId, gym.id);

    const moved = await ctx.request('PATCH', `/api/trackers/${tracker.id}`, { boardId: cs.id });
    assert.equal(moved.body.boardId, cs.id);
    const loose = await ctx.request('PATCH', `/api/trackers/${tracker.id}`, { boardId: null });
    assert.equal(loose.body.boardId, null);
  });

  it('borrar un tablero no borra sus seguimientos ni sus registros', async () => {
    const gym = await createBoard();
    const tracker = await createTracker({ name: 'Press banca', unit: 'kg', boardId: gym.id });
    await addEntry(tracker, '2026-10-05', 80);

    assert.equal((await ctx.request('DELETE', `/api/boards/${gym.id}`)).status, 200);
    const after = (await ctx.request('GET', `/api/trackers/${tracker.id}`)).body;
    assert.equal(after.boardId, null);
    assert.equal(after.entries.length, 1);
    assert.equal((await ctx.request('DELETE', `/api/boards/${gym.id}`)).status, 404);
  });

  it('los tableros de otro usuario no se ven, no se tocan y no reciben seguimientos', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.board.create({ data: { name: 'Ajeno', userId: other.id } });

    assert.deepEqual((await ctx.request('GET', '/api/boards')).body, []);
    assert.equal((await ctx.request('PATCH', `/api/boards/${foreign.id}`, { name: 'Mío' })).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/boards/${foreign.id}`)).status, 404);

    const res = await ctx.request('POST', '/api/trackers', { name: 'x', boardId: foreign.id });
    assert.equal(res.body.fields.boardId, 'Tablero no encontrado');
    const mine = await createTracker();
    const move = await ctx.request('PATCH', `/api/trackers/${mine.id}`, { boardId: foreign.id });
    assert.equal(move.body.fields.boardId, 'Tablero no encontrado');
  });
});

describe('tareas vinculadas a un seguimiento', () => {
  const task = (body) => ctx.request('POST', '/api/tasks', { title: 'Estudiar', startDate: '2026-10-05', ...body });

  it('una tarea se vincula a un seguimiento propio y lo trae en la respuesta', async () => {
    const facultad = await createTracker({ name: 'Facultad', kind: 'actividad' });
    const res = await task({ trackerId: facultad.id });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.tracker, { id: facultad.id, name: 'Facultad', kind: 'actividad' });

    const unlinked = await ctx.request('PATCH', `/api/tasks/${res.body.id}`, { trackerId: null });
    assert.equal(unlinked.body.tracker, null);
  });

  it('no se vincula a un seguimiento ajeno', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.tracker.create({ data: { name: 'Ajeno', userId: other.id } });
    assert.equal((await task({ trackerId: foreign.id })).body.fields.trackerId, 'Seguimiento no encontrado');
  });

  it('borrar el seguimiento no borra sus tareas', async () => {
    const facultad = await createTracker({ name: 'Facultad', kind: 'actividad' });
    const created = (await task({ trackerId: facultad.id })).body;
    await ctx.request('DELETE', `/api/trackers/${facultad.id}`);
    assert.equal((await ctx.prisma.task.findUnique({ where: { id: created.id } })).trackerId, null);
  });

  it('las sesiones de un objetivo con seguimiento suman a ese seguimiento', async () => {
    const tracker = await createTracker();
    const goal = (await ctx.request('POST', '/api/goals', running({ trackerId: tracker.id }))).body;
    const session = await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06' });
    assert.equal(session.body.tracker.id, tracker.id);
  });
});

describe('actividad de un seguimiento', () => {
  it('cuenta las tareas hechas por día (fecha de fin) y no las pendientes', async () => {
    const facultad = await createTracker({ name: 'Facultad', kind: 'actividad' });
    const add = async (startDate, endDate, done) => {
      const t = (await ctx.request('POST', '/api/tasks', { title: 'x', startDate, endDate, trackerId: facultad.id })).body;
      if (done) await ctx.request('PATCH', `/api/tasks/${t.id}`, { done: true });
    };
    await add('2026-10-05', '2026-10-05', true);
    await add('2026-10-05', '2026-10-05', true);
    await add('2026-10-03', '2026-10-07', true);  // varios días: cuenta el fin
    await add('2026-10-06', '2026-10-06', false); // pendiente: no cuenta

    const { body } = await ctx.request('GET', `/api/trackers/${facultad.id}`);
    assert.equal(body.kind, 'actividad');
    assert.deepEqual(body.activity, [
      { date: '2026-10-05T00:00:00.000Z', count: 2 },
      { date: '2026-10-07T00:00:00.000Z', count: 1 }
    ]);
  });

  it('valida el tipo y lista las opciones para elegir', async () => {
    assert.ok((await ctx.request('POST', '/api/trackers', { name: 'x', kind: 'otro' })).body.fields.kind);
    const board = (await ctx.request('POST', '/api/boards', { name: 'Gimnasio' })).body;
    await createTracker({ name: 'Press banca', unit: 'kg', boardId: board.id });
    await createTracker({ name: 'Facultad', kind: 'actividad' });
    const options = (await ctx.request('GET', '/api/trackers/options')).body;
    assert.deepEqual(options.map(o => [o.name, o.kind, o.board?.name ?? null]), [
      ['Facultad', 'actividad', null],
      ['Press banca', 'medicion', 'Gimnasio']
    ]);
    assert.equal('entries' in options[0], false);
  });
});
