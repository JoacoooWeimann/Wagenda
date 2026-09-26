import { distribute } from './distribute.js';
import { addDays } from '../dates.js';
import { PHASE_TEMPLATES } from './templates.js';

// Error de planificación esperable (ej. plazo demasiado corto): el controller
// lo responde como 400 asociado a un campo.
export class PlanError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'PlanError';
    this.field = field;
  }
}

export const MIN_WEEKS_FASES = 4;

// Plural básico del español para el nombre de la unidad (alcanza para
// "Unidad", "Capítulo", "Nivel", "Lección", "Tema", "Módulo"...)
export function pluralize(word) {
  if (/[aeiouáéó]$/i.test(word)) return word + 's';
  if (/ón$/i.test(word)) return word.slice(0, -2) + 'ones';
  return word + 'es';
}

// --- Estrategia "divisible": N unidades repartidas entre las semanas ---------
// Cada unidad es una tarea que ocupa toda su semana. Con reviewWeek (y al menos
// 3 semanas), la última semana se reserva para repaso.
export function planDivisible(weeks, { totalUnits, unitName = 'Unidad', reviewWeek }) {
  const withReview = reviewWeek && weeks.length >= 3;
  const contentWeeks = withReview ? weeks.slice(0, -1) : weeks;

  // La capacidad (días) es el peso: las semanas parciales reciben menos unidades
  const counts = distribute(totalUnits, contentWeeks.map(w => w.days));

  let nextUnit = 1;
  const planned = contentWeeks.map((week, i) => {
    const units = Array.from({ length: counts[i] }, () => nextUnit++);
    const span = { startDate: week.startDate, endDate: week.endDate };

    if (units.length === 0) {
      // Pasa cuando hay menos unidades que semanas: se usa para afianzar lo visto
      const nothingYet = nextUnit === 1;
      return {
        ...week,
        label: nothingYet ? 'Preparación' : 'Refuerzo',
        tasks: [{
          ...span,
          title: nothingYet ? 'Organizar materiales y plan de trabajo' : 'Repasar lo visto hasta ahora'
        }]
      };
    }

    const label = units.length === 1
      ? `${unitName} ${units[0]}`
      : `${pluralize(unitName)} ${units[0]}–${units.at(-1)}`;
    return {
      ...week,
      label,
      tasks: units.map(n => ({ ...span, title: `${unitName} ${n}` }))
    };
  });

  if (withReview) {
    const last = weeks.at(-1);
    planned.push({
      ...last,
      label: 'Repaso',
      tasks: [{ startDate: last.startDate, endDate: last.endDate, title: 'Repaso general' }]
    });
  }
  return planned;
}

// --- Estrategia "fases": progresión en 4 fases con sesiones en días puntuales --
export function planFases(weeks, { type, sessionsPerWeek }) {
  if (weeks.length < MIN_WEEKS_FASES) {
    throw new PlanError('deadline', `La estrategia por fases necesita al menos ${MIN_WEEKS_FASES} semanas`);
  }

  const phases = PHASE_TEMPLATES[type];
  // Apertura y cierre: 1 semana. Las del medio se reparten el resto en partes iguales.
  const phaseWeeks = [1, ...distribute(weeks.length - 2, [1, 1]), 1];
  const phaseOfWeek = phaseWeeks.flatMap((count, p) => Array(count).fill(phases[p]));

  return weeks.map((week, i) => {
    const phase = phaseOfWeek[i];

    // Semanas parciales: sesiones proporcionales a sus días (al menos 1)
    const sessions = Math.min(week.days, Math.max(1, Math.round(sessionsPerWeek * week.days / 7)));

    // Qué días de la semana llevan sesión: se reparten entre los días disponibles
    const perDay = distribute(sessions, Array(week.days).fill(1));
    const dayOffsets = perDay.flatMap((n, d) => (n > 0 ? [d] : []));

    return {
      ...week,
      label: phase.name,
      tasks: dayOffsets.map((offset, k) => {
        const date = addDays(week.startDate, offset);
        return {
          startDate: date,
          endDate: date,
          title: `${phase.name} · sesión ${k + 1}/${sessions}`,
          description: phase.description
        };
      })
    };
  });
}
