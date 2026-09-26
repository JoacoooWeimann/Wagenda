import express from 'express';
import morgan from 'morgan';
import path from 'path';
import indexRoutes from './routes/index.js';
import taskRoutes from './routes/tasks.js';
import { exposeCurrentPath } from './middlewares/locals.js';
import { notFound, errorHandler } from './middlewares/errors.js';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

// Una línea por pedido (método, URL, status, tiempo); en producción no hace falta
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(express.json());
app.use(exposeCurrentPath);

app.use(indexRoutes);
app.use(taskRoutes);

// Van después de las rutas: Express recorre los middlewares en orden de registro
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
