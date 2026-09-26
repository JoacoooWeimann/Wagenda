import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateOnly, monthRangeUTC } from '../../src/utiles/dates.js';

describe('parseDateOnly', () => {
  it('convierte "YYYY-MM-DD" en medianoche UTC', () => {
    assert.equal(parseDateOnly('2026-09-09').toISOString(), '2026-09-09T00:00:00.000Z');
  });

  it('rechaza formatos que no son YYYY-MM-DD', () => {
    for (const value of ['9/9/2026', '2026-9-9', '2026-09-09T10:00', '', 'hoy']) {
      assert.equal(parseDateOnly(value), null, value);
    }
  });

  it('rechaza fechas imposibles en vez de corregirlas', () => {
    assert.equal(parseDateOnly('2026-02-31'), null);
    assert.equal(parseDateOnly('2026-13-01'), null);
  });

  it('respeta los años bisiestos', () => {
    assert.ok(parseDateOnly('2028-02-29'));
    assert.equal(parseDateOnly('2027-02-29'), null);
  });

  it('rechaza valores que no son string', () => {
    for (const value of [null, undefined, 20260909, {}, new Date()]) {
      assert.equal(parseDateOnly(value), null);
    }
  });
});

describe('monthRangeUTC', () => {
  it('devuelve [primer día del mes, primer día del siguiente)', () => {
    const { start, end } = monthRangeUTC(2026, 9);
    assert.equal(start.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(end.toISOString(), '2026-10-01T00:00:00.000Z');
  });

  it('en diciembre el fin es enero del año siguiente', () => {
    const { end } = monthRangeUTC(2026, 12);
    assert.equal(end.toISOString(), '2027-01-01T00:00:00.000Z');
  });
});
