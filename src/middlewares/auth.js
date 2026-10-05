import { readCookie, findSessionUser, SESSION_COOKIE } from '../utiles/auth/sessions.js';

// Identifica al usuario de cada pedido (o ninguno) a partir de la cookie de
// sesión. Lo deja en req.user, y en res.locals para que la navbar lo muestre.
export async function loadUser(req, res, next) {
  req.user = await findSessionUser(readCookie(req.headers.cookie, SESSION_COOKIE));
  res.locals.user = req.user;
  next();
}

// Corta el pedido si no hay sesión: la API responde 401 (el cliente redirige
// al login) y las páginas redirigen al login recordando adónde se quería ir.
export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api')) return res.status(401).json({ error: 'Iniciá sesión para continuar' });
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}
