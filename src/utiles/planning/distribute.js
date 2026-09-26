// Reparte un total entero entre casilleros, en proporción a sus pesos, con
// redondeo acumulado:
//
//   repartido hasta i = round(total × pesos acumulados hasta i / suma de pesos)
//   asignado a i      = repartido hasta i − repartido hasta i−1
//
// Propiedades (verificadas en los tests):
//   1. La suma es exactamente `total`.
//   2. En cada casillero, lo repartido acumulado está a ≤ 0,5 del ideal
//      proporcional: el avance nunca se aleja más de media unidad del ritmo parejo.
//   3. Nunca asigna negativos, y es determinista (misma entrada, mismo resultado).
//
// Se usa para repartir unidades entre semanas, semanas entre fases y sesiones entre días.
export function distribute(total, weights) {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError('total debe ser un entero >= 0');
  }
  if (weights.some(w => !(w >= 0))) {
    throw new RangeError('los pesos deben ser números >= 0');
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('no se puede repartir entre casilleros con peso 0');
  }

  let accWeight = 0;
  let prev = 0;
  return weights.map(w => {
    accWeight += w;
    const cumulative = Math.round((total * accWeight) / sum);
    const assigned = cumulative - prev;
    prev = cumulative;
    return assigned;
  });
}
