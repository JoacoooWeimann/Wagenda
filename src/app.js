import express from 'express';
import morgan from 'morgan';
import path from 'path';
import indexRoutes from './routes/index.js';
import taskRoutes from './routes/tasks.js';
import goalRoutes from './routes/goals.js';
import trackerRoutes from './routes/trackers.js';
import boardRoutes from './routes/boards.js';
import { exposeCurrentPath } from './middlewares/locals.js';
import { notFound, errorHandler } from './middlewares/errors.js';

// Arma la app sin ponerla a escuchar: así los tests pueden levantarla en un
// puerto libre (listen(0)) y con su propia base de datos.
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

// Una línea por pedido (método, URL, status, tiempo); en producción y tests no hace falta
if (!['production', 'test'].includes(process.env.NODE_ENV)) app.use(morgan('dev'));

app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(express.json());
app.use(exposeCurrentPath);

app.use(indexRoutes);
app.use(taskRoutes);
app.use(goalRoutes);
app.use(trackerRoutes);
app.use(boardRoutes);

// Van después de las rutas: Express recorre los middlewares en orden de registro
app.use(notFound);
app.use(errorHandler);

export default app;
