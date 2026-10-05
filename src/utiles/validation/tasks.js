// Validación de entrada para tareas. Funciones puras: no dependen de Express ni
// de Prisma, así se testean sin levantar el servidor. Devuelven
// { data, fields }: `data` trae solo campos permitidos (whitelist) ya limpios,
// `fields` los errores por campo (vacío si todo es válido).
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText } from './common.js';
import { DAY_MINUTES } from '../schedule/slots.js';

export { parseId } from './common.js';

export const PRIORITIES = ['baja', 'normal', 'alta'];

export const LIMITS = { title: 100, description: 1000 };

// Valida los campos presentes en `body`. Con `partial` (PATCH) ningún campo es
// obligatorio; sin él (POST) se exigen title y startDate y se aplican defaults.
function validateTask(body, { partial }) {
  const fields = {};
  const data = {};
  const has = (key) => body[key] !== undefined;

  if (has('title') || !partial) {
    const title = requiredText(body.title, LIMITS.title, 'title', fields, 'El título es obligatorio');
    if (title !== undefined) data.title = title;
  }

  if (has('description')) {
    const description = optionalText(body.description, LIMITS.description, 'description', fields);
    if (description !== undefined) data.description = description;
  }

  // Seguimiento al que suma actividad y, opcional, un ítem de ese seguimiento:
  // ids, o null para desvincular. Que sean del usuario y coherentes entre sí lo
  // verifica el controller (necesita la base). `category` ya no se acepta: la
  // clasificación es el seguimiento (whitelist: se ignora).
  for (const key of ['trackerId', 'itemId']) {
    if (!has(key)) continue;
    if (body[key] === null || (Number.isInteger(body[key]) && body[key] > 0)) data[key] = body[key];
    else fields[key] = key === 'trackerId' ? 'Seguimiento inválido' : 'Ítem inválido';
  }

  // Horario: minutos desde las 00:00, o null para quitarlo. Que vengan los dos,
  // en orden y en una tarea de un día lo controla checkTaskTimes (necesita lo
  // guardado, en un PATCH).
  for (const key of ['startMinute', 'endMinute']) {
    if (!has(key)) continue;
    if (body[key] === null || (Number.isInteger(body[key]) && body[key] >= 0 && body[key] <= DAY_MINUTES)) data[key] = body[key];
    else fields[key] = 'Horario inválido';
  }

  if (has('priority')) {
    if (PRIORITIES.includes(body.priority)) data.priority = body.priority;
    else fields.priority = 'Prioridad inválida';
  } else if (!partial) {
    data.priority = 'normal';
  }

  if (has('done')) {
    if (typeof body.done === 'boolean') data.done = body.done;
    else fields.done = 'done debe ser true o false';
  }

  if (has('startDate') || !partial) {
    const start = parseDateOnly(body.startDate);
    if (start) data.startDate = start;
    else fields.startDate = has('startDate') ? 'Fecha inválida (formato YYYY-MM-DD)' : 'La fecha de inicio es obligatoria';
  }

  // endDate vacío en POST = tarea de un solo día
  if (has('endDate') && !(body.endDate === '' && !partial)) {
    const end = parseDateOnly(body.endDate);
    if (end) data.endDate = end;
    else fields.endDate = 'Fecha inválida (formato YYYY-MM-DD)';
  } else if (!partial && data.startDate) {
    data.endDate = data.startDate;
  }

  return { data, fields };
}

export function validateTaskCreate(body = {}) {
  const result = validateTask(body, { partial: false });
  if (result.data.startDate && result.data.endDate) {
    checkDateOrder(result.data.startDate, result.data.endDate, result.fields);
  }
  return result;
}

export function validateTaskUpdate(body = {}) {
  const result = validateTask(body, { partial: true });
  if (Object.keys(result.fields).length === 0 && Object.keys(result.data).length === 0) {
    result.error = 'No hay campos para actualizar';
  }
  return result;
}

// Horario de la tarea como queda (lo guardado + lo nuevo). Reglas: los dos o
// ninguno, el fin después del inicio, y solo en tareas de un día. Si la tarea
// pasa a ser de varios días sin que se pida un horario (ej. al mover un
// contenido a otra semana), el horario se borra solo. Completa `data` y
// devuelve los errores por campo.
export function checkTaskTimes(data, current, start, end) {
  const fields = {};
  const asked = data.startMinute !== undefined || data.endMinute !== undefined;
  const startMinute = data.startMinute !== undefined ? data.startMinute : current.startMinute ?? null;
  const endMinute = data.endMinute !== undefined ? data.endMinute : current.endMinute ?? null;
  const multiDay = start.getTime() !== end.getTime();

  if (startMinute === null && endMinute === null) return fields;
  if (multiDay) {
    if (asked) fields.startMinute = 'Solo las tareas de un día tienen horario';
    else Object.assign(data, { startMinute: null, endMinute: null });
    return fields;
  }
  if (startMinute === null || endMinute === null) fields.startMinute = 'Indicá el inicio y el fin';
  else if (endMinute <= startMinute) fields.endMinute = 'El fin tiene que ser después del inicio';
  return fields;
}

// Se exporta aparte porque en PATCH una de las dos fechas puede venir de la
// base: el controller combina guardado + nuevo y recién ahí la llama.
export function checkDateOrder(start, end, fields) {
  if (end < start) fields.endDate = 'La fecha de fin no puede ser anterior al inicio';
  return fields;
}


export function validateMonthQuery(query = {}) {
  const year = Number(query.year);
  const month = Number(query.month);
  const fields = {};
  if (!Number.isInteger(year) || year < 1970 || year > 2100) fields.year = 'Año inválido';
  if (!Number.isInteger(month) || month < 1 || month > 12) fields.month = 'Mes inválido';
  return { data: { year, month }, fields };
}
