// Único punto que decide de quién son los datos del pedido: el usuario de la
// sesión, que deja en req.user el middleware loadUser. Los controllers no
// cambiaron al agregar el login: siempre preguntaron acá.

// El invitado del seed (sin credenciales): la primera cuenta registrada se
// queda con él y con sus datos (ver controllers/auth.js)
export const GUEST_USER_ID = 1;

export function currentUserId(req) {
  // Las rutas que usan datos del usuario están detrás de requireAuth; si se
  // llega acá sin sesión es un error de programación, no del usuario.
  if (!req.user) throw new Error('currentUserId sin sesión: falta requireAuth en la ruta');
  return req.user.id;
}
