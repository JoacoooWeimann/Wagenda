// Validación de entrada para objetivos. Misma forma que validation/tasks.js:
// funciones puras que devuelven { data, fields }.
import { parseDateOnly } from '../dates.js';
import { optionalText, requiredText, intInRange } from './common.js';
import { TYPE_LABELS, DEFAULT_STRATEGY } from '../planning/templates.js';

export const GOAL_TYPES = Object.keys(TYPE_LABELS);
export const STRATEGIES = ['divisible', 'fases'];
export const GOAL_LIMITS = { title: 100, description: 1000, unitName: 30, totalUnits: 100 };

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
    const totalUnits = intInRange(body.totalUnits, 1, GOAL_LIMITS.totalUnits, 'totalUnits', fields);
    if (totalUnits !== undefined) data.totalUnits = totalUnits;

    const unitName = body.unitName === undefined
      ? null
      : optionalText(body.unitName, GOAL_LIMITS.unitName, 'unitName', fields);
    if (unitName !== undefined) data.unitName = unitName ?? 'Unidad';

    if (body.reviewWeek === undefined) data.reviewWeek = true;
    else if (typeof body.reviewWeek === 'boolean') data.reviewWeek = body.reviewWeek;
    else fields.reviewWeek = 'reviewWeek debe ser true o false';
  }

  if (data.strategy === 'fases') {
    const sessionsPerWeek = intInRange(body.sessionsPerWeek, 1, 7, 'sessionsPerWeek', fields);
    if (sessionsPerWeek !== undefined) data.sessionsPerWeek = sessionsPerWeek;
  }

  return { data, fields };
}
