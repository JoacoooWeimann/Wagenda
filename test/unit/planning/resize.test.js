import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, resizePlan, PlanError, FREE_WEEK_LABEL } from '../../../src/utiles/planning/index.js';
import { parseDateOnly } from '../../../src/utiles/dates.js';

const d = parseDateOnly;
const key = (date) => date.toISOString().slice(0, 10);

const algebra = {
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: d('2026-10-05'), deadline: d('2026-11-08'), // 5 semanas completas
  contents: [{ name: 'Unidad', count: 6 }], reviewWeek: true
};
const running = {
  title: 'Correr 10 km', type: 'fisico', strategy: 'fases',
  startDate: d('2026-10-05'), deadline: d('2026-11-29'), // 8 semanas completas
  sessionsPerWeek: 3
};

// Plan generado "como si estuviera guardado": semanas y tareas con id
function saved(goal) {
  let taskId = 1;
  const weeks = generatePlan(goal).weeks.map(w => ({
    ...w,
    id: w.number * 100,
    tasks: w.tasks.map(t => ({ ...t, id: taskId++, done: false }))
  }));
  return { goal, weeks };
}

const tasksOf = (weeks) => weeks.flatMap(w => w.tasks);

describe('resizePlan · extender', () => {
  it('fases: agrega semanas con la última fase y la cuota semanal', () => {
    const { goal, weeks } = saved(running);
    const ops = resizePlan(goal, weeks, d('2026-12-13')); // +2 semanas completas

    assert.deepEqual(ops.createWeeks.map(w => [w.number, key(w.startDate), key(w.endDate), w.label, w.target]), [
      [9, '2026-11-30', '2026-12-06', 'Evaluación', 3],
      [10, '2026-12-07', '2026-12-13', 'Evaluación', 3]
    ]);
    assert.deepEqual(ops.deleteWeekIds, []);
    assert.deepEqual(ops.updateWeeks, []); // la última era completa: no cambia
    assert.equal(key(ops.milestone.date), '2026-12-13');
  });

  it('fases: la última semana parcial se estira y su cuota crece', () => {
    const { goal, weeks } = saved({ ...running, deadline: d('2026-11-24') }); // última: lun–mar (2 días)
    assert.equal(weeks.at(-1).target, 1);

    const ops = resizePlan(goal, weeks, d('2026-11-29'));
    assert.deepEqual(ops.updateWeeks, [{ id: weeks.at(-1).id, endDate: d('2026-11-29'), target: 3 }]);
    assert.deepEqual(ops.createWeeks, []);
  });

  it('contenido: las semanas nuevas quedan libres y los contenidos no se mueven', () => {
    const { goal, weeks } = saved(algebra);
    const ops = resizePlan(goal, weeks, d('2026-11-18')); // +1 semana y media

    assert.deepEqual(ops.createWeeks.map(w => [w.label, w.target, key(w.endDate)]), [
      [FREE_WEEK_LABEL, 0, '2026-11-15'],
      [FREE_WEEK_LABEL, 0, '2026-11-18']
    ]);
    assert.deepEqual(ops.updateTasks, []);
  });

  it('contenido: los que cubrían la última semana parcial la siguen cubriendo', () => {
    const { goal, weeks } = saved({ ...algebra, deadline: d('2026-11-04'), reviewWeek: false }); // última: lun–mié
    const last = weeks.at(-1);
    const unit = last.tasks.find(t => t.kind === 'tarea');

    const ops = resizePlan(goal, weeks, d('2026-11-08'));
    assert.deepEqual(ops.updateWeeks, [{ id: last.id, endDate: d('2026-11-08') }]); // sin target: es derivada
    assert.deepEqual(ops.updateTasks, [{ id: unit.id, startDate: last.startDate, endDate: d('2026-11-08') }]);
  });
});

describe('resizePlan · acortar', () => {
  it('mueve las tareas de las semanas quitadas a la nueva última semana, conservando done', () => {
    const { goal, weeks } = saved(algebra);
    const unit6 = tasksOf(weeks).find(t => t.title === 'Unidad 6');
    unit6.done = true;

    const ops = resizePlan(goal, weeks, d('2026-10-25')); // se queda con 3 semanas
    const week3 = weeks[2];

    assert.deepEqual(ops.deleteWeekIds, [weeks[3].id, weeks[4].id]);
    const moved = ops.updateTasks.filter(t => t.goalWeekId === week3.id);
    const movedTitles = moved.map(m => tasksOf(weeks).find(t => t.id === m.id).title);
    assert.deepEqual(movedTitles, ['Unidad 6', 'Repaso general']);
    assert.ok(moved.every(m => key(m.startDate) === '2026-10-19' && key(m.endDate) === '2026-10-25'));
    // done no está en la operación: la tarea lo conserva
    assert.ok(moved.every(m => !('done' in m)));
    assert.equal(ops.milestone.id, tasksOf(weeks).find(t => t.kind === 'hito').id);
  });

  it('recorta la nueva última semana y lo que se pasa del plazo', () => {
    const { goal, weeks } = saved(algebra);
    const ops = resizePlan(goal, weeks, d('2026-10-21')); // termina un miércoles de la semana 3
    const week3 = weeks[2];

    assert.deepEqual(ops.updateWeeks, [{ id: week3.id, endDate: d('2026-10-21') }]);
    const inWeek3 = ops.updateTasks.filter(u => week3.tasks.some(t => t.id === u.id));
    assert.ok(inWeek3.length > 0);
    assert.ok(inWeek3.every(u => key(u.endDate) === '2026-10-21'));
    // las movidas desde semanas quitadas cubren la semana recortada
    assert.ok(ops.updateTasks.filter(u => u.goalWeekId).every(u => key(u.endDate) === '2026-10-21'));
  });

  it('fases: la cuota de la semana recortada no supera sus días', () => {
    const { goal, weeks } = saved({ ...running, sessionsPerWeek: 5 });
    const ops = resizePlan(goal, weeks, d('2026-10-20')); // 3ra semana: lun–mar
    assert.deepEqual(ops.updateWeeks, [{ id: weeks[2].id, endDate: d('2026-10-20'), target: 2 }]);
    assert.equal(ops.deleteWeekIds.length, 5);
  });
});

describe('resizePlan · límites', () => {
  it('rechaza más de 52 semanas con PlanError sobre deadline', () => {
    const { goal, weeks } = saved(running);
    assert.throws(() => resizePlan(goal, weeks, d('2028-01-01')), (err) => err instanceof PlanError && err.field === 'deadline');
  });
});
