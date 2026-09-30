// Resumen de un seguimiento, calculado a partir de sus registros (no se guarda:
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
