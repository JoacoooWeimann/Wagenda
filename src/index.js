import app from './app.js';
import prisma from './utiles/db.js';
import { config, checkConfig } from './config.js';
import { startJobs } from './jobs.js';

checkConfig();

const server = app.listen(config.port, () => console.log(`Servidor corriendo en http://localhost:${config.port}`));
const stopJobs = startJobs();

// Apagado ordenado: Railway manda SIGTERM en cada deploy. Se dejan de aceptar
// pedidos, se terminan los que están en curso y se cierra la base.
function shutdown(signal) {
  console.log(`${signal}: cerrando…`);
  stopJobs();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Si algo queda colgado, no esperar para siempre
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
