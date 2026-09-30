// Validación de seguimientos y sus registros. Misma forma que tasks.js y
// goals.js: funciones puras que devuelven { data, fields }.
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText, hasErrors } from './common.js';
import { GOAL_TYPES } from './goals.js';

export const TRACKER_LIMITS = { name: 40, unit: 10, note: 200, value: 1e9 };

// Campos del seguimiento. `partial`: en la edición todos son opcionales.
function trackerFields(body, { partial }) {
  const fields = {};
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = requiredText(body.name, TRACKER_LIMITS.name, 'name', fields, 'El nombre es obligatorio');
    if (name !== undefined) data.name = name;
  }

  if (body.unit !== undefined) {
    const unit = optionalText(body.unit, TRACKER_LIMITS.unit, 'unit', fields);
    if (unit !== undefined) data.unit = unit;
  }

  if (body.higherIsBetter !== undefined) {
    if (typeof body.higherIsBetter === 'boolean') data.higherIsBetter = body.higherIsBetter;
    else fields.higherIsBetter = 'higherIsBetter debe ser true o false';
  }

  // Categoría opcional, con los mismos tipos que los objetivos; null la quita
  if (body.type !== undefined) {
    if (body.type === null || GOAL_TYPES.includes(body.type)) data.type = body.type;
    else fields.type = 'Tipo inválido';
  }

  return { data, fields };
}

export const validateTrackerCreate = (body = {}) => trackerFields(body, { partial: false });

export function validateTrackerUpdate(body = {}) {
  const { data, fields } = trackerFields(body, { partial: true });
  const error = !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;
  return { data, fields, error };
}

// Número finito (no NaN ni Infinity) dentro de un rango razonable
function parseValue(value, fields) {
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= TRACKER_LIMITS.value) return value;
  fields.value = 'Debe ser un número';
  return undefined;
}

// Un registro: { date, value, note? }. Al registrar una sesión el valor es
// opcional (valueRequired: false): la sesión puede ir sin medición.
export function validateEntry(body = {}, { valueRequired = true } = {}) {
  const fields = {};
  const data = {};

  const date = parseDateOnly(body.date);
  if (date) data.date = date;
  else fields.date = 'Fecha inválida (formato YYYY-MM-DD)';

  const hasValue = body.value !== undefined && body.value !== null;
  if (hasValue) {
    const value = parseValue(body.value, fields);
    if (value !== undefined) data.value = value;
  } else if (valueRequired) {
    fields.value = 'El valor es obligatorio';
  }

  if (body.note !== undefined) {
    const note = optionalText(body.note, TRACKER_LIMITS.note, 'note', fields);
    if (note !== undefined) data.note = note;
  }

  return { data, fields };
}
