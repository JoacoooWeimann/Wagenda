// Validación de grupos. Misma forma que el resto: { data, fields }.
import { optionalText, requiredText, intInRange, hasErrors } from './common.js';

export const GROUP_LIMITS = { name: 40, description: 200, weeklyLimit: [1, 50] };

function groupFields(body, { partial }) {
  const fields = {};
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = requiredText(body.name, GROUP_LIMITS.name, 'name', fields, 'El nombre es obligatorio');
    if (name !== undefined) data.name = name;
  }

  if (body.description !== undefined) {
    const description = optionalText(body.description, GROUP_LIMITS.description, 'description', fields);
    if (description !== undefined) data.description = description;
  }

  // null = sin límite
  if (body.weeklyLimit !== undefined) {
    if (body.weeklyLimit === null) data.weeklyLimit = null;
    else {
      const [min, max] = GROUP_LIMITS.weeklyLimit;
      const limit = intInRange(body.weeklyLimit, min, max, 'weeklyLimit', fields);
      if (limit !== undefined) data.weeklyLimit = limit;
    }
  }

  return { data, fields };
}

export const validateGroupCreate = (body = {}) => groupFields(body, { partial: false });

export function validateGroupUpdate(body = {}) {
  const { data, fields } = groupFields(body, { partial: true });
  const error = !hasErrors(fields) && Object.keys(data).length === 0 ? 'No hay campos para actualizar' : undefined;
  return { data, fields, error };
}
