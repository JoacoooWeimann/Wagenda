// Configuración leída del entorno, en un solo lugar. En producción (Railway)
// todo viene de variables de entorno; en desarrollo, de .env (dotenv no pisa
// las variables que ya estén definidas, así que los tests y Railway mandan).
import 'dotenv/config';
import path from 'node:path';

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

// Carpeta de los backups: la que se configure o, por defecto, una carpeta
// "backups" junto al archivo de la base (en Railway, dentro del volumen)
function defaultBackupDir() {
  const file = (env.DATABASE_URL ?? '').replace(/^file:/, '');
  const base = path.isAbsolute(file) ? path.dirname(file) : path.resolve(import.meta.dirname, '..', 'prisma');
  return path.join(base, 'backups');
}

export const config = {
  isProduction,
  port: Number(env.PORT) || 3000,
  // Detrás del proxy HTTPS de Railway: Express confía en X-Forwarded-* para
  // saber que el pedido vino por HTTPS (cookie Secure) y cuál es la IP real
  // del cliente (límite de intentos). Sin proxy, sería falsificable: solo en producción.
  trustProxy: env.TRUST_PROXY !== undefined ? Number(env.TRUST_PROXY) : (isProduction ? 1 : 0),
  backupDir: env.BACKUP_DIR || defaultBackupDir(),
  backupKeep: Number(env.BACKUP_KEEP) || 7
};

// Sin base no hay app: mejor fallar al arrancar con un mensaje claro
export function checkConfig() {
  if (!env.DATABASE_URL) throw new Error('Falta la variable de entorno DATABASE_URL (ej. file:./dev.db)');
}
