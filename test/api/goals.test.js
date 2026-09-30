import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

const algebra = (extra = {}) => ({
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: '2026-10-05', deadline: '2026-11-08', contents: [{ name: 'Unidad', count: 6 }], ...extra
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
    const bad = await ctx.request('POST', '/api/goals/preview', algebra({ contents: [{ name: 'Unidad', count: 0 }], type: 'x' }));
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.contents && bad.body.fields.type);

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
    // Los parámetros de generación no se guardan
    for (const param of ['reviewWeek', 'contents', 'totalUnits', 'unitName', 'sessionsPerWeek']) {
      assert.equal(param in goal, false, param);
    }

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

describe('editar tareas de un plan', () => {
  const targets = async (goalId) =>
    (await ctx.request('GET', `/api/goals/${goalId}`)).body.weeks.map(w => w.target);

  it('mover un contenido de fecha lo pasa de semana y la cuota se ajusta sola', async () => {
    const goal = await createGoal(algebra({ reviewWeek: false })); // [1,1,2,1,1]
    const unit1 = goal.weeks[0].tasks.find(t => t.kind === 'tarea');

    // de la semana 1 a la semana 2 (12/10 a 18/10)
    const res = await ctx.request('PATCH', `/api/tasks/${unit1.id}`, { startDate: '2026-10-12', endDate: '2026-10-18' });
    assert.equal(res.status, 200);
    assert.equal(res.body.goalWeek.number, 2);
    assert.deepEqual(await targets(goal.id), [0, 2, 2, 1, 1]);
  });

  it('borrar un contenido baja la cuota de su semana', async () => {
    const goal = await createGoal(algebra({ reviewWeek: false }));
    const unit = goal.weeks[2].tasks.find(t => t.kind === 'tarea');
    await ctx.request('DELETE', `/api/tasks/${unit.id}`);
    assert.deepEqual(await targets(goal.id), [1, 1, 1, 1, 1]);
  });

  it('no se puede mover una tarea fuera del plazo del objetivo', async () => {
    const goal = await createGoal(algebra());
    const unit = goal.weeks[0].tasks[0];
    const res = await ctx.request('PATCH', `/api/tasks/${unit.id}`, { startDate: '2026-12-01', endDate: '2026-12-01' });
    assert.equal(res.status, 400);
    assert.match(res.body.fields.startDate, /plazo/);
  });

  it('la fecha límite no se mueve, pero se puede renombrar (y reenviar sus mismas fechas)', async () => {
    const goal = await createGoal(algebra());
    const hito = goal.weeks.at(-1).tasks.find(t => t.kind === 'hito');

    const moved = await ctx.request('PATCH', `/api/tasks/${hito.id}`, { startDate: '2026-11-01', endDate: '2026-11-01' });
    assert.equal(moved.status, 400);

    // El formulario del calendario manda siempre todas las fechas: si no cambian, es válido
    const renamed = await ctx.request('PATCH', `/api/tasks/${hito.id}`, {
      title: 'Final de Álgebra', startDate: '2026-11-08', endDate: '2026-11-08'
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.title, 'Final de Álgebra');
  });

  it('mover una sesión la pasa a la semana de su nueva fecha', async () => {
    const goal = await createGoal(running());
    const session = (await ctx.request('POST', `/api/goals/${goal.id}/sessions`, { date: '2026-10-06' })).body;
    const res = await ctx.request('PATCH', `/api/tasks/${session.id}`, { startDate: '2026-10-20', endDate: '2026-10-20' });
    assert.equal(res.body.goalWeek.number, 3);
  });
});

describe('PATCH /api/goals/:id/weeks/:weekId', () => {
  const patchWeek = (goalId, weekId, body) => ctx.request('PATCH', `/api/goals/${goalId}/weeks/${weekId}`, body);

  it('cambia etiqueta y cuota de una semana y devuelve el objetivo actualizado', async () => {
    const goal = await createGoal(running());
    const res = await patchWeek(goal.id, goal.weeks[4].id, { label: 'Descanso', target: 0 });
    assert.equal(res.status, 200);
    assert.equal(res.body.weeks[4].label, 'Descanso');
    assert.equal(res.body.weeks[4].target, 0);
    assert.equal(res.body.weeks[5].label, 'Intensidad');
    assert.equal(res.body.progress.total, 24 - 3);
  });

  it('con applyToPhase cambia todas las semanas de la fase', async () => {
    const goal = await createGoal(running()); // Consistencia: semanas 2-4
    const res = await patchWeek(goal.id, goal.weeks[1].id, { label: 'Base aeróbica', target: 4, applyToPhase: true });
    assert.deepEqual(res.body.weeks.map(w => w.label), [
      'Diagnóstico', 'Base aeróbica', 'Base aeróbica', 'Base aeróbica',
      'Intensidad', 'Intensidad', 'Intensidad', 'Evaluación'
    ]);
    assert.deepEqual(res.body.weeks.map(w => w.target), [3, 4, 4, 4, 3, 3, 3, 3]);
  });

  it('cambiar la etiqueta de una semana cambia la duración de las fases', async () => {
    const goal = await createGoal(running());
    const res = await patchWeek(goal.id, goal.weeks[4].id, { label: 'Consistencia' }); // la 5 pasa a Consistencia
    assert.equal(res.body.weeks.filter(w => w.label === 'Consistencia').length, 4);
  });

  it('en un objetivo por contenido la cuota no se edita (se calcula sola)', async () => {
    const goal = await createGoal(algebra());
    const res = await patchWeek(goal.id, goal.weeks[0].id, { target: 5 });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.target);
    assert.equal((await patchWeek(goal.id, goal.weeks[0].id, { label: 'Intro' })).status, 200);
  });

  it('valida datos y pertenencia', async () => {
    const goal = await createGoal(running());
    const other = await createGoal(algebra());
    assert.equal((await patchWeek(goal.id, goal.weeks[0].id, {})).status, 400);
    assert.ok((await patchWeek(goal.id, goal.weeks[0].id, { target: 15 })).body.fields.target);
    assert.ok((await patchWeek(goal.id, goal.weeks[0].id, { label: ' ' })).body.fields.label);
    assert.equal((await patchWeek(goal.id, other.weeks[0].id, { label: 'x' })).status, 404); // semana de otro objetivo
    assert.equal((await patchWeek(9999, goal.weeks[0].id, { label: 'x' })).status, 404);
  });
});

describe('POST /api/goals/:id/weeks/:weekId/tasks', () => {
  it('agrega un contenido que ocupa la semana y sube su cuota', async () => {
    const goal = await createGoal(algebra({ reviewWeek: false }));
    const week = goal.weeks[1];
    const res = await ctx.request('POST', `/api/goals/${goal.id}/weeks/${week.id}/tasks`, { title: 'TP 1' });
    assert.equal(res.status, 201);
    assert.equal(res.body.startDate, week.startDate);
    assert.equal(res.body.endDate, week.endDate);
    assert.equal(res.body.goalWeek.number, 2);

    const { body } = await ctx.request('GET', `/api/goals/${goal.id}`);
    assert.equal(body.weeks[1].target, 2);
  });

  it('solo en objetivos por contenido, y con título', async () => {
    const fases = await createGoal(running());
    assert.equal((await ctx.request('POST', `/api/goals/${fases.id}/weeks/${fases.weeks[0].id}/tasks`, { title: 'x' })).status, 400);
    const divisible = await createGoal(algebra());
    assert.ok((await ctx.request('POST', `/api/goals/${divisible.id}/weeks/${divisible.weeks[0].id}/tasks`, {})).body.fields.title);
  });
});

describe('PATCH /api/goals/:id', () => {
  it('edita título, tipo y descripción, y actualiza el hito y la categoría de las tareas', async () => {
    const goal = await createGoal(algebra());
    const res = await ctx.request('PATCH', `/api/goals/${goal.id}`, {
      title: 'Álgebra II', type: 'profesional', description: 'Segundo cuatrimestre'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Álgebra II');
    assert.equal(res.body.description, 'Segundo cuatrimestre');
    assert.equal(res.body.strategy, 'divisible');

    const tasks = res.body.weeks.flatMap(w => w.tasks);
    assert.equal(tasks.find(t => t.kind === 'hito').title, 'Fecha límite: Álgebra II');
    assert.ok(tasks.every(t => t.category === 'Profesional'));
  });

  it('ignora la estrategia y valida los campos', async () => {
    const goal = await createGoal(algebra());
    assert.equal((await ctx.request('PATCH', `/api/goals/${goal.id}`, { strategy: 'fases' })).status, 400);
    const bad = await ctx.request('PATCH', `/api/goals/${goal.id}`, { title: '', type: 'x' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.title);
    assert.ok(bad.body.fields.type);
    assert.equal((await ctx.request('PATCH', '/api/goals/9999', { title: 'x' })).status, 404);
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
        title: 'Ajeno', type: 'fisico', strategy: 'fases',
        startDate: new Date('2026-10-05'), deadline: new Date('2026-11-29'), userId: other.id
      }
    });

    assert.deepEqual((await ctx.request('GET', '/api/goals')).body, []);
    assert.equal((await ctx.request('GET', `/api/goals/${foreign.id}`)).status, 404);
    assert.equal((await ctx.request('PATCH', `/api/goals/${foreign.id}`, { title: 'Mío' })).status, 404);
    assert.equal((await ctx.request('DELETE', `/api/goals/${foreign.id}`)).status, 404);
    assert.equal(await ctx.prisma.goal.count({ where: { id: foreign.id } }), 1);
  });
});
