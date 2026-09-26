import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

const algebra = (extra = {}) => ({
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: '2026-10-05', deadline: '2026-11-08', totalUnits: 6, ...extra
});
const running = (extra = {}) => ({
  title: 'Correr 10 km', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-29', sessionsPerWeek: 3, ...extra
});

async function createGoal(body) {
  const res = await ctx.request('POST', '/api/goals', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const monthTasks = async (year, month) =>
  (await ctx.request('GET', `/api/tasks?year=${year}&month=${month}`)).body;

describe('POST /api/goals/preview', () => {
  it('devuelve el plan sin guardar nada', async () => {
    const res = await ctx.request('POST', '/api/goals/preview', algebra());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.weeks.map(w => w.label),
      ['Unidades 1–2', 'Unidad 3', 'Unidades 4–5', 'Unidad 6', 'Repaso']);

    assert.equal(await ctx.prisma.goal.count(), 0);
    assert.equal(await ctx.prisma.task.count(), 0);
  });

  it('responde 400 con errores por campo, incluidos los del plan', async () => {
    const bad = await ctx.request('POST', '/api/goals/preview', algebra({ totalUnits: 0, type: 'x' }));
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.totalUnits && bad.body.fields.type);

    // Válido para el validador, pero el algoritmo necesita 4 semanas para "fases"
    const short = await ctx.request('POST', '/api/goals/preview', running({ deadline: '2026-10-20' }));
    assert.equal(short.status, 400);
    assert.match(short.body.fields.deadline, /al menos 4 semanas/);
  });

  it('rechaza plazos de más de 52 semanas', async () => {
    const res = await ctx.request('POST', '/api/goals/preview', algebra({ deadline: '2028-01-01' }));
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.deadline);
  });
});

describe('POST /api/goals', () => {
  it('guarda objetivo, semanas y tareas; las tareas aparecen en el calendario', async () => {
    const goal = await createGoal(algebra());
    assert.equal(goal.weeks.length, 5);
    assert.equal(goal.userId, 1);
    assert.deepEqual(goal.progress, { done: 0, total: 8 }); // 6 unidades + repaso + fecha límite
    assert.equal('reviewWeek' in goal, false);

    const october = await monthTasks(2026, 10);
    assert.ok(october.some(t => t.title === 'Unidad 1'));
    const november = await monthTasks(2026, 11);
    const deadline = november.find(t => t.title === 'Fecha límite: Álgebra');
    assert.equal(deadline.priority, 'alta');
    assert.equal(deadline.category, 'Académico');
  });

  it('las tareas generadas se editan como cualquier otra y el progreso se actualiza', async () => {
    const goal = await createGoal(running());
    const task = goal.weeks[0].tasks[0];
    const patch = await ctx.request('PATCH', `/api/tasks/${task.id}`, { done: true });
    assert.equal(patch.status, 200);

    const detail = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(detail.body.progress.done, 1);
  });

  it('no guarda nada si los datos son inválidos', async () => {
    const res = await ctx.request('POST', '/api/goals', running({ deadline: '2026-10-20' }));
    assert.equal(res.status, 400);
    assert.equal(await ctx.prisma.goal.count(), 0);
    assert.equal(await ctx.prisma.task.count(), 0);
  });
});

describe('GET /api/goals', () => {
  it('lista por fecha límite con progreso y el resumen de semanas (sin tareas)', async () => {
    await createGoal(running());
    await createGoal(algebra());
    const { status, body } = await ctx.request('GET', '/api/goals');
    assert.equal(status, 200);
    assert.deepEqual(body.map(g => g.title), ['Álgebra', 'Correr 10 km']);
    assert.deepEqual(body[0].weeks.map(w => w.label),
      ['Unidades 1–2', 'Unidad 3', 'Unidades 4–5', 'Unidad 6', 'Repaso']);
    assert.equal('tasks' in body[0].weeks[0], false);
    assert.equal(body[1].progress.total, 8 * 3 + 1); // 8 semanas x 3 sesiones + fecha límite
  });
});

describe('GET /api/goals/:id', () => {
  it('devuelve semanas ordenadas con sus tareas', async () => {
    const goal = await createGoal(running());
    const { status, body } = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(status, 200);
    assert.deepEqual(body.weeks.map(w => w.number), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(body.weeks[0].label, 'Diagnóstico');
    assert.equal(body.weeks[0].tasks.length, 3);
  });

  it('404 si no existe, 400 si el id es inválido', async () => {
    assert.equal((await ctx.request('GET', '/api/goals/9999')).status, 404);
    assert.equal((await ctx.request('GET', '/api/goals/abc')).status, 400);
  });
});

describe('DELETE /api/goals/:id', () => {
  it('borra el objetivo, sus semanas y sus tareas (cascade), sin tocar tareas sueltas', async () => {
    const goal = await createGoal(algebra());
    const loose = await ctx.request('POST', '/api/tasks', { title: 'Suelta', startDate: '2026-10-06' });

    assert.equal((await ctx.request('DELETE', `/api/goals/${goal.id}`)).status, 200);

    assert.equal(await ctx.prisma.goalWeek.count(), 0);
    const october = await monthTasks(2026, 10);
    assert.deepEqual(october.map(t => t.id), [loose.body.id]);
    assert.equal((await ctx.request('DELETE', `/api/goals/${goal.id}`)).status, 404);
  });
});

describe('propiedad de los objetivos', () => {
  it('los objetivos de otro usuario no se ven, no se leen y no se borran', async () => {
    const other = await ctx.prisma.user.create({ data: { name: 'Otro' } });
    const foreign = await ctx.prisma.goal.create({
      data: {
        title: 'Ajeno', type: 'fisico', strategy: 'fases', sessionsPerWeek: 3,
        startDate: new Date('2026-10-05'), deadline: new Date('2026-11-29'), userId: other.id
      }
    });

    assert.deepEqual((await ctx.request('GET', '/api/goals')).body, []);
    assert.equal((await ctx.request('GET', `/api/goals/${foreign.id}`)).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/goals/${foreign.id}`)).status, 404);
    assert.equal(await ctx.prisma.goal.count({ where: { id: foreign.id } }), 1);
  });
});
