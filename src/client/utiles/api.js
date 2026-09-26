// Único punto de acceso a la API desde el cliente. Si la respuesta no es 2xx
// lanza ApiError, así ningún componente trata un { error } como si fueran datos.

export class ApiError extends Error {
  constructor(message, { status = 0, fields = {} } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = no hubo respuesta (servidor caído, sin red)
    this.fields = fields; // errores por campo de la validación del servidor
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor');
  }

  // Si el servidor no devolvió JSON (ej. un proxy caído), data queda en null
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.error || `Error ${res.status}`, {
      status: res.status,
      fields: data?.fields || {}
    });
  }
  return data;
}

export const getTasks = (year, month) => request('GET', `/api/tasks?year=${year}&month=${month}`);
export const createTask = (task) => request('POST', '/api/tasks', task);
export const updateTask = (id, changes) => request('PATCH', `/api/tasks/${id}`, changes);
export const deleteTask = (id) => request('DELETE', `/api/tasks/${id}`);
