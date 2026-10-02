import { randomInt } from 'node:crypto';

// Código de invitación: 8 caracteres de un alfabeto sin los que se confunden al
// dictarlo o copiarlo (0/O, 1/I/L). 30^8 ≈ 6,5·10^11 combinaciones: no se adivina
// probando. Se puede regenerar si se filtra.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode() {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

// Lo que escribe el usuario: sin espacios ni guiones, en mayúsculas
export function normalizeInviteCode(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}
