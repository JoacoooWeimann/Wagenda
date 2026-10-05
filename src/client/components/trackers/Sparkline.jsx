import { sparklinePoints } from '../../utiles/trackers.js';

// Línea de evolución en SVG, sin librería de gráficos: alcanza con una
// polyline y un punto destacado para el último registro.
const WIDTH = 240;
const HEIGHT = 56;

export default function Sparkline({ entries, label }) {
  const points = sparklinePoints(entries, WIDTH, HEIGHT);
  if (points.length === 0) return null;
  const last = points.at(-1);

  return (
    <svg className="tracker-sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {points.length > 1 && <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} />}
      <circle cx={last.x} cy={last.y} r="3.5" />
    </svg>
  );
}
