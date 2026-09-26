// Respuestas de error esperables, con el formato común de la API
export function invalid(res, fields) {
  return res.status(400).json({ error: 'Datos inválidos', fields });
}

export function notFound(res, message) {
  return res.status(404).json({ error: message });
}
