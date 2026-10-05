// Barras de actividad por semana, en SVG y sin librería (como Sparkline).
// La última barra es la semana actual y va resaltada.
const WIDTH = 240;
const HEIGHT = 56;
const LABEL = 12;   // alto reservado para la etiqueta de la primera y la última semana
const GAP = 4;

export default function ActivityBars({ weeks, label }) {
  const max = Math.max(1, ...weeks.map(w => w.count));
  const barWidth = (WIDTH - GAP * (weeks.length - 1)) / weeks.length;
  const chart = HEIGHT - LABEL;

  return (
    <svg className="tracker-bars" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {weeks.map((week, i) => {
        // Una semana sin tareas igual se ve: una rayita
        const h = Math.max(2, (week.count / max) * (chart - 4));
        const x = i * (barWidth + GAP);
        return (
          <g key={week.label}>
            <title>{`Semana del ${week.label}: ${week.count} ${week.count === 1 ? 'tarea' : 'tareas'}`}</title>
            <rect x={x} y={chart - h} width={barWidth} height={h} rx="3"
              className={i === weeks.length - 1 ? 'is-current' : week.count === 0 ? 'is-empty' : ''} />
          </g>
        );
      })}
      <text x="0" y={HEIGHT - 1}>{weeks[0].label}</text>
      <text x={WIDTH} y={HEIGHT - 1} textAnchor="end">esta semana</text>
    </svg>
  );
}
