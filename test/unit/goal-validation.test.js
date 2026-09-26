import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoalCreate } from '../../src/utiles/validation/goals.js';

const divisible = (extra = {}) => ({
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: '2026-10-05', deadline: '2026-11-08', totalUnits: 6, ...extra
});
const fases = (extra = {}) => ({
  title: 'Correr 10 km', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-29', sessionsPerWeek: 3, ...extra
});

describe('validateGoalCreate', () => {
  it('acepta un objetivo divisible y aplica defaults', () => {
    const { data, fields } = validateGoalCreate(divisible());
    assert.deepEqual(fields, {});
    assert.equal(data.unitName, 'Unidad');
    assert.equal(data.reviewWeek, true);
    assert.equal(data.startDate.toISOString(), '2026-10-05T00:00:00.000Z');
  });

  it('acepta un objetivo por fases', () => {
    const { data, fields } = validateGoalCreate(fases());
    assert.deepEqual(fields, {});
    assert.equal(data.sessionsPerWeek, 3);
  });

  it('sin estrategia usa la sugerida para el tipo', () => {
    const { strategy, ...rest } = fases();
    assert.equal(validateGoalCreate(rest).data.strategy, 'fases');
    const { strategy: _, ...rest2 } = divisible();
    assert.equal(validateGoalCreate(rest2).data.strategy, 'divisible');
  });

  it('exige los parámetros de la estrategia elegida', () => {
    assert.ok(validateGoalCreate(divisible({ totalUnits: undefined })).fields.totalUnits);
    assert.ok(validateGoalCreate(fases({ sessionsPerWeek: undefined })).fields.sessionsPerWeek);
  });

  it('valida los rangos de los parámetros', () => {
    for (const totalUnits of [0, 101, 2.5, '6']) {
      assert.ok(validateGoalCreate(divisible({ totalUnits })).fields.totalUnits, String(totalUnits));
    }
    for (const sessionsPerWeek of [0, 8, '3']) {
      assert.ok(validateGoalCreate(fases({ sessionsPerWeek })).fields.sessionsPerWeek, String(sessionsPerWeek));
    }
  });

  it('ignora los parámetros de la otra estrategia (whitelist)', () => {
    const { data } = validateGoalCreate(divisible({ sessionsPerWeek: 3, userId: 9 }));
    assert.equal('sessionsPerWeek' in data, false);
    assert.equal('userId' in data, false);
    const { data: data2 } = validateGoalCreate(fases({ totalUnits: 6, reviewWeek: false }));
    assert.equal('totalUnits' in data2, false);
    assert.equal('reviewWeek' in data2, false);
  });

  it('rechaza tipo, estrategia y fechas inválidas, todo junto', () => {
    const { fields } = validateGoalCreate({ title: '', type: 'x', strategy: 'y', startDate: 'mal', deadline: '2026-02-31' });
    assert.deepEqual(Object.keys(fields).sort(), ['deadline', 'startDate', 'strategy', 'title', 'type']);
  });

  it('la fecha límite no puede ser anterior al inicio', () => {
    assert.ok(validateGoalCreate(divisible({ deadline: '2026-10-01' })).fields.deadline);
  });

  it('unitName vacío usa "Unidad"; reviewWeek tiene que ser booleano', () => {
    assert.equal(validateGoalCreate(divisible({ unitName: '  ' })).data.unitName, 'Unidad');
    assert.equal(validateGoalCreate(divisible({ unitName: ' Capítulo ' })).data.unitName, 'Capítulo');
    assert.ok(validateGoalCreate(divisible({ reviewWeek: 'no' })).fields.reviewWeek);
  });
});
