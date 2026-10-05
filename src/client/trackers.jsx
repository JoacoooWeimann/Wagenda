import { createRoot } from 'react-dom/client';
import TrackersPage from './components/trackers/TrackersPage.jsx';

const container = document.getElementById('trackers-root');
if (container) createRoot(container).render(<TrackersPage />);
