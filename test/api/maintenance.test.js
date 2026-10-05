import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

describe('mantenimiento', () => {
  it('cleanupExpiredSessions borra solo las vencidas', async () => {
    const { cleanupExpiredSessions } = await import('../../src/utiles/auth/sessions.js');
    const cookie = await ctx.sessionCookie(1); // vigente (más la de reset)
    await ctx.prisma.session.create({ data: { tokenHash: 'vieja', userId: 1, expiresAt: new Date('2020-01-01') } });
    assert.equal(await cleanupExpiredSessions(), 1);
    assert.equal((await ctx.request('GET', '/api/goals', undefined, { cookie })).status, 200);
  });

  it('backupDatabase hace una copia consistente del día, no la repite y borra las viejas', async () => {
    const { backupDatabase } = await import('../../src/utiles/backup.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wagenda-backup-'));
    try {
      await ctx.request('POST', '/api/tasks', { title: 'Respaldada', startDate: '2026-10-05' });
      for (const day of ['01', '02', '03']) fs.writeFileSync(path.join(dir, `wagenda-2026-10-${day}.db`), '');

      const file = await backupDatabase({ dir, keep: 2, now: new Date('2026-10-05T10:00:00Z') });
      assert.equal(path.basename(file), 'wagenda-2026-10-05.db');
      assert.deepEqual(fs.readdirSync(dir).sort(), ['wagenda-2026-10-03.db', 'wagenda-2026-10-05.db']);

      // la copia es una base SQLite válida con los datos
      const { PrismaClient } = await import('@prisma/client');
      const copy = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
      assert.equal(await copy.task.count({ where: { title: 'Respaldada' } }), 1);
      await copy.$disconnect();

      const size = fs.statSync(file).mtimeMs;
      await backupDatabase({ dir, keep: 2, now: new Date('2026-10-05T18:00:00Z') }); // mismo día: no se repite
      assert.equal(fs.statSync(file).mtimeMs, size);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
