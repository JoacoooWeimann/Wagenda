// Componentes chicos compartidos por las islas (calendario y objetivos)

export function FieldError({ message }) {
  return message ? <span className="calendar-field-error">{message}</span> : null;
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="calendar-error" role="alert">
      <span>⚠ {message}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso">✕</button>
    </div>
  );
}
