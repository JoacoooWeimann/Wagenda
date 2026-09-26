import { createRoot } from 'react-dom/client';
import GoalsPage from './components/goals/GoalsPage.jsx';

const container = document.getElementById('goals-root');
if (container) createRoot(container).render(<GoalsPage />);
