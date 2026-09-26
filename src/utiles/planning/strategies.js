import { distribute } from './distribute.js';
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

export const MIN_REVIEW_DAYS = 4;

// Cuántas semanas finales se reservan para repaso: ninguna si no se pidió o hay
// menos de 3 semanas; 2 si la última es muy corta (el repaso siempre tiene al
// menos MIN_REVIEW_DAYS días) y aun así quedan 2 semanas para el contenido; si no, 1.
export function reviewWeekCount(weeks, reviewWeek) {
  if (!reviewWeek || weeks.length < 3) return 0;
  if (weeks.at(-1).days < MIN_REVIEW_DAYS && weeks.length - 2 >= 2) return 2;
  return 1;
}

// --- Estrategia "divisible": N unidades repartidas entre las semanas ---------
// Cada unidad es una tarea que ocupa toda su semana. Con reviewWeek, las
// semanas finales se reservan para repaso (ver reviewWeekCount).
export function planDivisible(weeks, { totalUnits, unitName = 'Unidad', reviewWeek }) {
  const reviewCount = reviewWeekCount(weeks, reviewWeek);
  const contentWeeks = weeks.slice(0, weeks.length - reviewCount);

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
        target: 1,
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
      target: units.length,
      tasks: units.map(n => ({ ...span, title: `${unitName} ${n}` }))
    };
  });

  // Una tarea por semana de repaso: cada tarea tiene que quedar dentro de su semana
  weeks.slice(weeks.length - reviewCount).forEach((week, i) => {
    const title = reviewCount === 1 ? 'Repaso general' : `Repaso general · parte ${i + 1}/${reviewCount}`;
    planned.push({
      ...week,
      label: 'Repaso',
      target: 1,
      tasks: [{ startDate: week.startDate, endDate: week.endDate, title }]
    });
  });
  return planned;
}

// --- Estrategia "fases": progresión en 4 fases con cuota semanal de sesiones --
// No fija días: el usuario registra cada sesión el día que la hace, y al final
// de la semana se compara lo hecho con la cuota (target).
export function planFases(weeks, { type, sessionsPerWeek }) {
  if (weeks.length < MIN_WEEKS_FASES) {
    throw new PlanError('deadline', `La estrategia por fases necesita al menos ${MIN_WEEKS_FASES} semanas`);
  }

  const phases = PHASE_TEMPLATES[type];
  // Apertura y cierre: 1 semana. Las del medio se reparten el resto en partes iguales.
  const phaseWeeks = [1, ...distribute(weeks.length - 2, [1, 1]), 1];
  const phaseOfWeek = phaseWeeks.flatMap((count, p) => Array(count).fill(phases[p]));

  return weeks.map((week, i) => ({
    ...week,
    label: phaseOfWeek[i].name,
    // Semanas parciales: cuota proporcional a sus días (al menos 1)
    target: Math.min(week.days, Math.max(1, Math.round(sessionsPerWeek * week.days / 7))),
    tasks: []
  }));
}
