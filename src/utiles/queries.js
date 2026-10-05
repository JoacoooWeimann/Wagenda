// Fragmentos de consultas Prisma reutilizados por más de un controller.

// Toda tarea que se devuelve al cliente trae, si pertenece a un plan, su semana
// y su objetivo: el calendario muestra la etiqueta "Álgebra · Sem 2" y, si el
// objetivo está cerrado, la muestra como solo lectura.
export const TASK_WITH_GOAL = {
  // El seguimiento al que suma (su nombre es la etiqueta de la tarea)
  tracker: { select: { id: true, name: true, kind: true } },
  goalWeek: {
    select: { number: true, goal: { select: { id: true, title: true, strategy: true, status: true } } }
  }
};
