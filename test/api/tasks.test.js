import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

const newTask = (extra = {}) => ({ title: 'Estudiar', startDate: '2026-09-10', ...extra });

async function create(extra) {
  const res = await ctx.request('POST', '/api/tasks', newTask(extra));
  assert.equal(res.status, 201);
  return res.body;
}

describe('POST /api/tasks', () => {
  it('crea la tarea (201) y aparece en el mes', async () => {
    const task = await create();
    assert.equal(task.userId, 1);
    assert.equal(task.startDate, '2026-09-10T00:00:00.000Z');

    const { body } = await ctx.request('GET', '/api/tasks?year=2026&month=9');
    assert.deepEqual(body.map(t => t.id), [task.id]);
  });

  it('ignora el userId que mande el cliente', async () => {
    const task = await create({ userId: 99 });
    assert.equal(task.userId, 1);
  });

  it('responde 400 con errores por campo', async () => {
    const res = await ctx.request('POST', '/api/tasks', { title: '', priority: 'urgente' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Datos inválidos');
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['priority', 'startDate', 'title']);
  });
});

describe('GET /api/tasks', () => {
  it('una tarea que cruza de mes aparece en los dos', async () => {
    const task = await create({ startDate: '2026-09-30', endDate: '2026-10-01' });
    for (const month of [9, 10]) {
      const { body } = await ctx.request('GET', `/api/tasks?year=2026&month=${month}`);
      assert.deepEqual(body.map(t => t.id), [task.id], `mes ${month}`);
    }
    const { body: nov } = await ctx.request('GET', '/api/tasks?year=2026&month=11');
    assert.deepEqual(nov, []);
  });

  it('responde 400 si falta o es inválido el mes', async () => {
    assert.equal((await ctx.request('GET', '/api/tasks')).status, 400);
    assert.equal((await ctx.request('GET', '/api/tasks?year=2026&month=13')).status, 400);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('actualiza solo los campos enviados', async () => {
    const task = await create({ description: 'detalle' });
    const res = await ctx.request('PATCH', `/api/tasks/${task.id}`, { done: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.done, true);
    assert.equal(res.body.description, 'detalle');
  });

  it('valida el fin contra el inicio guardado en la base', async () => {
    const task = await create({ startDate: '2026-09-10' });
    const res = await ctx.request('PATCH', `/api/tasks/${task.id}`, { endDate: '2026-09-05' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.endDate);
  });

  it('responde 400 si no hay campos para actualizar', async () => {
    const task = await create();
    const res = await ctx.request('PATCH', `/api/tasks/${task.id}`, { foo: 1 });
    assert.equal(res.status, 400);
  });

  it('responde 404 si no existe y 400 si el id es inválido', async () => {
    assert.equal((await ctx.request('PATCH', '/api/tasks/99999', { done: true })).status, 404);
    assert.equal((await ctx.request('PATCH', '/api/tasks/abc', { done: true })).status, 400);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('borra la tarea y un segundo intento da 404', async () => {
    const task = await create();
    assert.equal((await ctx.request('DELETE', `/api/tasks/${task.id}`)).status, 200);
    assert.equal((await ctx.request('DELETE', `/api/tasks/${task.id}`)).status, 404);
  });
});

describe('propiedad de los datos', () => {
  it('no se puede editar ni borrar la tarea de otro usuario', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.task.create({
      data: { title: 'Ajena', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-10'), userId: other.id }
    });

    assert.equal((await ctx.request('PATCH', `/api/tasks/${foreign.id}`, { done: true })).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/tasks/${foreign.id}`)).status, 404);

    const still = await ctx.prisma.task.findUnique({ where: { id: foreign.id } });
    assert.equal(still.done, false);
  });

  it('el GET del mes no incluye tareas de otros usuarios', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    await ctx.prisma.task.create({
      data: { title: 'Ajena', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-10'), userId: other.id }
    });
    const { body } = await ctx.request('GET', '/api/tasks?year=2026&month=9');
    assert.deepEqual(body, []);
  });
});

describe('páginas', () => {
  it('renderizan las vistas EJS con la sección activa en la navegación', async () => {
    for (const url of ['/', '/calendar', '/goals', '/trackers', '/groups']) {
      const res = await ctx.request('GET', url);
      assert.equal(res.status, 200, url);
      assert.match(res.body, new RegExp(`class="app-nav-link active" href="${url}" aria-current="page"`), url);
      assert.equal(res.body.match(/app-nav-link active/g).length, 1, url); // una sola activa
    }
  });

  it('con sesión, el inicio es la card del día', async () => {
    const res = await ctx.request('GET', '/?date=2026-10-05');
    assert.equal(res.status, 200);
    assert.match(res.body, /id="home-root"/);
    assert.match(res.body, /\/build\/home\.js/);
  });

  it('sin sesión, la portada muestra el acceso y no las secciones', async () => {
    const res = await ctx.request('GET', '/', undefined, { cookie: null });
    assert.match(res.body, /app-public-header/);
    assert.doesNotMatch(res.body, /app-nav-link/);
  });
});

describe('/calendar con mes en la URL', () => {
  it('abre el mes pedido y, si es inválido, el actual', async () => {
    const res = await ctx.request('GET', '/calendar?year=2027&month=3');
    assert.match(res.body, /data-year="2027" data-month="3"/);

    const now = new Date();
    const bad = await ctx.request('GET', '/calendar?year=2027&month=13');
    assert.match(bad.body, new RegExp(`data-year="${now.getFullYear()}" data-month="${now.getMonth() + 1}"`));
  });
});

describe('errores generales', () => {
  it('JSON mal formado -> 400 en JSON', async () => {
    const res = await ctx.request('POST', '/api/tasks', '{"title":', { raw: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'JSON inválido');
  });

  it('ruta de API inexistente -> 404 en JSON', async () => {
    const res = await ctx.request('GET', '/api/nada');
    assert.equal(res.status, 404);
    assert.match(res.type, /application\/json/);
  });

  it('página inexistente -> 404 en HTML', async () => {
    const res = await ctx.request('GET', '/no-existe');
    assert.equal(res.status, 404);
    assert.match(res.type, /text\/html/);
  });
});
