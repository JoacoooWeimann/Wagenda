// Agenda de un día (sin React): la rutina de ese día de la semana, las tareas
// con horario y los huecos libres. Usa el mismo cálculo de huecos que el
// planificador del servidor.
import { freeSlots, overlaps } from './week.js';

export const hasTime = (task) => task.startMinute !== null && task.startMinute !== undefined;

// Rango que muestra la línea de tiempo: la franja del día, estirada si hay
// algo con horario antes o después (una tarea a las 6 cuando la franja empieza a las 8)
export function agendaRange(window, items) {
  return items.reduce(
    (r, i) => ({ startMinute: Math.min(r.startMinute, i.startMinute), endMinute: Math.max(r.endMinute, i.endMinute) }),
    { startMinute: window.startMinute, endMinute: window.endMinute }
  );
}

// Reparte en columnas lo que se superpone, para que no se tape: cada elemento
// va a la primera columna libre; los de un mismo grupo de superposición
// comparten la cantidad de columnas. Devuelve { ...item, column, columns }.
export function layoutColumns(items) {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const result = [];
  let group = [];       // elementos del grupo de superposición actual
  let groupEnd = -1;
  const closeGroup = () => {
    const columns = Math.max(1, ...group.map(g => g.column + 1));
    for (const g of group) result.push({ ...g, columns });
    group = [];
  };
  for (const item of sorted) {
    if (item.startMinute >= groupEnd && group.length) closeGroup();
    const used = new Set(group.filter(g => overlaps(g, item)).map(g => g.column));
    let column = 0;
    while (used.has(column)) column++;
    group.push({ ...item, column });
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  if (group.length) closeGroup();
  return result;
}

// Todo lo de un día para la agenda: rutina y tareas con horario (como
// elementos con tipo), las tareas sin horario aparte, y los huecos libres
// (de al menos `minFree` minutos, para no ofrecer huecos de 5 minutos)
export function buildDayAgenda({ window, routine, tasks, minFree = 30 }) {
  const timed = tasks.filter(hasTime);
  const items = [
    ...routine.map(r => ({ type: 'routine', id: `r${r.id}`, startMinute: r.startMinute, endMinute: r.endMinute, block: r })),
    ...timed.map(t => ({ type: 'task', id: `t${t.id}`, startMinute: t.startMinute, endMinute: t.endMinute, task: t }))
  ];
  return {
    range: agendaRange(window, items),
    items: layoutColumns(items),
    untimed: tasks.filter(t => !hasTime(t)),
    free: freeSlots(window, items).filter(s => s.endMinute - s.startMinute >= minFree)
  };
}
