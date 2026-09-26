import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distribute } from '../../../src/utiles/planning/distribute.js';

// Combinaciones de pesos variadas: iguales, crecientes, con ceros, semanas parciales
const WEIGHT_SETS = [
  [1], [1, 1], [7, 7, 7, 7, 7], [5, 7, 7, 7, 2], [1, 3, 3, 1], [0, 2, 2, 0],
  [1, 0, 0, 1], [3, 1, 4, 1, 5, 9, 2, 6], [1, 1, 1, 1, 1, 1, 1], [0.5, 1.5, 2]
];

describe('distribute: propiedades', () => {
  for (const weights of WEIGHT_SETS) {
    it(`pesos [${weights}] con totales de 0 a 40`, () => {
      const sum = weights.reduce((a, b) => a + b, 0);
      for (let total = 0; total <= 40; total++) {
        const result = distribute(total, weights);
        const msg = `total ${total} -> [${result}]`;

        assert.equal(result.length, weights.length, msg);
        assert.equal(result.reduce((a, b) => a + b, 0), total, `suma exacta: ${msg}`);
        assert.ok(result.every(n => Number.isInteger(n) && n >= 0), `sin negativos: ${msg}`);

        // El acumulado nunca se aleja más de 0,5 del reparto ideal proporcional
        let acc = 0, accWeight = 0;
        result.forEach((n, i) => {
          acc += n;
          accWeight += weights[i];
          const ideal = (total * accWeight) / sum;
          assert.ok(Math.abs(acc - ideal) <= 0.5 + 1e-9, `desvío en ${i}: ${msg}`);
        });

        // Un casillero con peso 0 nunca recibe nada
        weights.forEach((w, i) => { if (w === 0) assert.equal(result[i], 0, msg); });
      }
    });
  }
});

describe('distribute: casos del diseño', () => {
  it('reparte parejo en vez de amontonar al principio', () => {
    assert.deepEqual(distribute(6, [7, 7, 7, 7, 7]), [1, 1, 2, 1, 1]);
    assert.deepEqual(distribute(3, [1, 1, 1, 1, 1]), [1, 0, 1, 0, 1]);
  });

  it('las semanas parciales reciben menos', () => {
    assert.deepEqual(distribute(6, [5, 7, 7, 7, 2]), [1, 2, 1, 2, 0]);
  });

  it('3 sesiones en 7 días quedan separadas por descansos', () => {
    assert.deepEqual(distribute(3, [1, 1, 1, 1, 1, 1, 1]), [0, 1, 0, 1, 0, 1, 0]);
  });

  it('es determinista', () => {
    assert.deepEqual(distribute(17, [3, 1, 4, 1, 5]), distribute(17, [3, 1, 4, 1, 5]));
  });
});

describe('distribute: entradas inválidas', () => {
  it('rechaza totales negativos o no enteros y pesos negativos', () => {
    assert.throws(() => distribute(-1, [1]), RangeError);
    assert.throws(() => distribute(1.5, [1]), RangeError);
    assert.throws(() => distribute(3, [1, -1]), RangeError);
    assert.throws(() => distribute(3, [1, NaN]), RangeError);
  });

  it('con todos los pesos en 0 solo acepta total 0', () => {
    assert.deepEqual(distribute(0, [0, 0]), [0, 0]);
    assert.throws(() => distribute(2, [0, 0]), RangeError);
  });
});
