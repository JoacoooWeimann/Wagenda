import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('config', () => {
  it('trust proxy: 0 fuera de producción salvo que se configure', async () => {
    const { config } = await import('../../src/config.js');
    assert.equal(config.isProduction, false);
    assert.equal(config.trustProxy, process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 0);
    assert.ok(config.backupKeep >= 1);
    assert.match(config.backupDir, /backups$/);
  });
});
