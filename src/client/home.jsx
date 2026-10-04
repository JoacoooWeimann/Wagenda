import { createRoot } from 'react-dom/client';
import DayCard from './components/home/DayCard.jsx';
import { todayKey } from './utiles/goals.js';
import { parseDateParam } from './utiles/calendar.js';

// "Hoy" es el de la computadora del usuario (el servidor no sabe su zona horaria).
// ?date=YYYY-MM-DD abre un día puntual; si es inválida, se abre hoy.
const container = document.getElementById('home-root');
if (container) {
  const today = todayKey();
  const initialDate = parseDateParam(new URLSearchParams(window.location.search).get('date')) ?? today;
  createRoot(container).render(<DayCard initialDate={initialDate} today={today} />);
}
