import { Prisma } from '@prisma/client';

// El mismo error se presenta distinto según quién lo pide: la API (fetch del
// calendario) espera JSON; alguien navegando espera una página.
const isApi = (req) => req.path.startsWith('/api');

function sendError(req, res, status, message) {
  if (isApi(req)) return res.status(status).json({ error: message });
  res.status(status).render('error', { title: `Error ${status}`, status, message });
}

// Rutas que no existen (va después de todas las rutas)
export function notFound(req, res) {
  sendError(req, res, 404, isApi(req) ? 'Ruta no encontrada' : 'La página que buscás no existe');
}

// Errores inesperados. Express 5 manda acá automáticamente las excepciones de
// los controllers async, así que no hace falta try/catch en cada uno.
// Los errores esperados (validación, 404 de una tarea) los responde el controller.
// `next` no se usa, pero no se puede quitar: Express reconoce un manejador de
// errores por tener exactamente 4 parámetros.
export function errorHandler(err, req, res, next) {
  // Body con JSON mal formado (lo lanza express.json())
  if (err.type === 'entity.parse.failed') {
    return sendError(req, res, 400, 'JSON inválido');
  }

  // Red de seguridad: update/delete sobre un registro que no existe
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return sendError(req, res, 404, 'Recurso no encontrado');
  }

  // El detalle queda en el log del servidor; al cliente no se le filtra
  console.error(err);
  sendError(req, res, 500, 'Error interno del servidor');
}
