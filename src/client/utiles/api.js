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

export const previewGoal = (goal) => request('POST', '/api/goals/preview', goal);
export const createGoal = (goal) => request('POST', '/api/goals', goal);
export const getGoals = () => request('GET', '/api/goals');
export const getGoal = (id) => request('GET', `/api/goals/${id}`);
export const updateGoal = (id, changes) => request('PATCH', `/api/goals/${id}`, changes);
export const changeDeadline = (id, deadline, today) => request('PUT', `/api/goals/${id}/deadline`, { deadline, today });
export const deleteGoal = (id) => request('DELETE', `/api/goals/${id}`);
export const logSession = (goalId, date, value) => request('POST', `/api/goals/${goalId}/sessions`, { date, value });
export const updateWeek = (goalId, weekId, changes) => request('PATCH', `/api/goals/${goalId}/weeks/${weekId}`, changes);
export const addWeekTask = (goalId, weekId, title) => request('POST', `/api/goals/${goalId}/weeks/${weekId}/tasks`, { title });

export const getBoards = () => request('GET', '/api/boards');
export const createBoard = (board) => request('POST', '/api/boards', board);
export const updateBoard = (id, changes) => request('PATCH', `/api/boards/${id}`, changes);
export const deleteBoard = (id) => request('DELETE', `/api/boards/${id}`);

export const getTrackers = () => request('GET', '/api/trackers');
export const getTracker = (id) => request('GET', `/api/trackers/${id}`);
export const createTracker = (tracker) => request('POST', '/api/trackers', tracker);
export const updateTracker = (id, changes) => request('PATCH', `/api/trackers/${id}`, changes);
export const deleteTracker = (id) => request('DELETE', `/api/trackers/${id}`);
export const addEntry = (trackerId, entry) => request('POST', `/api/trackers/${trackerId}/entries`, entry);
export const deleteEntry = (trackerId, entryId) => request('DELETE', `/api/trackers/${trackerId}/entries/${entryId}`);
