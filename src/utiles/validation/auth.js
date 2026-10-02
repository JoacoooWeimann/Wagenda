// Validación de registro y login. Misma forma que el resto: { data, fields }.
import { requiredText } from './common.js';

export const AUTH_LIMITS = { username: [3, 20], name: 40, password: [8, 200] };
const USERNAME = /^[a-z0-9_]+$/;

// El nombre de usuario se guarda en minúsculas: "Joaco" y "joaco" son el mismo
function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegister(body = {}) {
  const fields = {};
  const data = {};
  const [minUser, maxUser] = AUTH_LIMITS.username;
  const [minPass, maxPass] = AUTH_LIMITS.password;

  const username = normalizeUsername(body.username);
  if (username.length < minUser || username.length > maxUser) {
    fields.username = `Entre ${minUser} y ${maxUser} caracteres`;
  } else if (!USERNAME.test(username)) {
    fields.username = 'Solo letras, números y guion bajo';
  } else {
    data.username = username;
  }

  const name = requiredText(body.name, AUTH_LIMITS.name, 'name', fields, 'El nombre es obligatorio');
  if (name !== undefined) data.name = name;

  // La contraseña no se recorta: los espacios son parte de ella
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < minPass) fields.password = `Mínimo ${minPass} caracteres`;
  else if (password.length > maxPass) fields.password = `Máximo ${maxPass} caracteres`;
  else if (body.passwordConfirm !== undefined && body.passwordConfirm !== password) {
    fields.passwordConfirm = 'Las contraseñas no coinciden';
  } else data.password = password;

  return { data, fields };
}

// En el login no se valida el formato: solo que vengan los dos datos. Si están
// mal, la respuesta es la misma para usuario y contraseña (no revela cuál falló).
export function validateLogin(body = {}) {
  const fields = {};
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username) fields.username = 'Ingresá tu usuario';
  if (!password) fields.password = 'Ingresá tu contraseña';
  return { data: { username, password }, fields };
}

// Destino después de loguearse. Solo rutas propias ("/goals"): una URL
// externa ("//sitio-malo.com") convertiría el login en una redirección abierta.
export function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/calendar';
}
