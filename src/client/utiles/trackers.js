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

// Body para crear o editar un seguimiento a partir del formulario
export function buildTrackerPayload(form) {
  return {
    name: form.name,
    unit: form.unit,
    higherIsBetter: form.higherIsBetter,
    type: form.type === '' ? null : form.type
  };
}
