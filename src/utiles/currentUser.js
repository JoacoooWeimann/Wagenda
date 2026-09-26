// Único punto que decide de quién son los datos del pedido. Hoy siempre es el
// usuario invitado (id 1, lo crea el seed); con login, esto va a leer la sesión
// y ningún controller va a tener que cambiar.
const GUEST_USER_ID = 1;

// `req` todavía no se usa: es donde va a estar la sesión cuando haya login
export function currentUserId(req) {
  return GUEST_USER_ID;
}
