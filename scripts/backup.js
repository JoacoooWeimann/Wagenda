// Backup manual: npm run backup (mismo mecanismo que el diario)
import { config, checkConfig } from '../src/config.js';
import { backupDatabase } from '../src/utiles/backup.js';
import prisma from '../src/utiles/db.js';

checkConfig();
const file = await backupDatabase({ dir: config.backupDir, keep: config.backupKeep });
console.log(`Backup listo: ${file}`);
await prisma.$disconnect();
