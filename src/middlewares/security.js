import helmet from 'helmet';
import { config } from '../config.js';

// Encabezados de seguridad (helmet). La Content-Security-Policy dice de dónde
// puede cargar cosas la página: si alguien lograra inyectar un <script>, el
// navegador no lo ejecuta. Está hecha a medida de lo que usa la app:
//   - scripts: solo los nuestros (/build, compilados por Vite); no hay scripts en línea
//   - estilos y fuentes: los nuestros y el CDN de Bootstrap / Bootstrap Icons
//   - imágenes: las nuestras y data: (Bootstrap dibuja flechas y checks así)
//   - frame-ancestors 'none': nadie puede meter la app en un iframe (clickjacking)
// Los estilos que pone React (style={{ ... }}) no se bloquean: los aplica por
// JavaScript, no como atributos en el HTML.
const CDN = 'https://cdn.jsdelivr.net';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", CDN],
      fontSrc: ["'self'", CDN],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      // En producción todo va por HTTPS; en desarrollo (http://localhost) no
      ...(config.isProduction ? { upgradeInsecureRequests: [] } : {})
    }
  },
  // HSTS ("usá siempre HTTPS") solo tiene sentido en producción
  strictTransportSecurity: config.isProduction ? { maxAge: 15552000 } : false
});
