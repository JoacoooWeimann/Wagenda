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
    // Cuotas: unidades [2,1,2,1] + repaso 1 = 7 (la fecha límite es un hito y no cuenta)
    assert.deepEqual(goal.progress, { done: 0, total: 7 });
    assert.deepEqual(goal.weeks.map(w => w.target), [2, 1, 2, 1, 1]);
    assert.equal('reviewWeek' in goal, false);

    const october = await monthTasks(2026, 10);
    assert.ok(october.some(t => t.title === 'Unidad 1'));
    const november = await monthTasks(2026, 11);
    const deadline = november.find(t => t.title === 'Fecha límite: Álgebra');
    assert.equal(deadline.priority, 'alta');
    assert.equal(deadline.category, 'Académico');
  });

  it('las tareas del calendario traen su objetivo y semana (también al editarlas)', async () => {
    const goal = await createGoal(algebra());
    const october = await monthTasks(2026, 10);
    const unit = october.find(t => t.title === 'Unidad 1');
    assert.deepEqual(unit.goalWeek, { number: 1, goal: { id: goal.id, title: 'Álgebra', strategy: 'divisible' } });

    const patched = await ctx.request('PATCH', `/api/tasks/${unit.id}`, { done: true });
    assert.equal(patched.body.goalWeek.goal.title, 'Álgebra');

    const loose = await ctx.request('POST', '/api/tasks', { title: 'Suelta', startDate: '2026-10-06' });
    assert.equal(loose.body.goalWeek, null);
  });

  it('las tareas generadas se editan como cualquier otra y el progreso se actualiza', async () => {
    const goal = await createGoal(algebra());
    const task = goal.weeks[0].tasks[0];
    const patch = await ctx.request('PATCH', `/api/tasks/${task.id}`, { done: true });
    assert.equal(patch.status, 200);

    const detail = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(detail.body.progress.done, 1);
    assert.equal(detail.body.weeks[0].done, 1);
  });

  it('marcar la fecha límite como hecha no suma a la cuota', async () => {
    const goal = await createGoal(algebra());
    const hito = goal.weeks.at(-1).tasks.find(t => t.kind === 'hito');
    await ctx.request('PATCH', `/api/tasks/${hito.id}`, { done: true });
    const detail = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(detail.body.progress.done, 0);
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
    assert.equal(body[1].progress.total, 8 * 3); // 8 semanas x cuota de 3
    assert.deepEqual(Object.keys(body[1].weeks[0]).sort(),
      ['done', 'endDate', 'goalId', 'id', 'label', 'number', 'startDate', 'target']);
  });
});

describe('GET /api/goals/:id', () => {
  it('devuelve semanas ordenadas con sus tareas', async () => {
    const goal = await createGoal(running());
    const { status, body } = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(status, 200);
    assert.deepEqual(body.weeks.map(w => w.number), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(body.weeks[0].label, 'Diagnóstico');
    assert.equal(body.weeks[0].target, 3);
    assert.deepEqual(body.weeks[0].tasks, []); // las sesiones no vienen pre-fechadas
  });

  it('404 si no existe, 400 si el id es inválido', async () => {
    assert.equal((await ctx.request('GET', '/api/goals/9999')).status, 404);
    assert.equal((await ctx.request('GET', '/api/goals/abc')).status, 400);
  });
});

describe('POST /api/goals/:id/sessions', () => {
  const logSession = (goalId, date) => ctx.request('POST', `/api/goals/${goalId}/sessions`, { date });

  it('registra una sesión hecha ese día, en su semana, visible en el calendario', async () => {
    const goal = await createGoal(running());
    const res = await logSession(goal.id, '2026-10-14'); // miércoles de la semana 2
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, 'sesion');
    assert.equal(res.body.done, true);
    assert.equal(res.body.title, 'Consistencia · sesión');
    assert.equal(res.body.goalWeekId, goal.weeks[1].id);

    const october = await monthTasks(2026, 10);
    assert.ok(october.some(t => t.id === res.body.id && t.startDate === '2026-10-14T00:00:00.000Z'));
  });

  it('el exceso de una semana no compensa otra (min por semana)', async () => {
    const goal = await createGoal(running());
    for (const day of ['05', '06', '07', '08']) await logSession(goal.id, `2026-10-${day}`); // 4 en la semana 1

    const { body } = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(body.weeks[0].done, 4);                   // el exceso queda registrado
    assert.deepEqual(body.progress, { done: 3, total: 24 }); // pero cuenta hasta la cuota
  });

  it('borrar o desmarcar la sesión la deja de contar', async () => {
    const goal = await createGoal(running());
    const a = (await logSession(goal.id, '2026-10-06')).body;
    const b = (await logSession(goal.id, '2026-10-07')).body;
    await ctx.request('DELETE', `/api/tasks/${a.id}`);
    await ctx.request('PATCH', `/api/tasks/${b.id}`, { done: false });
    const { body } = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(body.weeks[0].done, 0);
  });

  it('valida fecha, plazo, estrategia y propiedad', async () => {
    const goal = await createGoal(running());
    assert.equal((await logSession(goal.id, 'ayer')).status, 400);
    assert.ok((await logSession(goal.id, '2026-12-01')).body.fields.date);       // fuera del plazo
    const divisible = await createGoal(algebra());
    assert.ok((await logSession(divisible.id, '2026-10-06')).body.fields.strategy);
    assert.equal((await logSession(9999, '2026-10-06')).status, 404);
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
