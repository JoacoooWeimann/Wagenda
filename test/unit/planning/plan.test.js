import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, PlanError, MAX_WEEKS } from '../../../src/utiles/planning/index.js';
import { pluralize } from '../../../src/utiles/planning/strategies.js';
import { PHASE_TEMPLATES, DEFAULT_STRATEGY, TYPE_LABELS } from '../../../src/utiles/planning/templates.js';
import { parseDateOnly } from '../../../src/utiles/dates.js';

const d = parseDateOnly;
const key = (date) => date.toISOString().slice(0, 10);
const weekday = (date) => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][date.getUTCDay()];

const algebra = (extra = {}) => ({
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: d('2026-10-05'), deadline: d('2026-11-08'), // 5 semanas completas
  totalUnits: 6, unitName: 'Unidad', reviewWeek: true, ...extra
});

const running = (extra = {}) => ({
  title: 'Correr 10 km', type: 'fisico', strategy: 'fases',
  startDate: d('2026-10-05'), deadline: d('2026-11-29'), // 8 semanas completas
  sessionsPerWeek: 3, ...extra
});

// Tareas del plan que no son la marca de fecha límite
const workTasks = (week) => week.tasks.filter(t => !t.title.startsWith('Fecha límite'));

describe('estrategia divisible', () => {
  it('con repaso: 6 unidades en 4 semanas + semana de repaso', () => {
    const { weeks } = generatePlan(algebra());
    assert.deepEqual(weeks.map(w => w.label),
      ['Unidades 1–2', 'Unidad 3', 'Unidades 4–5', 'Unidad 6', 'Repaso']);
    assert.deepEqual(workTasks(weeks[4]).map(t => t.title), ['Repaso general']);
  });

  it('sin repaso: el reparto usa las 5 semanas', () => {
    const { weeks } = generatePlan(algebra({ reviewWeek: false }));
    assert.deepEqual(weeks.map(w => workTasks(w).length), [1, 1, 2, 1, 1]);
  });

  it('cada unidad es una tarea que ocupa toda su semana, en orden', () => {
    const { weeks } = generatePlan(algebra());
    const units = weeks.slice(0, -1).flatMap(w => w.tasks.map(t => ({ t, w })));
    assert.deepEqual(units.map(({ t }) => t.title), [1, 2, 3, 4, 5, 6].map(n => `Unidad ${n}`));
    for (const { t, w } of units) {
      assert.equal(key(t.startDate), key(w.startDate));
      assert.equal(key(t.endDate), key(w.endDate));
    }
  });

  it('con menos de 3 semanas no reserva repaso', () => {
    const { weeks } = generatePlan(algebra({ deadline: d('2026-10-18'), totalUnits: 2 }));
    assert.deepEqual(weeks.map(w => w.label), ['Unidad 1', 'Unidad 2']);
  });

  it('las semanas sin unidades nuevas llevan una tarea de refuerzo', () => {
    const { weeks } = generatePlan(algebra({ totalUnits: 2, reviewWeek: false }));
    // 2 unidades en 5 semanas -> [0,1,0,1,0]
    assert.deepEqual(weeks.map(w => w.label), ['Preparación', 'Unidad 1', 'Refuerzo', 'Unidad 2', 'Refuerzo']);
    assert.ok(weeks.every(w => w.tasks.length >= 1));
  });

  it('usa el nombre de unidad en singular y plural', () => {
    assert.equal(pluralize('Unidad'), 'Unidades');
    assert.equal(pluralize('Capítulo'), 'Capítulos');
    assert.equal(pluralize('Nivel'), 'Niveles');
    assert.equal(pluralize('Lección'), 'Lecciones');
    const { weeks } = generatePlan(algebra({ unitName: 'Capítulo' }));
    assert.equal(weeks[0].label, 'Capítulos 1–2');
  });
});

describe('estrategia fases', () => {
  it('8 semanas: apertura y cierre de 1 semana, el medio repartido', () => {
    const { weeks } = generatePlan(running());
    assert.deepEqual(weeks.map(w => w.label), [
      'Diagnóstico', 'Consistencia', 'Consistencia', 'Consistencia',
      'Intensidad', 'Intensidad', 'Intensidad', 'Evaluación'
    ]);
  });

  it('3 sesiones por semana completa caen martes, jueves y sábado', () => {
    const { weeks } = generatePlan(running());
    const days = workTasks(weeks[1]).map(t => weekday(t.startDate));
    assert.deepEqual(days, ['mar', 'jue', 'sáb']);
    assert.deepEqual(workTasks(weeks[1]).map(t => t.title),
      ['Consistencia · sesión 1/3', 'Consistencia · sesión 2/3', 'Consistencia · sesión 3/3']);
  });

  it('las sesiones son de un día y llevan la descripción de la fase', () => {
    const { weeks } = generatePlan(running());
    for (const t of workTasks(weeks[0])) {
      assert.equal(key(t.startDate), key(t.endDate));
      assert.equal(t.description, PHASE_TEMPLATES.fisico[0].description);
    }
  });

  it('las semanas parciales tienen menos sesiones (al menos 1)', () => {
    // sábado 10/10 a jueves 5/11: primera semana de 2 días, última de 4
    const { weeks } = generatePlan(running({ startDate: d('2026-10-10'), deadline: d('2026-11-05') }));
    assert.equal(workTasks(weeks[0]).length, 1);
    assert.equal(workTasks(weeks.at(-1)).length, 2);
  });

  it('con menos de 4 semanas lanza PlanError sobre deadline', () => {
    assert.throws(
      () => generatePlan(running({ deadline: d('2026-10-25') })),
      (err) => err instanceof PlanError && err.field === 'deadline'
    );
  });

  it('funciona para todos los tipos', () => {
    for (const type of Object.keys(TYPE_LABELS)) {
      const { weeks } = generatePlan(running({ type }));
      assert.equal(weeks[0].label, PHASE_TEMPLATES[type][0].name);
      assert.equal(weeks.at(-1).label, PHASE_TEMPLATES[type][3].name);
    }
  });
});

describe('generatePlan: invariantes', () => {
  const configs = [
    algebra(), algebra({ reviewWeek: false }), algebra({ totalUnits: 1 }), algebra({ totalUnits: 40 }),
    algebra({ startDate: d('2026-10-07'), deadline: d('2026-10-07'), totalUnits: 3 }),
    running(), running({ sessionsPerWeek: 7 }), running({ sessionsPerWeek: 1 }),
    running({ startDate: d('2026-10-10'), deadline: d('2027-03-02'), type: 'videojuego' })
  ];

  for (const goal of configs) {
    it(`${goal.strategy} ${key(goal.startDate)}→${key(goal.deadline)}`, () => {
      const { weeks } = generatePlan(goal);
      const all = weeks.flatMap(w => w.tasks);

      // Todas las tareas caen dentro de su semana (y por lo tanto dentro del plazo)
      for (const w of weeks) {
        for (const t of w.tasks) {
          assert.ok(t.startDate >= w.startDate && t.endDate <= w.endDate, t.title);
          assert.ok(t.startDate <= t.endDate, t.title);
          assert.ok(t.title.length <= 100);
          assert.equal(t.category, TYPE_LABELS[goal.type]);
        }
      }

      // Exactamente una marca de fecha límite, en la última semana, prioridad alta
      const deadlineTasks = all.filter(t => t.title.startsWith('Fecha límite'));
      assert.equal(deadlineTasks.length, 1);
      assert.equal(deadlineTasks[0].priority, 'alta');
      assert.equal(key(deadlineTasks[0].startDate), key(goal.deadline));
      assert.ok(weeks.at(-1).tasks.includes(deadlineTasks[0]));

      // En divisible, cada unidad aparece exactamente una vez
      if (goal.strategy === 'divisible') {
        const units = all.filter(t => t.title.startsWith(`${goal.unitName} `)).map(t => t.title);
        assert.equal(units.length, goal.totalUnits);
        assert.equal(new Set(units).size, goal.totalUnits);
      }
    });
  }

  it(`rechaza plazos de más de ${MAX_WEEKS} semanas`, () => {
    assert.throws(() => generatePlan(algebra({ deadline: d('2028-01-01') })), PlanError);
  });

  it('un título largo no genera tareas de más de 100 caracteres', () => {
    const { weeks } = generatePlan(algebra({ title: 'x'.repeat(100) }));
    assert.ok(weeks.flatMap(w => w.tasks).every(t => t.title.length <= 100));
  });
});

describe('plantillas', () => {
  it('cada tipo tiene 4 fases y una estrategia sugerida', () => {
    for (const type of Object.keys(TYPE_LABELS)) {
      assert.equal(PHASE_TEMPLATES[type].length, 4, type);
      assert.ok(['divisible', 'fases'].includes(DEFAULT_STRATEGY[type]), type);
    }
  });
});
