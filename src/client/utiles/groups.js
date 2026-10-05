// Lógica pura de grupos del lado del cliente (sin React), para poder testearla.

export const RANKING_MODES = [
  { value: 'best', label: 'Mejor marca' },
  { value: 'last', label: 'Último' },
  { value: 'change', label: 'Mejora' }
];

// Valor por el que se ordena una fila según el modo, "más alto = mejor"
// (si en el seguimiento menos es mejor, se invierte el signo). null = sin registros.
function score(summary, mode, higherIsBetter) {
  if (summary.count === 0) return null;
  const sign = higherIsBetter ? 1 : -1;
  if (mode === 'best') return sign * summary.best.value;
  if (mode === 'last') return sign * summary.last.value;
  return sign * summary.change; // mejora desde el primer registro
}

// Ordena las filas del ranking de un seguimiento. Los que no cargaron nada van
// al final; a igual valor, se respeta el orden original (sort es estable).
export function sortRanking(rows, mode, higherIsBetter) {
  return rows
    .map(row => ({ row, value: score(row.summary, mode, higherIsBetter) }))
    .sort((a, b) => (a.value === null) - (b.value === null) || (b.value ?? 0) - (a.value ?? 0))
    .map(({ row }) => row);
}

// Valor a mostrar en la columna del modo elegido
export function rankingValue(summary, mode) {
  if (summary.count === 0) return null;
  if (mode === 'best') return summary.best.value;
  if (mode === 'last') return summary.last.value;
  return summary.change;
}

// Link de invitación que se comparte con amigos
export const inviteLink = (code, origin) => `${origin}/groups?join=${code}`;

// Tableros que se pueden compartir en un grupo: los originales (no copias) que
// todavía no están compartidos ahí
export function shareableBoards(boards, group) {
  const shared = new Set(group.shares.map(s => s.board.id));
  return boards.filter(b => !b.sharedBy && !shared.has(b.id));
}

// Lo que escribe el usuario en el campo del código (el servidor normaliza igual)
export const normalizeCode = (value) => value.replace(/[\s-]/g, '').toUpperCase();
