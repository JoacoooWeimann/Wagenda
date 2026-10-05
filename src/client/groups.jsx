import { createRoot } from 'react-dom/client';
import GroupsPage from './components/groups/GroupsPage.jsx';

const container = document.getElementById('groups-root');
if (container) createRoot(container).render(<GroupsPage me={{ id: Number(container.dataset.userId) }} />);
