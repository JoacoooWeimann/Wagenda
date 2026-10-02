// Hash de contraseñas con scrypt (viene con Node: sin dependencias).
// scrypt es "memory-hard": cada intento necesita bastante memoria, así que
// probar millones de contraseñas con hardware especializado sale caro.
//
// Formato guardado: "scrypt$N$r$p$salt$hash" (salt y hash en base64). Los
// parámetros viajan con el hash: si un día se suben, los hashes viejos se
// siguen pudiendo verificar.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// N=2^15, r=8, p=3: una de las configuraciones mínimas equivalentes que
// recomienda OWASP para scrypt (N fija la memoria: 128·N·r = 32 MiB; p, cuántas
// veces se repite). maxmem se sube porque el límite por defecto de Node es justo 32 MiB.
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const MAXMEM = 64 * 1024 * 1024;

async function derive(password, salt, { N, r, p }) {
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAXMEM });
}

export async function hashPassword(password) {
  const salt = randomBytes(16); // distinto para cada usuario: dos contraseñas iguales dan hashes distintos
  const hash = await derive(password, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algorithm, N, r, p, salt, hash] = (stored ?? '').split('$');
  if (algorithm !== 'scrypt' || !hash) return false;

  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  // Comparación en tiempo constante: no revela cuántos bytes coinciden
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hash de una contraseña cualquiera, para verificar contra él cuando el usuario
// no existe: así "usuario inexistente" tarda lo mismo que "contraseña
// incorrecta" y no se puede averiguar qué usuarios existen midiendo tiempos.
let dummyHash;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('wagenda-dummy-password');
  await verifyPassword(password, dummyHash);
  return false;
}
