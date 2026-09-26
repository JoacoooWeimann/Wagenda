import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoalCreate, validateWeekUpdate } from '../../src/utiles/validation/goals.js';

const divisible = (extra = {}) => ({
  title: 'Álgebra', type: 'academico', strategy: 'divisible',
  startDate: '2026-10-05', deadline: '2026-11-08', contents: [{ name: 'Unidad', count: 6 }], ...extra
});
const fases = (extra = {}) => ({
  title: 'Correr 10 km', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-29', sessionsPerWeek: 3, ...extra
});

describe('validateGoalCreate', () => {
  it('acepta un objetivo divisible y aplica defaults', () => {
    const { data, fields } = validateGoalCreate(divisible());
    assert.deepEqual(fields, {});
    assert.deepEqual(data.contents, [{ name: 'Unidad', count: 6 }]);
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
    assert.ok(validateGoalCreate(divisible({ contents: undefined })).fields.contents);
    assert.ok(validateGoalCreate(fases({ sessionsPerWeek: undefined })).fields.sessionsPerWeek);
  });

  it('valida los rangos de los parámetros', () => {
    for (const count of [0, 101, 2.5, '6']) {
      assert.ok(validateGoalCreate(divisible({ contents: [{ name: 'Unidad', count }] })).fields.contents, String(count));
    }
    for (const sessionsPerWeek of [0, 8, '3']) {
      assert.ok(validateGoalCreate(fases({ sessionsPerWeek })).fields.sessionsPerWeek, String(sessionsPerWeek));
    }
  });

  it('ignora los parámetros de la otra estrategia (whitelist)', () => {
    const { data } = validateGoalCreate(divisible({ sessionsPerWeek: 3, userId: 9 }));
    assert.equal('sessionsPerWeek' in data, false);
    assert.equal('userId' in data, false);
    const { data: data2 } = validateGoalCreate(fases({ contents: [{ name: 'x', count: 1 }], reviewWeek: false }));
    assert.equal('contents' in data2, false);
    assert.equal('reviewWeek' in data2, false);
  });

  it('rechaza tipo, estrategia y fechas inválidas, todo junto', () => {
    const { fields } = validateGoalCreate({ title: '', type: 'x', strategy: 'y', startDate: 'mal', deadline: '2026-02-31' });
    assert.deepEqual(Object.keys(fields).sort(), ['deadline', 'startDate', 'strategy', 'title', 'type']);
  });

  it('la fecha límite no puede ser anterior al inicio', () => {
    assert.ok(validateGoalCreate(divisible({ deadline: '2026-10-01' })).fields.deadline);
  });

  it('contents: recorta nombres, exige nombre, limita tipos y rechaza repetidos', () => {
    const ok = validateGoalCreate(divisible({ contents: [{ name: ' Unidad ', count: 6 }, { name: 'TP', count: 4 }] }));
    assert.deepEqual(ok.data.contents, [{ name: 'Unidad', count: 6 }, { name: 'TP', count: 4 }]);

    assert.match(validateGoalCreate(divisible({ contents: [{ name: 'A', count: 1 }, { name: ' ', count: 2 }] })).fields.contents, /Contenido 2/);
    assert.ok(validateGoalCreate(divisible({ contents: [] })).fields.contents);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `T${i}`, count: 1 }));
    assert.match(validateGoalCreate(divisible({ contents: six })).fields.contents, /Máximo 5/);
    assert.match(validateGoalCreate(divisible({ contents: [{ name: 'TP', count: 1 }, { name: 'tp', count: 2 }] })).fields.contents, /mismo nombre/);
  });

  it('reviewWeek tiene que ser booleano', () => {
    assert.ok(validateGoalCreate(divisible({ reviewWeek: 'no' })).fields.reviewWeek);
  });
});

describe('validateWeekUpdate', () => {
  it('etiqueta y cuota en fases; applyToPhase opcional', () => {
    const r = validateWeekUpdate({ label: ' Base ', target: 0, applyToPhase: true }, 'fases');
    assert.deepEqual(r.fields, {});
    assert.deepEqual(r.data, { label: 'Base', target: 0 });
    assert.equal(r.applyToPhase, true);
  });

  it('la cuota no se acepta en divisible', () => {
    assert.ok(validateWeekUpdate({ target: 2 }, 'divisible').fields.target);
  });

  it('rechaza cuotas fuera de 0-14, etiquetas vacías y cuerpo vacío', () => {
    assert.ok(validateWeekUpdate({ target: -1 }, 'fases').fields.target);
    assert.ok(validateWeekUpdate({ target: 15 }, 'fases').fields.target);
    assert.ok(validateWeekUpdate({ label: '' }, 'fases').fields.label);
    assert.ok(validateWeekUpdate({ label: 'x'.repeat(51) }, 'fases').fields.label);
    assert.ok(validateWeekUpdate({}, 'fases').error);
    assert.ok(validateWeekUpdate({ applyToPhase: 'si', label: 'x' }, 'fases').fields.applyToPhase);
  });
});
