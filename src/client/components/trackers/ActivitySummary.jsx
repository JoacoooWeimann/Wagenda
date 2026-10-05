import { weeklyActivity } from '../../utiles/trackers.js';
import ActivityBars from './ActivityBars.jsx';

// Tareas hechas: esta semana, en total y por semana (últimas 8). La usan el
// seguimiento (todas sus tareas) y cada ítem (las suyas).
export default function ActivitySummary({ activity, today, label }) {
  const { weeks, thisWeek, total } = weeklyActivity(activity ?? [], today);
  const noun = (n) => (n === 1 ? 'tarea hecha' : 'tareas hechas');
  return (
    <div className="tracker-summary">
      <div>
        <span className="tracker-stat-label">Esta semana</span>
        <strong>{thisWeek}</strong>
        <span className="tracker-stat-date">{noun(thisWeek)}</span>
      </div>
      <div>
        <span className="tracker-stat-label">Total</span>
        <strong>{total}</strong>
        <span className="tracker-stat-date">{noun(total)}</span>
      </div>
      <ActivityBars weeks={weeks} label={label} />
    </div>
  );
}
