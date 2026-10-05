// Validación de "Mi semana" (franjas y rutina). Misma forma que el resto:
// funciones puras que devuelven { data, fields }. Los horarios viajan en
// minutos desde las 00:00 (540 = 09:00).
import { requiredText, hasErrors } from './common.js';
import { DAY_MINUTES } from '../schedule/slots.js';

export const ROUTINE_LIMITS = { title: 40 };

const isMinute = (v) => Number.isInteger(v) && v >= 0 && v <= DAY_MINUTES;
export const isWeekday = (v) => Number.isInteger(v) && v >= 0 && v <= 6;

// Inicio y fin presentes en `body` (o requeridos). No valida el orden si falta
// alguno: en un PATCH lo controla el controller combinando con lo guardado.
function timeRange(body, fields, data, { partial, overnight = false }) {
  for (const key of ['startMinute', 'endMinute']) {
    if (body[key] === undefined) {
      if (!partial) fields[key] = 'Horario obligatorio';
    } else if (isMinute(body[key])) data[key] = body[key];
    else fields[key] = 'Horario inválido';
  }
  if (data.startMinute === undefined || data.endMinute === undefined) return;
  // Cruzando la medianoche, solo inicio y fin iguales no tienen sentido
  if (overnight) {
    if (data.startMinute === data.endMinute) fields.endMinute = 'El fin tiene que ser distinto del inicio';
  } else {
    checkTimeOrder(data, fields);
  }
}

export function checkTimeOrder({ startMinute, endMinute }, fields) {
  if (endMinute <= startMinute) fields.endMinute = 'El fin tiene que ser después del inicio';
  return fields;
}

export function validateWindow(body = {}) {
  const fields = {};
  const data = {};
  timeRange(body, fields, data, { partial: false });
  return { data, fields };
}

// Bloque de rutina. Al crear se pueden elegir varios días a la vez
// ("Trabajo, lunes a viernes"): `weekdays`. El fin puede ser anterior al
// inicio: cruza la medianoche (lo divide el controller con splitOvernight).
export function validateRoutineCreate(body = {}) {
  const fields = {};
  const data = {};

  const title = requiredText(body.title, ROUTINE_LIMITS.title, 'title', fields, 'El título es obligatorio');
  if (title !== undefined) data.title = title;

  const days = Array.isArray(body.weekdays) ? [...new Set(body.weekdays)] : [];
  if (days.length === 0 || !days.every(isWeekday)) fields.weekdays = 'Elegí al menos un día';
  else data.weekdays = days.sort();

  timeRange(body, fields, data, { partial: false, overnight: true });
  trackerField(body, fields, data);
  return { data, fields };
}

export function validateRoutineUpdate(body = {}) {
  const fields = {};
  const data = {};

  if (body.title !== undefined) {
    const title = requiredText(body.title, ROUTINE_LIMITS.title, 'title', fields, 'El título es obligatorio');
    if (title !== undefined) data.title = title;
  }
  if (body.weekday !== undefined) {
    if (isWeekday(body.weekday)) data.weekday = body.weekday;
    else fields.weekday = 'Día inválido';
  }
  timeRange(body, fields, data, { partial: true });
  trackerField(body, fields, data);

  const error = !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;
  return { data, fields, error };
}

// Seguimiento opcional (null lo desvincula). Que sea del usuario lo verifica el controller.
function trackerField(body, fields, data) {
  if (body.trackerId === undefined) return;
  if (body.trackerId === null || (Number.isInteger(body.trackerId) && body.trackerId > 0)) data.trackerId = body.trackerId;
  else fields.trackerId = 'Seguimiento inválido';
}
