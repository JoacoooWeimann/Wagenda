import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeks } from '../../../src/utiles/planning/weeks.js';
import { parseDateOnly, addDays, daysBetween } from '../../../src/utiles/dates.js';

const d = parseDateOnly;
const key = (date) => date.toISOString().slice(0, 10);
const summary = (weeks) => weeks.map(w => `${key(w.startDate)}..${key(w.endDate)}:${w.days}`);

describe('buildWeeks', () => {
  it('semanas completas de lunes a domingo', () => {
    // lunes 5/10/2026 a domingo 8/11/2026 = 5 semanas completas
    const weeks = buildWeeks(d('2026-10-05'), d('2026-11-08'));
    assert.equal(weeks.length, 5);
    assert.ok(weeks.every(w => w.days === 7));
    assert.deepEqual(weeks.map(w => w.number), [1, 2, 3, 4, 5]);
  });

  it('primera y última semana parciales', () => {
    // miércoles 7/10 a martes 20/10
    const weeks = buildWeeks(d('2026-10-07'), d('2026-10-20'));
    assert.deepEqual(summary(weeks), [
      '2026-10-07..2026-10-11:5',
      '2026-10-12..2026-10-18:7',
      '2026-10-19..2026-10-20:2'
    ]);
  });

  it('un solo día', () => {
    assert.deepEqual(summary(buildWeeks(d('2026-10-07'), d('2026-10-07'))), ['2026-10-07..2026-10-07:1']);
  });

  it('cruza de año sin problemas', () => {
    const weeks = buildWeeks(d('2026-12-30'), d('2027-01-05'));
    assert.deepEqual(summary(weeks), ['2026-12-30..2027-01-03:5', '2027-01-04..2027-01-05:2']);
  });

  it('cubre todo el rango sin huecos ni solapamientos (propiedad)', () => {
    const start = d('2026-01-01');
    for (let offset = 0; offset < 7; offset++) {          // cada día de la semana como inicio
      for (let length = 1; length <= 120; length += 7) {  // plazos de 1 día a ~4 meses
        const s = addDays(start, offset);
        const e = addDays(s, length - 1);
        const weeks = buildWeeks(s, e);

        assert.equal(key(weeks[0].startDate), key(s));
        assert.equal(key(weeks.at(-1).endDate), key(e));
        assert.equal(weeks.reduce((a, w) => a + w.days, 0), length);
        weeks.forEach((w, i) => {
          assert.equal(w.days, daysBetween(w.startDate, w.endDate) + 1);
          assert.ok(w.days >= 1 && w.days <= 7);
          if (i > 0) {
            assert.equal(key(w.startDate), key(addDays(weeks[i - 1].endDate, 1)), 'sin huecos');
            assert.equal(w.startDate.getUTCDay(), 1, 'las semanas siguientes empiezan en lunes');
          }
          if (i < weeks.length - 1) assert.equal(w.endDate.getUTCDay(), 0, 'terminan en domingo');
        });
      }
    }
  });

  it('rechaza una fecha límite anterior al inicio', () => {
    assert.throws(() => buildWeeks(d('2026-10-10'), d('2026-10-09')), RangeError);
  });
});
