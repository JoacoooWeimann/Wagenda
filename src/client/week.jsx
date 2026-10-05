import { createRoot } from 'react-dom/client';
import WeekPage from './components/week/WeekPage.jsx';

const container = document.getElementById('week-root');
if (container) createRoot(container).render(<WeekPage />);
