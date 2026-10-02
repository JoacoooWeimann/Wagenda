import { Prisma } from '@prisma/client';
import prisma from '../utiles/db.js';
import { hasErrors } from '../utiles/validation/common.js';
import { validateRegister, validateLogin, safeNext } from '../utiles/validation/auth.js';
import { hashPassword, verifyPassword, dummyVerify } from '../utiles/auth/password.js';
import { createSession, deleteSession, readCookie, sessionCookieOptions, SESSION_COOKIE } from '../utiles/auth/sessions.js';
import { GUEST_USER_ID } from '../utiles/currentUser.js';

// Login y registro son formularios HTML comunes (POST + redirección), sin
// React: no necesitan nada más, y funcionan aunque falle el JavaScript.

const USERNAME_TAKEN = { username: 'Ese usuario ya existe' };

function renderForm(res, view, { status = 200, fields = {}, values = {}, error = null, next }) {
  const title = view === 'login' ? 'Ingresar' : 'Crear cuenta';
  res.status(status).render(view, { title, fields, values, error, next: safeNext(next) });
}

async function startSession(res, userId, next) {
  res.cookie(SESSION_COOKIE, await createSession(userId), sessionCookieOptions());
  res.redirect(safeNext(next));
}

export function showLogin(req, res) {
  if (req.user) return res.redirect(safeNext(req.query.next));
  renderForm(res, 'login', { next: req.query.next });
}

export function showRegister(req, res) {
  if (req.user) return res.redirect(safeNext(req.query.next));
  renderForm(res, 'register', { next: req.query.next });
}

export async function login(req, res) {
  const { data, fields } = validateLogin(req.body);
  const next = req.body?.next;
  const values = { username: req.body?.username ?? '' }; // la contraseña nunca se devuelve
  if (hasErrors(fields)) return renderForm(res, 'login', { status: 400, fields, values, next });

  const user = await prisma.user.findUnique({ where: { username: data.username } });
  const ok = user?.passwordHash
    ? await verifyPassword(data.password, user.passwordHash)
    : await dummyVerify(data.password); // mismo tiempo si el usuario no existe
  // Mismo mensaje para los dos casos: no revela qué usuarios existen
  if (!ok) return renderForm(res, 'login', { status: 401, values, error: 'Usuario o contraseña incorrectos', next });

  await startSession(res, user.id, next);
}

export async function register(req, res) {
  const { data, fields } = validateRegister(req.body);
  const next = req.body?.next;
  const values = { username: req.body?.username ?? '', name: req.body?.name ?? '' };
  if (hasErrors(fields)) return renderForm(res, 'register', { status: 400, fields, values, next });

  const { password, ...profile } = data;
  const account = { ...profile, passwordHash: await hashPassword(password) };

  let userId;
  try {
    // La primera cuenta reclama al invitado (id 1) y con él todos sus datos.
    // El filtro passwordHash: null hace que solo pueda pasar una vez.
    const { count } = await prisma.user.updateMany({
      where: { id: GUEST_USER_ID, passwordHash: null },
      data: account
    });
    userId = count === 1 ? GUEST_USER_ID : (await prisma.user.create({ data: account })).id;
  } catch (err) {
    // El índice único de username decide (también si dos se registran a la vez)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return renderForm(res, 'register', { status: 400, fields: USERNAME_TAKEN, values, next });
    }
    throw err;
  }

  await startSession(res, userId, next);
}

export async function logout(req, res) {
  await deleteSession(readCookie(req.headers.cookie, SESSION_COOKIE));
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, options);
  res.redirect('/');
}
