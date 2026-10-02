// Sesiones: un token aleatorio en una cookie httpOnly; en la base, su hash.
import { randomBytes, createHash } from 'node:crypto';
import prisma from '../db.js';

export const SESSION_COOKIE = 'wagenda_session';
export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// SHA-256 alcanza (no hace falta scrypt): el token tiene 256 bits aleatorios,
// no se puede adivinar probando como una contraseña
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  // De paso se limpian las sesiones vencidas de este usuario
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: now } } });
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) }
  });
  return token;
}

// Usuario de una sesión vigente, o null
export async function findSessionUser(token, now = new Date()) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, username: true } } }
  });
  if (!session || session.expiresAt < now) return null;
  return session.user;
}

export async function deleteSession(token) {
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// Lee una cookie del header (sin cookie-parser: es un split)
export function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// HttpOnly: el JavaScript de la página no puede leerla (un XSS no roba la sesión).
// SameSite=Lax: el navegador no la manda en POST/PATCH/DELETE que vengan de
// otro sitio, lo que corta los ataques CSRF a la API.
// Secure en producción: solo viaja por HTTPS.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * DAY_MS
  };
}
