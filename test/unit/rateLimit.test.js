import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, retryMessage } from '../../src/utiles/auth/rateLimit.js';

const MIN = 60_000;

describe('límite de intentos', () => {
  it('permite hasta el máximo y bloquea al pasarse, durante el tiempo de bloqueo', () => {
    const limiter = createLimiter({ max: 3, windowMs: 10 * MIN, blockMs: 5 * MIN });
    const t = 1_000_000;
    assert.equal(limiter.hit('ip', t), 0);
    assert.equal(limiter.hit('ip', t + 1), 0);
    assert.equal(limiter.hit('ip', t + 2), 0);
    assert.equal(limiter.hit('ip', t + 3), 300); // 4.º: bloqueado 5 min
    assert.equal(limiter.blockedFor('ip', t + 4 * MIN), 61);
    assert.equal(limiter.blockedFor('ip', t + 6 * MIN), 0);
    assert.equal(limiter.blockedFor('otra', t), 0); // cada clave por su lado
  });

  it('la ventana se reinicia y reset borra los intentos', () => {
    const limiter = createLimiter({ max: 2, windowMs: MIN });
    limiter.hit('u', 0);
    limiter.hit('u', 1);
    assert.equal(limiter.hit('u', MIN + 1), 0); // ventana nueva
    limiter.hit('u', MIN + 2);
    limiter.reset('u');
    assert.equal(limiter.hit('u', MIN + 3), 0);
  });

  it('descarta claves vencidas para no crecer sin límite', () => {
    const limiter = createLimiter({ max: 1, windowMs: MIN, maxKeys: 2 });
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    limiter.hit('c', 2 * MIN); // poda a y b, ya vencidas
    assert.equal(limiter.blockedFor('a', 2 * MIN), 0);
  });

  it('retryMessage', () => {
    assert.equal(retryMessage(30), 'Demasiados intentos. Probá de nuevo en 1 minuto.');
    assert.equal(retryMessage(900), 'Demasiados intentos. Probá de nuevo en 15 minutos.');
  });
});
