// Validación de entrada para tareas. Funciones puras: no dependen de Express ni
// de Prisma, así se testean sin levantar el servidor. Devuelven
// { data, fields }: `data` trae solo campos permitidos (whitelist) ya limpios,
// `fields` los errores por campo (vacío si todo es válido).
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText } from './common.js';

export { parseId } from './common.js';

export const PRIORITIES = ['baja', 'normal', 'alta'];

export const LIMITS = { title: 100, description: 1000, category: 30 };

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

  if (has('category')) {
    const category = optionalText(body.category, LIMITS.category, 'category', fields);
    if (category !== undefined) data.category = category;
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
