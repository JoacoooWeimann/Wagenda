// Lógica pura de seguimientos del lado del cliente (sin React), para poder testearla.

// Hasta 2 decimales, sin ceros de más: 82.5 -> "82,5", 80 -> "80"
export function formatValue(value, unit) {
  const text = Number(value.toFixed(2)).toLocaleString('es-AR');
  return unit ? `${text} ${unit}` : text;
}

// Variación desde el primer registro, con signo y si es una mejora
export function changeInfo(summary, higherIsBetter, unit) {
  if (!summary || summary.count < 2 || summary.change === 0) return { text: 'sin cambios', kind: 'neutral' };
  const sign = summary.change > 0 ? '+' : '−';
  const improved = (summary.change > 0) === higherIsBetter;
  return { text: `${sign}${formatValue(Math.abs(summary.change), unit)}`, kind: improved ? 'up' : 'down' };
}

// Puntos de una línea SVG (width x height, con margen `pad`). El eje X es el
// tiempo real (no el índice): dos registros separados por un mes quedan más
// lejos que dos del mismo día. Y crece hacia arriba (en SVG crece hacia abajo).
export function sparklinePoints(entries, width, height, pad = 4) {
  if (entries.length === 0) return [];
  const times = entries.map(e => Date.parse(e.date));
  const values = entries.map(e => e.value);
  const [tMin, tMax] = [Math.min(...times), Math.max(...times)];
  const [vMin, vMax] = [Math.min(...values), Math.max(...values)];

  // Con un solo día o un solo valor, el eje correspondiente queda centrado
  const x = (t) => (tMax === tMin ? width / 2 : pad + ((t - tMin) / (tMax - tMin)) * (width - 2 * pad));
  const y = (v) => (vMax === vMin ? height / 2 : height - pad - ((v - vMin) / (vMax - vMin)) * (height - 2 * pad));

  return entries.map((e, i) => ({ x: round(x(times[i])), y: round(y(values[i])) }));
}

const round = (n) => Math.round(n * 10) / 10;

// Body de un seguimiento a partir del formulario
export const buildTrackerPayload = (form) => ({
  name: form.name,
  description: form.description,
  itemLabel: form.itemLabel
});

// Body de un ítem. Uno de actividad no usa unidad ni "mejor es": no se mandan.
export function buildItemPayload(form) {
  const payload = { name: form.name, kind: form.kind };
  if (form.kind === 'medicion') {
    payload.unit = form.unit;
    payload.higherIsBetter = form.higherIsBetter;
  }
  return payload;
}

// Cómo se llaman los ítems de un seguimiento ("Ejercicio"); si no se eligió, "Ítem"
export const itemNoun = (tracker) => tracker?.itemLabel || 'Ítem';

const DAY_MS = 86400000;
const keyToTime = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
// Lunes de la semana de una clave "YYYY-MM-DD", en milisegundos UTC
function mondayOf(key) {
  const time = keyToTime(key);
  const weekday = (new Date(time).getUTCDay() + 6) % 7; // lunes=0
  return time - weekday * DAY_MS;
}

// Actividad por semana: las últimas `weeks` semanas (lunes a domingo, la
// última es la de hoy) con cuántas tareas se hicieron en cada una, más el
// total de esta semana y el histórico. `activity` = [{ date, count }] del servidor.
export function weeklyActivity(activity, today, weeks = 8) {
  const thisMonday = mondayOf(today);
  const counts = Array(weeks).fill(0);
  let total = 0;
  for (const { date, count } of activity) {
    total += count;
    const index = weeks - 1 - Math.round((thisMonday - mondayOf(date.slice(0, 10))) / (7 * DAY_MS));
    if (index >= 0 && index < weeks) counts[index] += count;
  }
  const label = (i) => {
    const d = new Date(thisMonday - (weeks - 1 - i) * 7 * DAY_MS);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };
  return {
    weeks: counts.map((count, i) => ({ label: label(i), count })),
    thisWeek: counts[weeks - 1],
    total
  };
}

// "Gimnasio › Press banca" (o solo "Gimnasio" si no hay ítem)
export const trackerPath = (tracker, item) => (item ? `${tracker.name} › ${item.name}` : tracker.name);
