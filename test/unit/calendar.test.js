import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { toDateKey, buildCalendar } from '../../src/client/utiles/calendar.js';
import { dayInRange, sortForDay, isMultiDay, shortDate, highestPriority } from '../../src/client/utiles/tasks.js';

// Así llegan las fechas desde la API: medianoche UTC
const task = (start, end, extra = {}) => ({
  startDate: `${start}T00:00:00.000Z`,
  endDate: `${end}T00:00:00.000Z`,
  ...extra
});

describe('buildCalendar', () => {
  it('arranca la grilla en lunes y completa semanas de 7 días', () => {
    // Septiembre 2026 empieza un martes y tiene 30 días
    const { weeks } = buildCalendar(2026, 9);
    assert.equal(weeks.length, 5);
    assert.ok(weeks.every(w => w.length === 7));
    assert.equal(weeks[0][0], null);         // lunes vacío
    assert.equal(weeks[0][1].day, 1);        // martes 1
    assert.equal(weeks[4][2].day, 30);       // miércoles 30
    assert.equal(weeks[4][3], null);
  });

  it('un mes que empieza en domingo ocupa 6 semanas', () => {
    // Febrero 2026 empieza en domingo
    const { weeks } = buildCalendar(2026, 2);
    assert.equal(weeks[0][6].day, 1);
    assert.equal(weeks.flat().filter(Boolean).length, 28);
  });
});

describe('toDateKey', () => {
  it('rellena mes y día con ceros', () => {
    assert.equal(toDateKey(2026, 9, 5), '2026-09-05');
    assert.equal(toDateKey(2026, 12, 31), '2026-12-31');
  });
});

// Regresión del bug de v1.1: en UTC-3 las tareas de un día no se veían y los
// rangos perdían el último día. Node permite cambiar process.env.TZ en ejecución.
describe('dayInRange no depende de la zona horaria', () => {
  const originalTZ = process.env.TZ;
  after(() => { process.env.TZ = originalTZ; });

  for (const tz of ['UTC', 'America/Argentina/Buenos_Aires', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`en ${tz}`, () => {
      process.env.TZ = tz;

      const single = task('2026-09-09', '2026-09-09');
      assert.equal(dayInRange(2026, 9, 9, single), true, 'tarea de un día');
      assert.equal(dayInRange(2026, 9, 8, single), false);
      assert.equal(dayInRange(2026, 9, 10, single), false);

      const range = task('2026-09-09', '2026-09-12');
      const visibles = [8, 9, 10, 11, 12, 13].filter(d => dayInRange(2026, 9, d, range));
      assert.deepEqual(visibles, [9, 10, 11, 12]);
    });
  }

  it('un rango que cruza de mes aparece en los dos', () => {
    const cross = task('2026-09-30', '2026-10-01');
    assert.equal(dayInRange(2026, 9, 30, cross), true);
    assert.equal(dayInRange(2026, 10, 1, cross), true);
  });
});

describe('sortForDay', () => {
  it('pendientes primero y luego de mayor a menor prioridad', () => {
    const tasks = [
      { id: 1, done: true, priority: 'alta' },
      { id: 2, done: false, priority: 'baja' },
      { id: 3, done: false, priority: 'alta' },
      { id: 4, done: false, priority: 'normal' }
    ];
    assert.deepEqual(sortForDay(tasks).map(t => t.id), [3, 4, 2, 1]);
  });

  it('en empates conserva el orden original (sort estable) y no muta el array', () => {
    const tasks = [
      { id: 1, done: false, priority: 'normal' },
      { id: 2, done: false, priority: 'normal' }
    ];
    assert.deepEqual(sortForDay(tasks).map(t => t.id), [1, 2]);
    assert.notEqual(sortForDay(tasks), tasks);
  });
});

describe('helpers de presentación', () => {
  it('isMultiDay y shortDate', () => {
    assert.equal(isMultiDay(task('2026-09-09', '2026-09-09')), false);
    assert.equal(isMultiDay(task('2026-09-09', '2026-09-12')), true);
    assert.equal(shortDate('2026-09-09T00:00:00.000Z'), '9/9');
  });

  it('highestPriority', () => {
    assert.equal(highestPriority([]), null);
    assert.equal(highestPriority([{ priority: 'baja' }, { priority: 'alta' }]), 'alta');
    assert.equal(highestPriority([{ priority: 'baja' }]), 'baja');
  });
});

describe('sortForDay con horarios', () => {
  it('pendientes primero; dentro, por hora (las sin horario al final) y por prioridad', async () => {
    const { sortForDay } = await import('../../src/client/utiles/tasks.js');
    const t = (id, extra) => ({ id, done: false, priority: 'normal', startMinute: null, ...extra });
    const sorted = sortForDay([
      t(1, { priority: 'alta' }), t(2, { startMinute: 1020 }), t(3, { startMinute: 540 }), t(4, { done: true, startMinute: 300 })
    ]);
    assert.deepEqual(sorted.map(x => x.id), [3, 2, 1, 4]);
  });
});
