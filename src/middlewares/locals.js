// res.locals está disponible en todas las vistas EJS: así la navbar sabe qué
// link marcar como activo sin que cada ruta tenga que pasar la URL a mano.
export function exposeCurrentPath(req, res, next) {
  res.locals.currentPath = req.path;
  next();
}
