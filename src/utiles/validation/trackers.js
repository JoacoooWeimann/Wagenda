// Validación de seguimientos, sus ítems y los registros. Misma forma que
// tasks.js y goals.js: funciones puras que devuelven { data, fields }.
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText, hasErrors } from './common.js';

export const TRACKER_LIMITS = { name: 40, description: 200, itemLabel: 20, unit: 10, note: 200, value: 1e9 };
export const ITEM_KINDS = ['medicion', 'actividad'];

const noFieldsError = (data, fields) =>
  !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;

// --- Seguimiento: nombre, descripción y cómo se llaman sus ítems -------------
function trackerFields(body, { partial }) {
  const fields = {};
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = requiredText(body.name, TRACKER_LIMITS.name, 'name', fields, 'El nombre es obligatorio');
    if (name !== undefined) data.name = name;
  }

  if (body.description !== undefined) {
    const description = optionalText(body.description, TRACKER_LIMITS.description, 'description', fields);
    if (description !== undefined) data.description = description;
  }

  // "Ejercicio", "Materia"… (vacío = "Ítem" en la pantalla)
  if (body.itemLabel !== undefined) {
    const itemLabel = optionalText(body.itemLabel, TRACKER_LIMITS.itemLabel, 'itemLabel', fields);
    if (itemLabel !== undefined) data.itemLabel = itemLabel;
  }

  return { data, fields };
}

export const validateTrackerCreate = (body = {}) => trackerFields(body, { partial: false });

export function validateTrackerUpdate(body = {}) {
  const { data, fields } = trackerFields(body, { partial: true });
  return { data, fields, error: noFieldsError(data, fields) };
}

// --- Ítem: un ejercicio, una materia… -----------------------------------------
function itemFields(body, { partial }) {
  const fields = {};
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = requiredText(body.name, TRACKER_LIMITS.name, 'name', fields, 'El nombre es obligatorio');
    if (name !== undefined) data.name = name;
  }

  // medicion (valores) o actividad (cuenta tareas); si no viene al crear, medición
  if (body.kind !== undefined) {
    if (ITEM_KINDS.includes(body.kind)) data.kind = body.kind;
    else fields.kind = 'Tipo inválido';
  }

  if (body.unit !== undefined) {
    const unit = optionalText(body.unit, TRACKER_LIMITS.unit, 'unit', fields);
    if (unit !== undefined) data.unit = unit;
  }

  if (body.higherIsBetter !== undefined) {
    if (typeof body.higherIsBetter === 'boolean') data.higherIsBetter = body.higherIsBetter;
    else fields.higherIsBetter = 'higherIsBetter debe ser true o false';
  }

  // Al editar, se puede pasar a otro seguimiento propio (lo verifica el controller)
  if (partial && body.trackerId !== undefined) {
    if (Number.isInteger(body.trackerId) && body.trackerId > 0) data.trackerId = body.trackerId;
    else fields.trackerId = 'Seguimiento inválido';
  }

  return { data, fields };
}

export const validateItemCreate = (body = {}) => itemFields(body, { partial: false });

export function validateItemUpdate(body = {}) {
  const { data, fields } = itemFields(body, { partial: true });
  return { data, fields, error: noFieldsError(data, fields) };
}

// --- Registro de un ítem de medición ------------------------------------------
// Número finito (no NaN ni Infinity) dentro de un rango razonable
function parseValue(value, fields) {
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= TRACKER_LIMITS.value) return value;
  fields.value = 'Debe ser un número';
  return undefined;
}
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
