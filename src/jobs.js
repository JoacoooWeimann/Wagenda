// Tareas periódicas del servidor. Las arranca index.js (no corren en los
// tests, que levantan solo la app). Devuelve una función para detenerlas en el
// apagado. Los errores se registran pero no tiran el servidor.
import { config } from './config.js';
import { cleanupExpiredSessions } from './utiles/auth/sessions.js';
import { backupDatabase } from './utiles/backup.js';

const HOUR = 60 * 60 * 1000;

async function run(name, fn) {
  try {
    const result = await fn();
    console.log(`[${name}] ${result}`);
  } catch (err) {
    console.error(`[${name}] falló:`, err);
  }
}

const jobs = [
  // Sesiones vencidas: cada 6 h
  { name: 'sesiones', every: 6 * HOUR, fn: async () => `${await cleanupExpiredSessions()} vencidas borradas` },
  // Backup: al arrancar y cada hora se asegura de que exista el del día (si ya
  // está, no hace nada): así no depende de que el servidor esté prendido a una hora fija
  {
    name: 'backup',
    every: HOUR,
    fn: async () => `ok: ${await backupDatabase({ dir: config.backupDir, keep: config.backupKeep })}`
  }
];

export function startJobs() {
  const timers = jobs.map(job => {
    run(job.name, job.fn);
    const timer = setInterval(() => run(job.name, job.fn), job.every);
    timer.unref(); // no impide que el proceso termine
    return timer;
  });
  return () => timers.forEach(clearInterval);
}
