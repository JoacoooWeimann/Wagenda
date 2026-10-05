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
const h = (hours) => hours * 60;
const work = (extra = {}) => ({ title: 'Trabajo', weekdays: [0, 1, 2, 3, 4], startMinute: h(9), endMinute: h(17), ...extra });

describe('Mi semana', () => {
  it('sin configurar, cada día tiene la franja por defecto y no hay rutina', async () => {
    const week = await ok(ctx.request('GET', '/api/week'));
    assert.equal(week.windows.length, 7);
    assert.deepEqual(week.windows[0], { weekday: 0, startMinute: h(8), endMinute: h(23), isDefault: true });
    assert.deepEqual(week.routine, []);
  });

  it('se configura la franja de un día', async () => {
    const week = await ok(ctx.request('PUT', '/api/week/windows/5', { startMinute: h(10), endMinute: h(23) }));
    assert.deepEqual(week.windows[5], { weekday: 5, startMinute: h(10), endMinute: h(23), isDefault: false });
    await ok(ctx.request('PUT', '/api/week/windows/5', { startMinute: h(11), endMinute: h(22) })); // reemplaza
    assert.equal(await ctx.prisma.dayWindow.count(), 1);
    assert.equal((await ctx.request('PUT', '/api/week/windows/7', { startMinute: 0, endMinute: 60 })).status, 400);
  });

  it('un bloque se crea en varios días a la vez, vinculado a un seguimiento propio', async () => {
    const tracker = await ok(ctx.request('POST', '/api/trackers', { name: 'Trabajo' }), 201);
    const week = await ok(ctx.request('POST', '/api/routine', work({ trackerId: tracker.id })), 201);
    assert.equal(week.routine.length, 5);
    assert.deepEqual(week.routine.map(b => b.weekday), [0, 1, 2, 3, 4]);
    assert.deepEqual(week.routine[0].tracker, { id: tracker.id, name: 'Trabajo' });
  });

  it('los bloques del mismo día no se superponen (y si uno choca, no se crea ninguno)', async () => {
    await ok(ctx.request('POST', '/api/routine', { title: 'Cursada', weekdays: [2], startMinute: h(16), endMinute: h(20) }), 201);
    const res = await ctx.request('POST', '/api/routine', work());
    assert.equal(res.status, 400);
    assert.match(res.body.fields.startMinute, /Cursada.*miércoles/);
    assert.equal(await ctx.prisma.routineBlock.count(), 1);

    // pegados (17–18 después de 9–17) sí se puede
    await ok(ctx.request('POST', '/api/routine', work({ weekdays: [0] })), 201);
    await ok(ctx.request('POST', '/api/routine', { title: 'Gym', weekdays: [0], startMinute: h(17), endMinute: h(18) }), 201);
  });

  it('un bloque que cruza la medianoche se guarda como dos tramos', async () => {
    const week = await ok(ctx.request('POST', '/api/routine', { title: 'Noche', weekdays: [4, 6], startMinute: h(22), endMinute: h(6) }), 201);
    assert.deepEqual(week.routine.map(b => [b.weekday, b.startMinute, b.endMinute]), [
      [0, 0, h(6)],          // el del domingo sigue el lunes
      [4, h(22), 1440], [5, 0, h(6)],
      [6, h(22), 1440]
    ]);
    // el tramo de la madrugada también choca con lo que ya está
    const res = await ctx.request('POST', '/api/routine', { title: 'Gym', weekdays: [5], startMinute: h(5), endMinute: h(7) });
    assert.match(res.body.fields.startMinute, /Noche.*sábado/);
  });

  it('se edita (controlando orden y choques) y se borra', async () => {
    const week = await ok(ctx.request('POST', '/api/routine', work({ weekdays: [0] })), 201);
    const [block] = week.routine;
    await ok(ctx.request('POST', '/api/routine', { title: 'Gym', weekdays: [0], startMinute: h(18), endMinute: h(19) }), 201);

    assert.ok((await ctx.request('PATCH', `/api/routine/${block.id}`, { endMinute: h(8) })).body.fields.endMinute);
    assert.match((await ctx.request('PATCH', `/api/routine/${block.id}`, { endMinute: h(18) + 30 })).body.fields.startMinute, /Gym/);
    const edited = await ok(ctx.request('PATCH', `/api/routine/${block.id}`, { title: 'Oficina', endMinute: h(18) }));
    assert.equal(edited.routine.find(b => b.id === block.id).title, 'Oficina');

    const after = await ok(ctx.request('DELETE', `/api/routine/${block.id}`));
    assert.deepEqual(after.routine.map(b => b.title), ['Gym']);
  });

  it('la rutina de otro usuario no se ve ni se toca, y no se vincula a seguimientos ajenos', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.routineBlock.create({ data: { title: 'Ajeno', weekday: 0, startMinute: 0, endMinute: 60, userId: other.id } });
    const foreignTracker = await ctx.prisma.tracker.create({ data: { name: 'Ajeno', userId: other.id } });

    assert.deepEqual((await ok(ctx.request('GET', '/api/week'))).routine, []);
    assert.equal((await ctx.request('PATCH', `/api/routine/${foreign.id}`, { title: 'x' })).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/routine/${foreign.id}`)).status, 404);
    assert.equal((await ctx.request('POST', '/api/routine', work({ trackerId: foreignTracker.id }))).body.fields.trackerId, 'Seguimiento no encontrado');
  });
});
