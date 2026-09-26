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

// --- Estrategia "divisible": contenidos repartidos entre las semanas ---------
// Cada tipo de contenido (ej. 6 "Unidad" + 4 "TP") se reparte POR SEPARADO con
// distribute: así cada tipo avanza a su propio ritmo parejo y las propiedades de
// distribute valen para cada uno. Cada contenido es una tarea que ocupa su semana.
// Con reviewWeek, las semanas finales se reservan para repaso (ver reviewWeekCount).
export const LABEL_MAX = 50;

export function planDivisible(weeks, { contents, reviewWeek }) {
  const reviewCount = reviewWeekCount(weeks, reviewWeek);
  const contentWeeks = weeks.slice(0, weeks.length - reviewCount);

  // La capacidad (días) es el peso: las semanas parciales reciben menos
  const capacities = contentWeeks.map(w => w.days);
  const countsByType = contents.map(c => distribute(c.count, capacities));
  const nextNumber = contents.map(() => 1);

  const planned = contentWeeks.map((week, i) => {
    const span = { startDate: week.startDate, endDate: week.endDate };
    const tasks = [];
    const labelParts = [];

    contents.forEach((content, t) => {
      const numbers = Array.from({ length: countsByType[t][i] }, () => nextNumber[t]++);
      if (numbers.length === 0) return;
      tasks.push(...numbers.map(n => ({ ...span, title: `${content.name} ${n}` })));
      labelParts.push(numbers.length === 1
        ? `${content.name} ${numbers[0]}`
        : `${pluralize(content.name)} ${numbers[0]}–${numbers.at(-1)}`);
    });

    if (tasks.length === 0) {
      // Pasa cuando hay menos contenidos que semanas: se usa para afianzar lo visto
      const nothingYet = nextNumber.every(n => n === 1);
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

    return { ...week, label: truncate(labelParts.join(' · '), LABEL_MAX), target: tasks.length, tasks };
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

function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
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
