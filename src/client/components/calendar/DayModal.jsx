import { useEffect } from 'react';
import DayPanel from './DayPanel.jsx';

// Modal de un día en el calendario: solo el overlay y el cierre. El contenido
// es DayPanel, el mismo que usa la card del inicio. Calendar lo monta con
// key = fecha, así al abrir otro día el estado arranca limpio.
export default function DayModal({ title, onClose, ...panel }) {
  // Escape cierra el modal; el listener se quita al desmontarlo
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <DayPanel {...panel} />
        <button type="button" className="calendar-modal-close" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
