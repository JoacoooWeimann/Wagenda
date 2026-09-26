import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import indexRoutes from './routes/index.js';
import taskRoutes from './routes/tasks.js';
import { apiNotFound, errorHandler } from './middlewares/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use(indexRoutes);
app.use(taskRoutes);

// Van después de las rutas: Express recorre los middlewares en orden de registro
app.use('/api', apiNotFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));