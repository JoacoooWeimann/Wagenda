// Resumen de un ítem de medición, calculado a partir de sus registros (no se guarda:
// un dato derivado no se desincroniza). `entries` ordenados por fecha ascendente.
//   - last: el registro más reciente
//   - best: la mejor marca, según higherIsBetter (en empate, la primera vez que se logró)
//   - change: variación del último respecto del primero
export function trackerSummary(entries, higherIsBetter) {
  if (entries.length === 0) return { count: 0, last: null, best: null, change: null };

  const better = (a, b) => (higherIsBetter ? a.value > b.value : a.value < b.value);
  const best = entries.reduce((b, e) => (better(e, b) ? e : b));
  const first = entries[0];
  const last = entries.at(-1);

  const pick = (e) => ({ value: e.value, date: e.date });
  return { count: entries.length, last: pick(last), best: pick(best), change: last.value - first.value };
}

// Semana (lunes a domingo, como el calendario) de una fecha UTC a medianoche:
// devuelve el lunes en milisegundos, para agrupar
function weekStart(date) {
  const d = new Date(date);
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000;
}

// Límite anti-spam de un grupo: de cada semana se toman solo los primeros
// `limit` registros (por fecha y, a igual fecha, por orden de carga).
// `entries` ordenados por fecha ascendente. Sin límite (null), quedan todos.
export function limitPerWeek(entries, limit) {
  if (!limit) return entries;
  const perWeek = new Map();
  return entries.filter(entry => {
    const week = weekStart(entry.date);
    const count = perWeek.get(week) ?? 0;
    perWeek.set(week, count + 1);
    return count < limit;
  });
}

// Actividad: cuántas tareas vinculadas se hicieron cada día, como
// [{ date, count }] (solo fechas y cantidades), por seguimiento o por ítem
// según `field` ('trackerId' o 'itemId'). La fecha es la de la tarea: su fin,
// el día en que tenía que estar hecha. Las semanas las arma el cliente, que es
// quien sabe qué día es hoy. Una tarea con ítem también tiene su seguimiento,
// así la actividad del seguimiento incluye la de todos sus ítems.
export async function activityBy(prisma, field, ids) {
  const rows = await prisma.task.groupBy({
    by: [field, 'endDate'],
    where: { [field]: { in: ids }, done: true },
    _count: { _all: true },
    orderBy: { endDate: 'asc' }
  });
  const byId = new Map(ids.map(id => [id, []]));
  for (const row of rows) byId.get(row[field]).push({ date: row.endDate, count: row._count._all });
  return byId;
}

// Total de tareas hechas con el límite semanal de un grupo: de cada semana
// (lunes a domingo) cuentan como mucho `limit`. Sin límite, la suma.
export function cappedActivityTotal(activity, limit) {
  const perWeek = new Map();
  for (const { date, count } of activity) {
    const week = weekStart(date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + count);
  }
  let total = 0;
  for (const count of perWeek.values()) total += limit ? Math.min(count, limit) : count;
  return total;
}
