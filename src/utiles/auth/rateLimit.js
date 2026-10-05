// Límite de intentos (contra fuerza bruta), en memoria y sin dependencias.
// Cuenta intentos por clave (una IP, un usuario) dentro de una ventana de
// tiempo; al pasarse del máximo, la clave queda bloqueada un rato.
//
// En memoria alcanza para un solo servidor (Railway corre una instancia): con
// varias, cada una contaría por su lado y haría falta un almacén compartido.
// Al reiniciar se pierde, lo que solo desbloquea antes de tiempo.
//
// `now` es inyectable para testear sin esperar.

export function createLimiter({ max, windowMs, blockMs = windowMs, maxKeys = 10_000 }) {
  const entries = new Map(); // clave -> { count, windowStart, blockedUntil }

  // Para que la memoria no crezca sin límite, se descartan las vencidas
  function prune(now) {
    if (entries.size < maxKeys) return;
    for (const [key, e] of entries) {
      if (e.blockedUntil <= now && now - e.windowStart >= windowMs) entries.delete(key);
    }
  }

  return {
    // ¿Está bloqueada? Devuelve los segundos que faltan, o 0
    blockedFor(key, now = Date.now()) {
      const e = entries.get(key);
      return e && e.blockedUntil > now ? Math.ceil((e.blockedUntil - now) / 1000) : 0;
    },

    // Suma un intento. Si con este se pasa del máximo, queda bloqueada.
    // Devuelve los segundos de bloqueo (0 si todavía puede seguir).
    hit(key, now = Date.now()) {
      prune(now);
      let e = entries.get(key);
      if (!e || now - e.windowStart >= windowMs) {
        e = { count: 0, windowStart: now, blockedUntil: 0 };
        entries.set(key, e);
      }
      e.count++;
      if (e.count > max) e.blockedUntil = now + blockMs;
      return this.blockedFor(key, now);
    },

    // Un login correcto borra los intentos fallidos de ese usuario
    reset(key) {
      entries.delete(key);
    },

    clear() {
      entries.clear();
    }
  };
}

// Límites de la app:
//   - por IP: 20 intentos de login cada 15 min (frena a un atacante probando
//     muchas cuentas desde un lugar); 5 registros por hora
//   - por usuario: 5 contraseñas incorrectas seguidas -> 15 min de espera
//     (frena probar contraseñas de una cuenta, aunque cambie la IP)
const MINUTE = 60_000;
export const limits = {
  loginByIp: createLimiter({ max: 20, windowMs: 15 * MINUTE }),
  loginByUser: createLimiter({ max: 5, windowMs: 15 * MINUTE }),
  registerByIp: createLimiter({ max: 5, windowMs: 60 * MINUTE })
};

export const resetAllLimits = () => Object.values(limits).forEach(l => l.clear());

// "Probá de nuevo en 3 minutos"
export function retryMessage(seconds) {
  const minutes = Math.ceil(seconds / 60);
  return `Demasiados intentos. Probá de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}
