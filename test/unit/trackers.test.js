import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTrackerCreate, validateTrackerUpdate, validateItemCreate, validateItemUpdate, validateEntry
} from '../../src/utiles/validation/trackers.js';
import { trackerSummary } from '../../src/utiles/trackers.js';

describe('validateTrackerCreate / validateTrackerUpdate', () => {
  it('nombre obligatorio al crear; descripción y etiqueta de ítems opcionales', () => {
    const { data, fields } = validateTrackerCreate({ name: ' Gimnasio ', description: '', itemLabel: 'Ejercicio' });
    assert.deepEqual(fields, {});
    assert.deepEqual(data, { name: 'Gimnasio', description: null, itemLabel: 'Ejercicio' });
    assert.ok(validateTrackerCreate({}).fields.name);
    assert.ok(validateTrackerCreate({ name: 'x'.repeat(41) }).fields.name);
    assert.ok(validateTrackerCreate({ name: 'a', itemLabel: 'x'.repeat(21) }).fields.itemLabel);
  });

  it('al editar, solo lo que viene', () => {
    assert.deepEqual(validateTrackerUpdate({ itemLabel: 'Materia' }).data, { itemLabel: 'Materia' });
    assert.ok(validateTrackerUpdate({}).error);
  });
});

describe('validateItemCreate / validateItemUpdate', () => {
  it('acepta nombre, tipo, unidad y "mejor es"', () => {
    const { data, fields } = validateItemCreate({ name: ' Press banca ', kind: 'medicion', unit: 'kg', higherIsBetter: true });
    assert.deepEqual(fields, {});
    assert.deepEqual(data, { name: 'Press banca', kind: 'medicion', unit: 'kg', higherIsBetter: true });
  });

  it('rechaza tipos, unidades largas y booleanos que no lo son', () => {
    assert.ok(validateItemCreate({}).fields.name);
    assert.ok(validateItemCreate({ name: 'a', kind: 'otro' }).fields.kind);
    assert.ok(validateItemCreate({ name: 'a', unit: 'x'.repeat(11) }).fields.unit);
    assert.ok(validateItemCreate({ name: 'a', higherIsBetter: 1 }).fields.higherIsBetter);
  });

  it('al editar se puede pasar a otro seguimiento; al crear, el seguimiento sale de la URL', () => {
    assert.deepEqual(validateItemUpdate({ trackerId: 4 }).data, { trackerId: 4 });
    assert.ok(validateItemUpdate({ trackerId: null }).fields.trackerId);
    assert.equal('trackerId' in validateItemCreate({ name: 'a', trackerId: 4 }).data, false);
    assert.ok(validateItemUpdate({}).error);
  });
});

describe('validateEntry', () => {
  it('fecha y valor obligatorios; nota opcional', () => {
    const { data, fields } = validateEntry({ date: '2026-10-05', value: 82.5, note: ' ok ' });
    assert.deepEqual(fields, {});
    assert.equal(data.value, 82.5);
    assert.equal(data.note, 'ok');
    assert.ok(validateEntry({ date: '2026-10-05' }).fields.value);
  });

  it('el valor tiene que ser un número finito', () => {
    for (const value of ['80', NaN, Infinity, 1e10, true]) {
      assert.ok(validateEntry({ date: '2026-10-05', value }).fields.value, String(value));
    }
  });

  it('en una sesión el valor es opcional', () => {
    const { data, fields } = validateEntry({ date: '2026-10-05' }, { valueRequired: false });
    assert.deepEqual(fields, {});
    assert.equal(data.value, undefined);
  });
});

describe('trackerSummary', () => {
  const entries = [
    { value: 80, date: 'd1' }, { value: 85, date: 'd2' }, { value: 85, date: 'd3' }, { value: 83, date: 'd4' }
  ];

  it('último, mejor marca (la primera vez que se logró) y variación', () => {
    assert.deepEqual(trackerSummary(entries, true), {
      count: 4, last: { value: 83, date: 'd4' }, best: { value: 85, date: 'd2' }, change: 3
    });
  });

  it('con higherIsBetter false la mejor es la menor', () => {
    assert.deepEqual(trackerSummary(entries, false).best, { value: 80, date: 'd1' });
  });

  it('sin registros', () => {
    assert.deepEqual(trackerSummary([], true), { count: 0, last: null, best: null, change: null });
  });
});

describe('cappedActivityTotal', () => {
  it('suma por semana (lunes a domingo) con el tope del grupo', async () => {
    const { cappedActivityTotal } = await import('../../src/utiles/trackers.js');
    const at = (k, count) => ({ date: new Date(`${k}T00:00:00Z`), count });
    const activity = [at('2026-10-05', 2), at('2026-10-11', 2), at('2026-10-12', 1)]; // semana 1: 4, semana 2: 1
    assert.equal(cappedActivityTotal(activity, null), 5);
    assert.equal(cappedActivityTotal(activity, 3), 4);
    assert.equal(cappedActivityTotal([], 3), 0);
  });
});
