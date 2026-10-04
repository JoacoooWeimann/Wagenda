import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shiftDay, dayTitle, relativeLabel, parseDateParam, monthOf } from '../../src/client/utiles/calendar.js';
import { sessionGoalsFor } from '../../src/client/utiles/tasks.js';

describe('navegación por días', () => {
  it('shiftDay cruza meses, años y años bisiestos', () => {
    assert.equal(shiftDay('2026-10-04', 1), '2026-10-05');
    assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
    assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
    assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
    assert.equal(shiftDay('2026-02-28', 1), '2026-03-01');
    assert.equal(shiftDay('2026-03-29', 1), '2026-03-30'); // cambio de horario en Europa: no influye
  });

  it('dayTitle', () => {
    assert.equal(dayTitle('2026-10-04'), 'Domingo 4 de octubre');
    assert.equal(dayTitle('2026-12-31'), 'Jueves 31 de diciembre');
  });

  it('relativeLabel', () => {
    assert.equal(relativeLabel('2026-10-04', '2026-10-04'), 'Hoy');
    assert.equal(relativeLabel('2026-10-05', '2026-10-04'), 'Mañana');
    assert.equal(relativeLabel('2026-10-03', '2026-10-04'), 'Ayer');
    assert.equal(relativeLabel('2026-10-10', '2026-10-04'), null);
  });

  it('parseDateParam acepta solo fechas reales', () => {
    assert.equal(parseDateParam('2026-10-04'), '2026-10-04');
    for (const bad of ['2026-02-31', '2026-13-01', '4/10/2026', '', null, undefined]) {
      assert.equal(parseDateParam(bad), null, String(bad));
    }
  });

  it('monthOf', () => {
    assert.deepEqual(monthOf('2026-10-04'), { year: 2026, month: 10 });
  });
});

describe('sessionGoalsFor', () => {
  const iso = (k) => `${k}T00:00:00.000Z`;
  const goal = (extra) => ({ id: 1, strategy: 'fases', status: 'activo', startDate: iso('2026-10-01'), deadline: iso('2026-10-31'), ...extra });

  it('solo objetivos por fases, abiertos, en plazo y no en el futuro', () => {
    const goals = [goal({ id: 1 }), goal({ id: 2, strategy: 'divisible' }), goal({ id: 3, status: 'logrado' }), goal({ id: 4, startDate: iso('2026-10-10') })];
    assert.deepEqual(sessionGoalsFor(goals, '2026-10-05', '2026-10-06').map(g => g.id), [1]);
    assert.deepEqual(sessionGoalsFor(goals, '2026-10-07', '2026-10-06'), []); // futuro
  });
});
