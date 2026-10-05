// Tareas periódicas del servidor (no corren en los tests: las arranca index.js).
// Devuelve una función para detenerlas en el apagado.
export function startJobs() {
  const timers = [];
  return () => timers.forEach(clearInterval);
}
