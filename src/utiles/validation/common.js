// Piezas compartidas por los validadores (tareas, objetivos).

export const hasErrors = (fields) => Object.keys(fields).length > 0;

// Texto opcional: trim, vacío -> null. Devuelve undefined si es inválido
// (y deja el error en `fields`).
export function optionalText(value, max, field, fields) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    fields[field] = 'Debe ser texto';
    return undefined;
  }
  const text = value.trim();
  if (text.length > max) {
    fields[field] = `Máximo ${max} caracteres`;
    return undefined;
  }
  return text || null;
}

// Texto obligatorio: trim, entre 1 y max caracteres
export function requiredText(value, max, field, fields, emptyMessage) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fields[field] = emptyMessage;
  else if (text.length > max) fields[field] = `Máximo ${max} caracteres`;
  else return text;
  return undefined;
}

// Entero dentro de [min, max]
export function intInRange(value, min, max, field, fields) {
  if (Number.isInteger(value) && value >= min && value <= max) return value;
  fields[field] = `Debe ser un número entero entre ${min} y ${max}`;
  return undefined;
}

// Entero positivo (ids en la URL). Devuelve null si no es válido.
export function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
