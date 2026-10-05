import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backupsToDelete, backupName } from '../../src/utiles/backup.js';

describe('backups', () => {
  it('backupName lleva la fecha del día', () => {
    assert.equal(backupName(new Date('2026-10-05T15:00:00Z')), 'wagenda-2026-10-05.db');
  });

  it('se queda con los N más nuevos e ignora otros archivos', () => {
    const files = ['wagenda-2026-10-01.db', 'notas.txt', 'wagenda-2026-10-03.db', 'wagenda-2026-10-02.db', 'wagenda-2026-10-04.db'];
    assert.deepEqual(backupsToDelete(files, 2), ['wagenda-2026-10-02.db', 'wagenda-2026-10-01.db']);
    assert.deepEqual(backupsToDelete(files, 10), []);
  });
});
