import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

async function ok(promise, status = 200) {
  const res = await promise;
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
}

const createTracker = (body = { name: 'Gimnasio', itemLabel: 'Ejercicio' }) =>
  ok(ctx.request('POST', '/api/trackers', body), 201);
// Agrega un ítem y devuelve el ítem (la API devuelve el seguimiento completo)
async function addItem(tracker, body = { name: 'Press banca', unit: 'kg' }) {
  const updated = await ok(ctx.request('POST', `/api/trackers/${tracker.id}/items`, body), 201);
  return updated.items.find(i => i.name === body.name.trim());
}
const addEntry = (item, date, value, extra = {}) =>
  ctx.request('POST', `/api/items/${item.id}/entries`, { date, value, ...extra });

const running = (extra = {}) => ({
  title: 'Fuerza', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-29', sessionsPerWeek: 3, ...extra
});

describe('seguimientos (áreas)', () => {
  it('se crea, se lista con sus ítems, se edita y se borra con sus ítems y registros', async () => {
    const gym = await createTracker({ name: 'Gimnasio', description: 'Fuerza', itemLabel: 'Ejercicio' });
    assert.deepEqual([gym.name, gym.itemLabel, gym.items, gym.activity, gym.sharedBy], ['Gimnasio', 'Ejercicio', [], [], null]);

    const bench = await addItem(gym);
    await addItem(gym, { name: 'Cardio', kind: 'actividad' });
    await ok(addEntry(bench, '2026-10-05', 80), 201);

    const [listed] = await ok(ctx.request('GET', '/api/trackers'));
    assert.deepEqual(listed.items.map(i => [i.name, i.kind]), [['Cardio', 'actividad'], ['Press banca', 'medicion']]);

    const edited = await ok(ctx.request('PATCH', `/api/trackers/${gym.id}`, { name: 'Gym', itemLabel: '' }));
    assert.equal(edited.name, 'Gym');
    assert.equal(edited.itemLabel, null);

    await ok(ctx.request('DELETE', `/api/trackers/${gym.id}`));
    assert.equal(await ctx.prisma.trackerItem.count(), 0); // cascade: ítems
    assert.equal(await ctx.prisma.trackerEntry.count(), 0); // y sus registros
  });

  it('valida los datos', async () => {
    const bad = await ctx.request('POST', '/api/trackers', { name: '', itemLabel: 'x'.repeat(21) });
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['itemLabel', 'name']);
    const gym = await createTracker();
    assert.equal((await ctx.request('PATCH', `/api/trackers/${gym.id}`, {})).status, 400);
  });

  it('las opciones para formularios traen seguimientos con sus ítems, sin registros', async () => {
    const gym = await createTracker();
    await addItem(gym);
    await createTracker({ name: 'Facultad', itemLabel: 'Materia' });
    const options = await ok(ctx.request('GET', '/api/trackers/options'));
    assert.deepEqual(options.map(o => [o.name, o.items.map(i => i.name)]), [['Facultad', []], ['Gimnasio', ['Press banca']]]);
    assert.equal('entries' in options[1].items[0], false);
  });

  it('los seguimientos de otro usuario no se ven ni se tocan', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.tracker.create({ data: { name: 'Ajeno', userId: other.id } });
    const foreignItem = await ctx.prisma.trackerItem.create({ data: { name: 'Ajeno', userId: other.id, trackerId: foreign.id } });

    assert.deepEqual(await ok(ctx.request('GET', '/api/trackers')), []);
    assert.equal((await ctx.request('GET', `/api/trackers/${foreign.id}`)).status, 404);
    assert.equal((await ctx.request('POST', `/api/trackers/${foreign.id}/items`, { name: 'x' })).status, 404);
    assert.equal((await addEntry(foreignItem, '2026-10-05', 1)).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/trackers/${foreign.id}`)).status, 404);
    assert.equal((await ctx.request('PATCH', `/api/items/${foreignItem.id}`, { name: 'x' })).status, 404);
  });
});

describe('ítems', () => {
  it('de medición: registros con resumen (mejor marca según higherIsBetter)', async () => {
    const gym = await createTracker();
    const run = await addItem(gym, { name: '5 km', unit: 'min', higherIsBetter: false });
    for (const [d, v] of [['2026-10-05', 30], ['2026-10-19', 29], ['2026-10-12', 28]]) await ok(addEntry(run, d, v, { note: 'ok' }), 201);

    const [tracker] = await ok(ctx.request('GET', '/api/trackers'));
    const item = tracker.items[0];
    assert.deepEqual(item.entries.map(e => e.value), [30, 28, 29]); // cronológico
    assert.equal(item.summary.best.value, 28);
    assert.equal(item.summary.last.value, 29);
  });

  it('se edita, se pasa a otro seguimiento y se borra (sus tareas quedan en el seguimiento)', async () => {
    const gym = await createTracker();
    const other = await createTracker({ name: 'Running' });
    const bench = await addItem(gym);
    const task = await ok(ctx.request('POST', '/api/tasks', { title: 'Pecho', startDate: '2026-10-05', itemId: bench.id }), 201);

    const moved = await ok(ctx.request('PATCH', `/api/items/${bench.id}`, { name: 'Press plano', trackerId: other.id }));
    assert.equal(moved.id, other.id); // devuelve el seguimiento al que quedó
    assert.deepEqual(moved.items.map(i => i.name), ['Press plano']);

    await ok(ctx.request('DELETE', `/api/items/${bench.id}`));
    const after = await ctx.prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(after.itemId, null);
    assert.equal(after.trackerId, gym.id); // la tarea guarda el seguimiento que tenía al crearse
  });

  it('valida el ítem y los registros, y borra registros', async () => {
    const gym = await createTracker();
    const bad = await ctx.request('POST', `/api/trackers/${gym.id}/items`, { name: '', kind: 'otro', higherIsBetter: 'si' });
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['higherIsBetter', 'kind', 'name']);

    const bench = await addItem(gym);
    assert.deepEqual(Object.keys((await addEntry(bench, '2026-13-01', 'mucho')).body.fields).sort(), ['date', 'value']);
    const entry = await ok(addEntry(bench, '2026-10-05', 80), 201);
    await ok(ctx.request('DELETE', `/api/items/${bench.id}/entries/${entry.id}`));
    assert.equal((await ctx.request('DELETE', `/api/items/${bench.id}/entries/${entry.id}`)).status, 404);
  });
});

describe('tareas vinculadas', () => {
  const task = (body) => ctx.request('POST', '/api/tasks', { title: 'Estudiar', startDate: '2026-10-05', ...body });

  it('al seguimiento solo, o a un ítem (el seguimiento sale del ítem)', async () => {
    const facu = await createTracker({ name: 'Facultad', itemLabel: 'Materia' });
    const logic = await addItem(facu, { name: 'Lógica', kind: 'actividad' });

    const general = await ok(task({ trackerId: facu.id }), 201);
    assert.deepEqual([general.tracker.name, general.item], ['Facultad', null]);

    const withItem = await ok(task({ itemId: logic.id }), 201);
    assert.deepEqual([withItem.tracker.id, withItem.item.name], [facu.id, 'Lógica']);

    const unlinked = await ok(ctx.request('PATCH', `/api/tasks/${withItem.id}`, { trackerId: null }));
    assert.deepEqual([unlinked.tracker, unlinked.item], [null, null]);
  });

  it('cambiar de seguimiento quita el ítem anterior; un ítem de otro seguimiento se rechaza', async () => {
    const facu = await createTracker({ name: 'Facultad' });
    const work = await createTracker({ name: 'Trabajo' });
    const logic = await addItem(facu, { name: 'Lógica', kind: 'actividad' });
    const created = await ok(task({ itemId: logic.id }), 201);

    const moved = await ok(ctx.request('PATCH', `/api/tasks/${created.id}`, { trackerId: work.id }));
    assert.deepEqual([moved.tracker.name, moved.item], ['Trabajo', null]);

    assert.equal((await task({ trackerId: work.id, itemId: logic.id })).body.fields.itemId, 'El ítem no es de ese seguimiento');
  });

  it('no se vincula a nada ajeno', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.tracker.create({ data: { name: 'Ajeno', userId: other.id } });
    const foreignItem = await ctx.prisma.trackerItem.create({ data: { name: 'x', userId: other.id, trackerId: foreign.id } });
    assert.equal((await task({ trackerId: foreign.id })).body.fields.trackerId, 'Seguimiento no encontrado');
    assert.equal((await task({ itemId: foreignItem.id })).body.fields.itemId, 'Ítem no encontrado');
  });

  it('la actividad cuenta tareas hechas por día (fecha de fin): el seguimiento suma todo, cada ítem lo suyo', async () => {
    const facu = await createTracker({ name: 'Facultad' });
    const logic = await addItem(facu, { name: 'Lógica', kind: 'actividad' });
    const add = async (body, done = true) => {
      const t = await ok(task(body), 201);
      if (done) await ok(ctx.request('PATCH', `/api/tasks/${t.id}`, { done: true }));
    };
    await add({ itemId: logic.id, startDate: '2026-10-05' });
    await add({ itemId: logic.id, startDate: '2026-10-03', endDate: '2026-10-07' }); // varios días: cuenta el fin
    await add({ trackerId: facu.id, startDate: '2026-10-05' });                      // sin materia
    await add({ itemId: logic.id, startDate: '2026-10-06' }, false);                 // pendiente: no cuenta

    const tracker = await ok(ctx.request('GET', `/api/trackers/${facu.id}`));
    assert.deepEqual(tracker.activity, [
      { date: '2026-10-05T00:00:00.000Z', count: 2 },
      { date: '2026-10-07T00:00:00.000Z', count: 1 }
    ]);
    assert.deepEqual(tracker.items[0].activity, [
      { date: '2026-10-05T00:00:00.000Z', count: 1 },
      { date: '2026-10-07T00:00:00.000Z', count: 1 }
    ]);
  });
});

describe('objetivos vinculados a un ítem', () => {
  it('la sesión suma actividad al ítem y, si es de medición, guarda el valor', async () => {
    const gym = await createTracker();
    const bench = await addItem(gym);
    const goal = await ok(ctx.request('POST', '/api/goals', running({ itemId: bench.id })), 201);
    assert.deepEqual(goal.item, { id: bench.id, name: 'Press banca', unit: 'kg', kind: 'medicion', tracker: { id: gym.id, name: 'Gimnasio' } });

    const session = await ok(ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06', value: 82.5, note: 'fácil' }), 201);
    assert.deepEqual([session.tracker.id, session.item.id], [gym.id, bench.id]);

    const [entry] = (await ok(ctx.request('GET', `/api/trackers/${gym.id}`))).items[0].entries;
    assert.deepEqual([entry.value, entry.note, entry.date], [82.5, 'fácil', '2026-10-06T00:00:00.000Z']);
  });

  it('sin ítem de medición, el valor se rechaza y no se crea nada', async () => {
    const gym = await createTracker();
    const cardio = await addItem(gym, { name: 'Cardio', kind: 'actividad' });
    for (const body of [running(), running({ itemId: cardio.id })]) {
      const goal = await ok(ctx.request('POST', '/api/goals', body), 201);
      const res = await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06', value: 80 });
      assert.equal(res.status, 400);
      assert.ok(res.body.fields.value);
    }
    assert.equal(await ctx.prisma.task.count({ where: { kind: 'sesion' } }), 0);
  });

  it('se vincula al editar (solo por fases); borrar el ítem no borra el objetivo', async () => {
    const gym = await createTracker();
    const bench = await addItem(gym);
    const goal = await ok(ctx.request('POST', '/api/goals', running()), 201);

    const linked = await ok(ctx.request('PATCH', `/api/goals/${goal.id}`, { itemId: bench.id }));
    assert.equal(linked.item.id, bench.id);
    await ok(ctx.request('DELETE', `/api/items/${bench.id}`));
    assert.equal((await ok(ctx.request('GET', `/api/goals/${goal.id}`))).itemId, null);

    const divisible = await ok(ctx.request('POST', '/api/goals', {
      title: 'Álgebra', type: 'academico', strategy: 'divisible',
      startDate: '2026-10-05', deadline: '2026-11-08', contents: [{ name: 'Unidad', count: 6 }]
    }), 201);
    const other = await addItem(gym, { name: 'Sentadilla' });
    assert.ok((await ctx.request('PATCH', `/api/goals/${divisible.id}`, { itemId: other.id })).body.fields.itemId);
  });
});
