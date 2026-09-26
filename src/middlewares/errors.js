import { Prisma } from '@prisma/client';

// Rutas /api que no existen: 404 en JSON (por defecto Express responde HTML)
export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Errores inesperados. Express 5 manda acá automáticamente las excepciones de
// los controllers async, así que no hace falta try/catch en cada uno.
// Los errores esperados (validación, 404 de una tarea) los responde el controller.
export function errorHandler(err, req, res, next) {
  // Body con JSON mal formado (lo lanza express.json())
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  // Red de seguridad: update/delete sobre un registro que no existe
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }

  // El detalle queda en el log del servidor; al cliente no se le filtra
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
