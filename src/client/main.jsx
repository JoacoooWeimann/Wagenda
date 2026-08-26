import { createRoot } from 'react-dom/client';
import Calendar from './components/Calendar.jsx'; // 👈 mismo nivel, no './components' desde afuera

const container = document.getElementById('calendar-root');
if (container) {
  const initialYear = parseInt(container.dataset.year, 10) || new Date().getFullYear();
  const initialMonth = parseInt(container.dataset.month, 10) || (new Date().getMonth() + 1);
  createRoot(container).render(
    <Calendar initialYear={initialYear} initialMonth={initialMonth} />
  );
}