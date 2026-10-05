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

  // Sesión vencida o cerrada en otra pestaña: al login, volviendo después a esta página
  if (res.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }

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

// Seguimientos (áreas) y sus ítems
export const getTrackers = () => request('GET', '/api/trackers');
export const getTrackerOptions = () => request('GET', '/api/trackers/options');
export const getTracker = (id) => request('GET', `/api/trackers/${id}`);
export const createTracker = (tracker) => request('POST', '/api/trackers', tracker);
export const updateTracker = (id, changes) => request('PATCH', `/api/trackers/${id}`, changes);
export const deleteTracker = (id) => request('DELETE', `/api/trackers/${id}`);
export const createItem = (trackerId, item) => request('POST', `/api/trackers/${trackerId}/items`, item);
export const updateItem = (id, changes) => request('PATCH', `/api/items/${id}`, changes);
export const deleteItem = (id) => request('DELETE', `/api/items/${id}`);
export const addEntry = (itemId, entry) => request('POST', `/api/items/${itemId}/entries`, entry);
export const deleteEntry = (itemId, entryId) => request('DELETE', `/api/items/${itemId}/entries/${entryId}`);

export const getGroups = () => request('GET', '/api/groups');
export const getGroup = (id) => request('GET', `/api/groups/${id}`);
export const createGroup = (group) => request('POST', '/api/groups', group);
export const updateGroup = (id, changes) => request('PATCH', `/api/groups/${id}`, changes);
export const deleteGroup = (id) => request('DELETE', `/api/groups/${id}`);
export const joinGroup = (code) => request('POST', '/api/groups/join', { code });
export const regenerateCode = (id) => request('POST', `/api/groups/${id}/code`);
export const transferGroup = (id, userId) => request('POST', `/api/groups/${id}/transfer`, { userId });
export const leaveGroup = (id) => request('DELETE', `/api/groups/${id}/members/me`);
export const kickMember = (id, userId) => request('DELETE', `/api/groups/${id}/members/${userId}`);
export const shareTracker = (id, trackerId) => request('POST', `/api/groups/${id}/shares`, { trackerId });
export const unshareTracker = (id, shareId) => request('DELETE', `/api/groups/${id}/shares/${shareId}`);
export const joinTracker = (id, shareId) => request('POST', `/api/groups/${id}/shares/${shareId}/join`);
export const leaveTracker = (id, shareId) => request('DELETE', `/api/groups/${id}/shares/${shareId}/join`);
export const getRanking = (id, shareId) => request('GET', `/api/groups/${id}/shares/${shareId}/ranking`);

// Mi semana: franjas por día y rutina
export const getWeek = () => request('GET', '/api/week');
export const putWindow = (weekday, window) => request('PUT', `/api/week/windows/${weekday}`, window);
export const createRoutine = (block) => request('POST', '/api/routine', block);
export const updateRoutine = (id, changes) => request('PATCH', `/api/routine/${id}`, changes);
export const deleteRoutine = (id) => request('DELETE', `/api/routine/${id}`);
export const markRoutineDone = (blockId, date) => request('PUT', `/api/routine/${blockId}/done/${date}`);
export const unmarkRoutineDone = (blockId, date) => request('DELETE', `/api/routine/${blockId}/done/${date}`);
