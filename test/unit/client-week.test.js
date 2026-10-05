import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gridPosition, gridHours, durationText, GRID, timeRange, minutesToTime, weekGrid } from '../../src/client/utiles/week.js';

describe('grilla de Mi semana (cliente)', () => {
  it('gridPosition: porcentajes dentro de 6–24 y recorte de lo que queda afuera', () => {
    assert.deepEqual(gridPosition({ startMinute: 6 * 60, endMinute: 15 * 60 }), { top: 0, height: 50 });
    assert.deepEqual(gridPosition({ startMinute: 15 * 60, endMinute: 24 * 60 }), { top: 50, height: 50 });
    assert.deepEqual(gridPosition({ startMinute: 0, endMinute: 6 * 60 }), { top: 0, height: 0 }); // antes de las 6
    assert.deepEqual(gridPosition({ startMinute: 60, endMinute: 120 }, { startMinute: 0, endMinute: 240 }), { top: 25, height: 25 });
  });

  it('weekGrid: arranca a la hora más temprana que se use, nunca después de las 6', () => {
    const windows = [{ startMinute: 480 }, { startMinute: 300 }]; // 08:00 y 05:00
    assert.deepEqual(weekGrid(windows, []), { startMinute: 300, endMinute: 1440 });
    assert.deepEqual(weekGrid([{ startMinute: 480 }], [{ startMinute: 0 }]), { startMinute: 0, endMinute: 1440 });
    assert.deepEqual(weekGrid([{ startMinute: 480 }], [{ startMinute: 330 }]), { startMinute: 300, endMinute: 1440 }); // 5:30 -> 5:00
    assert.deepEqual(weekGrid([{ startMinute: 480 }], []), GRID);
  });

  it('gridHours, durationText y timeRange', () => {
    assert.deepEqual(gridHours(GRID).slice(0, 3), [6, 7, 8]);
    assert.equal(gridHours(GRID).length, 18);
    assert.equal(durationText(90), '1 h 30 min');
    assert.equal(durationText(60), '1 h');
    assert.equal(durationText(45), '45 min');
    assert.equal(timeRange({ startMinute: 540, endMinute: 1020 }, minutesToTime), '09:00–17:00');
  });
});
