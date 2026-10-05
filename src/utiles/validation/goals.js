// Validación de entrada para objetivos. Misma forma que validation/tasks.js:
// funciones puras que devuelven { data, fields }.
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText, intInRange, hasErrors } from './common.js';
import { TYPE_LABELS, DEFAULT_STRATEGY } from '../planning/templates.js';

export const GOAL_TYPES = Object.keys(TYPE_LABELS);
export const STRATEGIES = ['divisible', 'fases'];
export const GOAL_STATUSES = ['activo', 'logrado', 'abandonado'];
export const GOAL_LIMITS = { title: 100, description: 1000, contentTypes: 5, contentName: 30, contentCount: 100 };

export function validateGoalCreate(body = {}) {
  const fields = {};
  const data = {};

  const title = requiredText(body.title, GOAL_LIMITS.title, 'title', fields, 'El título es obligatorio');
  if (title !== undefined) data.title = title;

  if (body.description !== undefined) {
    const description = optionalText(body.description, GOAL_LIMITS.description, 'description', fields);
    if (description !== undefined) data.description = description;
  }

  if (GOAL_TYPES.includes(body.type)) data.type = body.type;
  else fields.type = 'Tipo de objetivo inválido';

  // Si no viene, se usa la sugerida para el tipo
  if (body.strategy === undefined) {
    if (data.type) data.strategy = DEFAULT_STRATEGY[data.type];
  } else if (STRATEGIES.includes(body.strategy)) {
    data.strategy = body.strategy;
  } else {
    fields.strategy = 'Estrategia inválida';
  }

  // El inicio lo manda el cliente: el servidor no sabe qué día es "hoy" para el usuario
  const startDate = parseDateOnly(body.startDate);
  if (startDate) data.startDate = startDate;
  else fields.startDate = 'Fecha inválida (formato YYYY-MM-DD)';

  const deadline = parseDateOnly(body.deadline);
  if (!deadline) fields.deadline = 'Fecha inválida (formato YYYY-MM-DD)';
  else if (startDate && deadline < startDate) fields.deadline = 'La fecha límite no puede ser anterior al inicio';
  else data.deadline = deadline;

  // Parámetros según la estrategia. Los de la otra estrategia se ignoran (whitelist).
  if (data.strategy === 'divisible') {
    const contents = validateContents(body.contents, fields);
    if (contents) data.contents = contents;

    if (body.reviewWeek === undefined) data.reviewWeek = true;
    else if (typeof body.reviewWeek === 'boolean') data.reviewWeek = body.reviewWeek;
    else fields.reviewWeek = 'reviewWeek debe ser true o false';
  }

  if (data.strategy === 'fases') {
    const sessionsPerWeek = intInRange(body.sessionsPerWeek, 1, 7, 'sessionsPerWeek', fields);
    if (sessionsPerWeek !== undefined) data.sessionsPerWeek = sessionsPerWeek;

    // Seguimiento vinculado (opcional): solo en fases, que es donde hay sesiones.
    // Que sea del usuario lo verifica el controller (necesita la base).
    const trackerId = optionalTrackerId(body.trackerId, fields);
    if (trackerId) data.trackerId = trackerId;
  }

  return { data, fields };
}

// Tipos de contenido de un objetivo divisible: [{ name, count }], ej.
// [{ name: 'Unidad', count: 6 }, { name: 'TP', count: 4 }]. Un solo mensaje de
// error en `contents`, indicando cuál fila falla.
function validateContents(value, fields) {
  const { contentTypes, contentName, contentCount } = GOAL_LIMITS;
  if (!Array.isArray(value) || value.length === 0) {
    fields.contents = 'Agregá al menos un tipo de contenido';
    return undefined;
  }
  if (value.length > contentTypes) {
    fields.contents = `Máximo ${contentTypes} tipos de contenido`;
    return undefined;
  }

  const contents = [];
  for (const [i, item] of value.entries()) {
    const rowFields = {};
    const name = requiredText(item?.name, contentName, 'name', rowFields, 'falta el nombre');
    const count = intInRange(item?.count, 1, contentCount, 'count', rowFields);
    if (hasErrors(rowFields)) {
      fields.contents = `Contenido ${i + 1}: ${rowFields.name || `la cantidad debe ser un entero entre 1 y ${contentCount}`}`;
      return undefined;
    }
    contents.push({ name, count });
  }

  // Nombres repetidos generarían tareas con el mismo título ("TP 1" dos veces)
  const names = contents.map(c => c.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    fields.contents = 'Hay tipos de contenido con el mismo nombre';
    return undefined;
  }
  return contents;
}

export const WEEK_LIMITS = { label: 50, target: 14 };

// Edición de una semana del plan. `target` solo se acepta en objetivos por
// fases: en los por contenido la cuota se calcula sola.
export function validateWeekUpdate(body = {}, strategy) {
  const fields = {};
  const data = {};

  if (body.label !== undefined) {
    const label = requiredText(body.label, WEEK_LIMITS.label, 'label', fields, 'La etiqueta es obligatoria');
    if (label !== undefined) data.label = label;
  }

  if (body.target !== undefined) {
    if (strategy !== 'fases') {
      fields.target = 'En un objetivo por contenido la cuota se calcula sola';
    } else {
      const target = intInRange(body.target, 0, WEEK_LIMITS.target, 'target', fields);
      if (target !== undefined) data.target = target;
    }
  }

  let applyToPhase = false;
  if (body.applyToPhase !== undefined) {
    if (typeof body.applyToPhase === 'boolean') applyToPhase = body.applyToPhase;
    else fields.applyToPhase = 'applyToPhase debe ser true o false';
  }

  const error = !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;
  return { data, fields, applyToPhase, error };
}

// Edición de los datos básicos de un objetivo. La estrategia no está: define la
// estructura del plan (contenidos o cuotas), cambiarla es crear otro objetivo.
export function validateGoalUpdate(body = {}) {
  const fields = {};
  const data = {};

  if (body.title !== undefined) {
    const title = requiredText(body.title, GOAL_LIMITS.title, 'title', fields, 'El título es obligatorio');
    if (title !== undefined) data.title = title;
  }

  if (body.description !== undefined) {
    const description = optionalText(body.description, GOAL_LIMITS.description, 'description', fields);
    if (description !== undefined) data.description = description;
  }

  if (body.type !== undefined) {
    if (GOAL_TYPES.includes(body.type)) data.type = body.type;
    else fields.type = 'Tipo de objetivo inválido';
  }

  // null desvincula. Que sea del usuario y que el objetivo sea por fases lo
  // verifica el controller.
  if (body.trackerId !== undefined) {
    const trackerId = optionalTrackerId(body.trackerId, fields);
    if (trackerId !== undefined) data.trackerId = trackerId;
  }

  // Cerrar (logrado / abandonado) o reabrir (activo). closedAt lo pone el controller.
  if (body.status !== undefined) {
    if (GOAL_STATUSES.includes(body.status)) data.status = body.status;
    else fields.status = 'Estado inválido';
  }

  const error = !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;
  return { data, fields, error };
}

// Un objetivo cerrado es de solo lectura: su plan, sesiones y tareas no cambian
// hasta que se reabra. Devuelve los errores por campo, o null si está abierto.
export function closedGoalError(goal) {
  return goal.status === 'activo' ? null : { status: 'El objetivo está cerrado' };
}

// Cambio de plazo: { deadline, today }. `today` lo manda el cliente (igual que el
// inicio al crear): el servidor no sabe qué día es para el usuario. El nuevo
// plazo no puede ser anterior a hoy (el pasado no se toca) ni al inicio.
export function validateDeadlineChange(body = {}, goal) {
  const fields = {};
  const today = parseDateOnly(body.today);
  if (!today) fields.today = 'Fecha inválida (formato YYYY-MM-DD)';

  const deadline = parseDateOnly(body.deadline);
  if (!deadline) fields.deadline = 'Fecha inválida (formato YYYY-MM-DD)';
  else if (deadline < goal.startDate) fields.deadline = 'La fecha límite no puede ser anterior al inicio';
  else if (today && deadline < today) fields.deadline = 'La fecha límite no puede ser anterior a hoy';
  else if (deadline.getTime() === goal.deadline.getTime()) fields.deadline = 'Es la fecha límite actual';

  return { data: hasErrors(fields) ? {} : { deadline }, fields };
}

// id de seguimiento opcional: null o un entero positivo. Devuelve undefined si es inválido.
function optionalTrackerId(value, fields) {
  if (value === undefined || value === null) return value;
  if (Number.isInteger(value) && value > 0) return value;
  fields.trackerId = 'Seguimiento inválido';
  return undefined;
}
