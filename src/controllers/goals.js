import prisma from '../utiles/db.js';
import { invalid, notFound } from '../utiles/responses.js';
import { hasErrors, parseId } from '../utiles/validation/common.js';
import {
  validateGoalCreate, validateGoalUpdate, validateWeekUpdate, validateDeadlineChange, closedGoalError
} from '../utiles/validation/goals.js';
import { requiredText } from '../utiles/validation/common.js';
import { currentUserId } from '../utiles/currentUser.js';
import { generatePlan, resizePlan, PlanError, milestoneTitle } from '../utiles/planning/index.js';
import { TYPE_LABELS } from '../utiles/planning/templates.js';
import { parseDateOnly } from '../utiles/dates.js';
import { TASK_WITH_GOAL } from '../utiles/queries.js';
import { validateEntry } from '../utiles/validation/trackers.js';

const GOAL_NOT_FOUND = 'Objetivo no encontrado';

// Un objetivo solo se vincula a un seguimiento propio. Devuelve los errores por
// campo, o null si está bien (o no se pidió vincular).
async function trackerError(trackerId, userId) {
  if (!trackerId) return null;
  const tracker = await prisma.tracker.findFirst({ where: { id: trackerId, userId } });
  return tracker ? null : { trackerId: 'Seguimiento no encontrado' };
}

// Valida y genera el plan. Devuelve { goal, plan } o { fields } si algo es inválido.
// Un PlanError (ej. plazo corto para "fases") es un error de datos esperable: se
// devuelve asociado a su campo, igual que los errores de validación.
function buildGoalAndPlan(body) {
  const { data, fields } = validateGoalCreate(body);
  if (hasErrors(fields)) return { fields };

  try {
    return { goal: data, plan: generatePlan(data) };
  } catch (err) {
    if (err instanceof PlanError) return { fields: { [err.field]: err.message } };
    throw err; // inesperado: lo maneja errorHandler
  }
}

// Lo hecho en una semana: tareas marcadas como hechas, sin contar el hito de fecha límite
const doneInWeek = (week) => week.tasks.filter(t => t.done && t.kind !== 'hito').length;

// Agrega `done` a cada semana (sin `tasks` si no se piden) y calcula el cumplimiento:
//   Σ min(hecho, cuota) / Σ cuota
// El min es por semana: el exceso de una semana no compensa la falta de otra,
// porque el plan apunta a la constancia (el exceso queda como "cuota superada").
//
// La cuota (target) depende de la estrategia:
//   - fases: se guarda en la semana; es lo que el usuario decide (editable)
//   - divisible: se calcula como la cantidad de contenidos planificados en la
//     semana. Así, mover, agregar o borrar un contenido la ajusta sola, sin
//     tener que actualizar dos semanas cada vez (un dato derivado no se desincroniza).
function withProgress(goal, { keepTasks }) {
  const weeks = goal.weeks.map(({ tasks, ...week }) => ({
    ...week,
    target: goal.strategy === 'divisible' ? tasks.filter(t => t.kind !== 'hito').length : week.target,
    done: doneInWeek({ tasks }),
    ...(keepTasks ? { tasks } : {})
  }));
  const progress = {
    done: weeks.reduce((n, w) => n + Math.min(w.done, w.target), 0),
    total: weeks.reduce((n, w) => n + w.target, 0)
  };
  return { ...goal, weeks, progress };
}

// El seguimiento vinculado viaja con el objetivo: la UI muestra su nombre y unidad
const LINKED_TRACKER = { tracker: { select: { id: true, name: true, unit: true, kind: true } } };

const GOAL_WITH_PLAN = {
  ...LINKED_TRACKER,
  weeks: { orderBy: { number: 'asc' }, include: { tasks: { orderBy: { startDate: 'asc' } } } }
};

// Genera el plan sin guardarlo: el usuario lo revisa antes de confirmar
export function previewGoal(req, res) {
  const { plan, fields } = buildGoalAndPlan(req.body);
  if (fields) return invalid(res, fields);
  res.json(plan);
}

export async function createGoal(req, res) {
  const { goal, plan, fields } = buildGoalAndPlan(req.body);
  if (fields) return invalid(res, fields);

  const userId = currentUserId(req);
  const badTracker = await trackerError(goal.trackerId, userId);
  if (badTracker) return invalid(res, badTracker);

  // Los parámetros de generación no se guardan: una vez creado, el plan es editable
  // y la fuente de verdad son sus semanas y tareas
  const { reviewWeek, contents, sessionsPerWeek, ...goalData } = goal;

  // Un único create anidado: Prisma lo ejecuta en una transacción, así que o se
  // guardan el objetivo, sus semanas y sus tareas, o no se guarda nada.
  const created = await prisma.goal.create({
    data: {
      ...goalData,
      userId,
      weeks: {
        create: plan.weeks.map(week => ({
          number: week.number,
          startDate: week.startDate,
          endDate: week.endDate,
          label: week.label,
          target: week.target,
          tasks: { create: week.tasks.map(task => ({ ...task, userId })) }
        }))
      }
    },
    include: GOAL_WITH_PLAN
  });

  res.status(201).json(withProgress(created, { keepTasks: true }));
}

export async function listGoals(req, res) {
  const goals = await prisma.goal.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { deadline: 'asc' },
    include: {
      ...LINKED_TRACKER,
      weeks: {
        orderBy: { number: 'asc' },
        include: { tasks: { select: { done: true, kind: true } } }
      }
    }
  });

  // La lista necesita el resumen de cada semana (cuota, hecho, etiqueta) pero no
  // las tareas: esas se piden al desplegar el plan.
  res.json(goals.map(goal => withProgress(goal, { keepTasks: false })));
}

export async function getGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const goal = await prisma.goal.findFirst({
    where: { id, userId: currentUserId(req) },
    include: GOAL_WITH_PLAN
  });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);

  res.json(withProgress(goal, { keepTasks: true }));
}

// Edita los datos básicos. Lo que se copió a las tareas al crear el plan se
// actualiza en la misma transacción: el título del hito y la categoría.
// Las etiquetas de las fases no se tocan: son editables y pueden estar personalizadas.
export async function updateGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const { data, fields, error } = validateGoalUpdate(req.body);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  const userId = currentUserId(req);
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);

  if (data.trackerId && goal.strategy !== 'fases') {
    return invalid(res, { trackerId: 'Solo los objetivos por fases se vinculan a un seguimiento' });
  }
  const badTracker = await trackerError(data.trackerId, userId);
  if (badTracker) return invalid(res, badTracker);

  // Al cerrar se guarda cuándo; al reabrir se borra. Cambiar entre logrado y
  // abandonado no mueve la fecha de cierre.
  if (data.status === 'activo') data.closedAt = null;
  else if (data.status && goal.status === 'activo') data.closedAt = new Date();

  const goalTasks = { goalWeek: { goalId: goal.id } };
  const updated = await prisma.$transaction(async (tx) => {
    if (data.title && data.title !== goal.title) {
      await tx.task.updateMany({ where: { ...goalTasks, kind: 'hito' }, data: { title: milestoneTitle(data.title) } });
    }
    if (data.type && data.type !== goal.type) {
      await tx.task.updateMany({ where: goalTasks, data: { category: TYPE_LABELS[data.type] } });
    }
    return tx.goal.update({ where: { id: goal.id }, data, include: GOAL_WITH_PLAN });
  });

  res.json(withProgress(updated, { keepTasks: true }));
}

export async function deleteGoal(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  // Cascade en la base: borra también sus semanas y las tareas de esas semanas
  const { count } = await prisma.goal.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (count === 0) return notFound(res, GOAL_NOT_FOUND);

  res.json({ ok: true });
}

// Registra una sesión de un objetivo por fases el día que se hizo. Es una Task
// ya hecha, en esa fecha y vinculada a la semana que la contiene: así aparece en
// el calendario y se borra/desmarca como cualquier otra tarea.
// Si el objetivo tiene seguimiento, puede traer además una medición ({ value,
// note }), que se guarda como registro del seguimiento en la misma transacción.
// Son hechos distintos (constancia y rendimiento): borrar la sesión no borra el registro.
export async function logSession(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const { data: entry, fields } = validateEntry(req.body, { valueRequired: false });
  if (hasErrors(fields)) return invalid(res, fields);
  const { date } = entry;

  const userId = currentUserId(req);
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);
  const closed = closedGoalError(goal);
  if (closed) return invalid(res, closed);
  if (goal.strategy !== 'fases') {
    return invalid(res, { strategy: 'Solo los objetivos por fases registran sesiones' });
  }
  const measured = entry.value !== undefined;
  if (measured && !goal.trackerId) {
    return invalid(res, { value: 'El objetivo no tiene un seguimiento vinculado' });
  }

  const week = await prisma.goalWeek.findFirst({
    where: { goalId: goal.id, startDate: { lte: date }, endDate: { gte: date } }
  });
  if (!week) return invalid(res, { date: 'La fecha está fuera del plazo del objetivo' });

  const [session] = await prisma.$transaction([
    prisma.task.create({
      data: {
        title: `${week.label} · sesión`,
        startDate: date,
        endDate: date,
        done: true,
        kind: 'sesion',
        category: TYPE_LABELS[goal.type],
        userId,
        goalWeekId: week.id,
        trackerId: goal.trackerId // suma actividad al seguimiento del objetivo
      },
      include: TASK_WITH_GOAL
    }),
    ...(measured ? [prisma.trackerEntry.create({ data: { ...entry, trackerId: goal.trackerId } })] : [])
  ]);
  res.status(201).json(session);
}

// Busca objetivo + semana del usuario a partir de la URL, para editar el plan.
// Devuelve { goal, week } o la respuesta de error ya enviada (null). Un objetivo
// cerrado no se edita.
async function findGoalWeek(req, res) {
  const id = parseId(req.params.id);
  const weekId = parseId(req.params.weekId);
  if (!id || !weekId) {
    invalid(res, { id: 'id inválido' });
    return null;
  }
  const goal = await prisma.goal.findFirst({ where: { id, userId: currentUserId(req) } });
  const week = goal && await prisma.goalWeek.findFirst({ where: { id: weekId, goalId: goal.id } });
  if (!week) {
    notFound(res, goal ? 'Semana no encontrada' : GOAL_NOT_FOUND);
    return null;
  }
  const closed = closedGoalError(goal);
  if (closed) {
    invalid(res, closed);
    return null;
  }
  return { goal, week };
}

// Edita etiqueta y/o cuota de una semana. Con applyToPhase, el cambio se aplica a
// todas las semanas del objetivo con la misma etiqueta: una "fase" es justamente
// el conjunto de semanas con la misma etiqueta, así que renombrarla o cambiarle
// la cuota es un updateMany por etiqueta.
export async function updateWeek(req, res) {
  const found = await findGoalWeek(req, res);
  if (!found) return;
  const { goal, week } = found;

  const { data, fields, applyToPhase, error } = validateWeekUpdate(req.body, goal.strategy);
  if (hasErrors(fields)) return invalid(res, fields);
  if (error) return res.status(400).json({ error });

  if (applyToPhase) {
    await prisma.goalWeek.updateMany({ where: { goalId: goal.id, label: week.label }, data });
  } else {
    await prisma.goalWeek.update({ where: { id: week.id }, data });
  }

  // Devuelve el objetivo completo: la UI refresca el plan y el progreso de una vez
  const updated = await prisma.goal.findUnique({ where: { id: goal.id }, include: GOAL_WITH_PLAN });
  res.json(withProgress(updated, { keepTasks: true }));
}

// Agrega un contenido a una semana de un objetivo por contenido. Ocupa toda la
// semana, como los generados; la cuota de la semana sube sola (es derivada).
export async function addWeekTask(req, res) {
  const found = await findGoalWeek(req, res);
  if (!found) return;
  const { goal, week } = found;

  if (goal.strategy !== 'divisible') {
    return invalid(res, { strategy: 'Solo los objetivos por contenido agregan contenidos' });
  }
  const fields = {};
  const title = requiredText(req.body?.title, 100, 'title', fields, 'El título es obligatorio');
  if (hasErrors(fields)) return invalid(res, fields);

  const task = await prisma.task.create({
    data: {
      title,
      startDate: week.startDate,
      endDate: week.endDate,
      category: TYPE_LABELS[goal.type],
      userId: goal.userId,
      goalWeekId: week.id
    },
    include: TASK_WITH_GOAL
  });
  res.status(201).json(task);
}

// Cambia la fecha límite. resizePlan (pura) decide qué cambia; acá se aplica en
// una transacción: o se aplica el cambio entero o nada.
export async function changeDeadline(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, { id: 'id inválido' });

  const goal = await prisma.goal.findFirst({
    where: { id, userId: currentUserId(req) },
    include: GOAL_WITH_PLAN
  });
  if (!goal) return notFound(res, GOAL_NOT_FOUND);
  const closed = closedGoalError(goal);
  if (closed) return invalid(res, closed);

  const { data, fields } = validateDeadlineChange(req.body, goal);
  if (hasErrors(fields)) return invalid(res, fields);

  let ops;
  try {
    ops = resizePlan(goal, goal.weeks, data.deadline);
  } catch (err) {
    if (err instanceof PlanError) return invalid(res, { [err.field]: err.message });
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const { id: weekId, ...weekData } of ops.updateWeeks) {
      await tx.goalWeek.update({ where: { id: weekId }, data: weekData });
    }
    // Última semana: la última conservada, o la última creada si se extendió
    let lastWeekId = goal.weeks[goal.weeks.length - ops.deleteWeekIds.length - 1].id;
    for (const week of ops.createWeeks) {
      lastWeekId = (await tx.goalWeek.create({ data: { ...week, goalId: goal.id } })).id;
    }
    for (const { id: taskId, ...taskData } of ops.updateTasks) {
      await tx.task.update({ where: { id: taskId }, data: taskData });
    }
    if (ops.milestone) {
      const { id: taskId, date } = ops.milestone;
      await tx.task.update({ where: { id: taskId }, data: { startDate: date, endDate: date, goalWeekId: lastWeekId } });
    }
    // Recién al final: borrar una semana borra sus tareas (cascade), así que
    // antes hay que sacar de ellas todo lo que se conserva (tareas e hito)
    await tx.goalWeek.deleteMany({ where: { id: { in: ops.deleteWeekIds } } });
    return tx.goal.update({ where: { id: goal.id }, data: { deadline: data.deadline }, include: GOAL_WITH_PLAN });
  });

  res.json(withProgress(updated, { keepTasks: true }));
}
