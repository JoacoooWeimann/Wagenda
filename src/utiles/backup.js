// Backups de la base SQLite: una copia por día en una carpeta, guardando los
// últimos N. VACUUM INTO hace una copia consistente con la app andando (SQLite
// la arma dentro de una transacción de lectura) y además compacta el archivo.
//
// Protege contra errores (un borrado, una migración que sale mal, un archivo
// dañado). Si se pierde el volumen entero, se pierden también los backups:
// para eso hay que copiarlos fuera del servidor (ver README, "Despliegue").
import fs from 'node:fs';
import path from 'node:path';
import prisma from './db.js';

const NAME = /^wagenda-(\d{4}-\d{2}-\d{2})\.db$/;
export const backupName = (now) => `wagenda-${now.toISOString().slice(0, 10)}.db`;

// Qué archivos borrar para quedarse con los `keep` backups más nuevos (los
// nombres llevan la fecha, así que ordenar por nombre es ordenar por fecha).
// Ignora cualquier otro archivo de la carpeta.
export function backupsToDelete(files, keep) {
  return files.filter(f => NAME.test(f)).sort().reverse().slice(keep);
}

// Hace el backup del día (si ya existe, no lo repite) y borra los viejos.
// Devuelve la ruta del backup del día.
export async function backupDatabase({ dir, keep, now = new Date() }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, backupName(now));
  if (!fs.existsSync(file)) {
    // La ruta va dentro del SQL: se escapan las comillas simples
    await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  }
  for (const old of backupsToDelete(fs.readdirSync(dir), keep)) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
  return file;
}
