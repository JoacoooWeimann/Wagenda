import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { config } from './config.js';
import healthRoutes from './routes/health.js';
import indexRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import goalRoutes from './routes/goals.js';
import trackerRoutes from './routes/trackers.js';
import groupRoutes from './routes/groups.js';
import weekRoutes from './routes/week.js';
import { exposeCurrentPath } from './middlewares/locals.js';
import { loadUser, requireAuth } from './middlewares/auth.js';
import { notFound, errorHandler } from './middlewares/errors.js';

// Arma la app sin ponerla a escuchar: así los tests pueden levantarla en un
// puerto libre (listen(0)) y con su propia base de datos.
const app = express();

// Detrás de un proxy (Railway): ver config.trustProxy
app.set('trust proxy', config.trustProxy);
app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

// Una línea por pedido (método, URL, status, tiempo); en producción y tests no hace falta
if (!['production', 'test'].includes(process.env.NODE_ENV)) app.use(morgan('dev'));

app.use(healthRoutes); // antes que todo lo demás: no necesita sesión ni body
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // formularios de login y registro
app.use(exposeCurrentPath);
app.use(loadUser);

app.use(authRoutes);
app.use(indexRoutes); // cada página decide si pide sesión
// Toda la API trabaja sobre datos de un usuario: sin sesión, 401
app.use('/api', requireAuth);
app.use(taskRoutes);
app.use(goalRoutes);
app.use(trackerRoutes);
app.use(groupRoutes);
app.use(weekRoutes);

// Van después de las rutas: Express recorre los middlewares en orden de registro
app.use(notFound);
app.use(errorHandler);

export default app;
