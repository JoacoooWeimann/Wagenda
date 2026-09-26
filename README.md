# Wagenda

Agenda y calendario personal. Permite organizar tareas por día, con rangos de
fechas, prioridades y categorías. Es un proyecto de aprendizaje con desarrollo
estructurado: versionado semántico, ramas `develop` → `main` y decisiones
técnicas documentadas.

## Stack

| Pieza | Rol | Por qué |
|---|---|---|
| **Node.js + Express 5** | Servidor HTTP y API REST | Express 5 manda automáticamente los errores de los handlers `async` al manejador de errores, sin `try/catch` en cada ruta |
| **EJS** | Vistas renderizadas en el servidor | Las páginas simples (inicio, errores) no necesitan JavaScript en el cliente |
| **React** (como "isla") | Solo el widget interactivo del calendario | La interactividad está concentrada en un componente: React se monta en un `<div>` de la vista EJS en vez de convertir todo en una SPA |
| **Vite** | Compila el código de React | Genera un único `app.js` que Express sirve como archivo estático |
| **Prisma 6 + SQLite** | Modelo de datos, migraciones y consultas | SQLite no necesita un servidor aparte. Prisma está fijado en la versión 6 porque la 7 cambia el flujo clásico de generación del cliente |
| **node:test** | Tests unitarios y de integración | Viene incluido en Node: no suma dependencias |

Todo el proyecto usa **ESM** (`import`/`export`) con extensión `.js` explícita en
los imports relativos.

## Instalación

Requiere **Node.js 22.5 o superior** (desarrollado con Node 24).

```bash
git clone https://github.com/JoacoooWeimann/Wagenda.git
cd Wagenda
cp .env.example .env
npm install
npm run setup     # genera el cliente de Prisma, crea la base, carga el usuario invitado y compila el cliente
npm start         # http://localhost:3000
```

### Desarrollo

Se usan dos terminales:

```bash
npm run dev            # servidor con nodemon (se reinicia al cambiar el backend)
npm run watch:client   # recompila React al guardar cambios
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm start` | Levanta el servidor |
| `npm run dev` | Servidor con recarga automática (ignora `src/client/` y `src/public/`) |
| `npm run build` | Compila el cliente de React en `src/public/build/` |
| `npm run watch:client` | Igual que `build`, pero recompila al guardar |
| `npm run setup` | `prisma generate` + `migrate deploy` + seed + build: deja el proyecto listo desde cero |
| `npm run db:migrate` | Crea y aplica una migración nueva (desarrollo) |
| `npm run db:seed` | Crea el usuario invitado (idempotente) |
| `npm run db:reset` | Borra la base, aplica todas las migraciones y corre el seed |
| `npm test` | Corre todos los tests |
| `npm run test:coverage` | Tests con reporte de cobertura |

## Estructura

```
prisma/
  schema.prisma          Modelo de datos (User, Task, enum Priority)
  migrations/            Historial de migraciones SQL
  seed.js                Usuario invitado (id 1)
src/
  index.js               Punto de entrada: solo app.listen()
  app.js                 Arma la app de Express (middlewares, rutas, errores)
  routes/                Definición de endpoints
  controllers/           Lógica de negocio y llamadas a Prisma
  middlewares/           Manejo de errores y datos comunes a las vistas
  utiles/                Utilidades del backend
    db.js                  Cliente de Prisma compartido
    dates.js               Convención de fechas (ver abajo)
    validation/            Validación de entrada (funciones puras)
  views/                 Plantillas EJS
  public/                Archivos estáticos (CSS, imágenes, build de Vite)
  client/                Todo lo que compila Vite (separado del backend)
    main.jsx               Monta el calendario en #calendar-root
    components/            Componentes de React
    utiles/                Lógica pura del cliente y acceso a la API
test/
  unit/                  Funciones puras (sin servidor ni base)
  api/                   API de punta a punta contra una base de test
  helpers/               Levanta la app de test
```

**Capas del backend:** `routes` → `controllers` → `utiles`. Las rutas solo
conectan URL y handler; los controllers orquestan (validar → consultar →
responder); `utiles` tiene funciones reutilizables sin dependencia de Express.

## API

Todas las rutas trabajan sobre las tareas del usuario actual (por ahora, el
invitado con id 1).

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/tasks?year=2026&month=9` | Tareas que tocan ese mes (incluye rangos que empiezan o terminan en otro mes) | `200` + lista |
| `POST` | `/api/tasks` | Crea una tarea | `201` + tarea |
| `PATCH` | `/api/tasks/:id` | Actualiza solo los campos enviados | `200` + tarea |
| `DELETE` | `/api/tasks/:id` | Borra la tarea | `200` + `{ ok: true }` |

**Campos de una tarea**

| Campo | Regla |
|---|---|
| `title` | Obligatorio, 1–100 caracteres (se recortan los espacios de los bordes) |
| `description` | Opcional, máximo 1000 caracteres |
| `startDate` | Obligatorio, `"YYYY-MM-DD"` |
| `endDate` | `"YYYY-MM-DD"`, mayor o igual que `startDate`. Si no viene, es igual a `startDate` |
| `priority` | `baja`, `normal` o `alta` (por defecto `normal`) |
| `category` | Opcional, máximo 30 caracteres |
| `done` | `true` o `false` (booleano estricto) |

Cualquier otro campo del body se ignora: por ejemplo, el cliente no puede
cambiar `userId`.

**Formato de errores**

```json
{ "error": "Datos inválidos", "fields": { "title": "El título es obligatorio" } }
```

- `400`: datos inválidos. `fields` trae **todos** los errores juntos, para que el formulario marque cada campo.
- `404`: la tarea no existe o pertenece a otro usuario (no se distingue, para no revelar qué ids existen).
- `500`: error inesperado. El cliente recibe un mensaje genérico; el detalle queda solo en el log del servidor.

Las rutas `/api/*` responden errores en JSON; las páginas responden la vista
`error.ejs`.

## Decisiones técnicas

### Fechas de calendario en UTC
Una tarea de agenda tiene un **día**, no un **instante**. Las fechas viajan como
`"YYYY-MM-DD"` y se guardan como **medianoche UTC** de ese día. El cliente
compara la parte `"YYYY-MM-DD"` como texto (con ceros a la izquierda, el orden
alfabético coincide con el cronológico), así la zona horaria del servidor o del
navegador no interviene.

En v1.1 se comparaban objetos `Date` en hora local: en Argentina (UTC-3), las
tareas de un día no se mostraban y los rangos perdían su último día. Un test de
regresión corre esa lógica en cuatro zonas horarias.

### Validación como funciones puras
`src/utiles/validation/` no depende de Express ni de Prisma: recibe el body y
devuelve `{ data, fields }`. Se puede testear sin servidor, y `data` solo trae
campos permitidos (whitelist). La única regla que necesita la base (en un PATCH,
comparar la fecha nueva con la guardada) la resuelve el controller.

### Errores esperados e inesperados
Los errores **esperados** (validación, tarea inexistente) los responde el
controller. Los **inesperados** llegan al middleware `errorHandler`, que decide
en un único lugar el formato de la respuesta y qué se registra en el log.

### Propiedad de los datos
`update` y `delete` filtran por `id` **y** `userId`. Con varios usuarios, nadie
puede modificar tareas ajenas. Hoy hay un solo usuario, pero así el login futuro
solo cambia de dónde sale el `userId`.

### Índice compuesto `[userId, startDate]`
La consulta más frecuente es "tareas del usuario en este mes, ordenadas por
fecha". Según `EXPLAIN QUERY PLAN`, con índices separados SQLite usaba solo el de
`userId` y después ordenaba en una estructura temporal. El índice compuesto
filtra, recorta el rango y ordena en un solo paso. Como empieza por `userId`,
también sirve para las búsquedas por foreign key.

### Tests aislados
Los tests de integración usan una base SQLite propia por proceso
(`prisma/test-<pid>.db`), creada con las mismas migraciones y borrada al
terminar: nunca tocan `dev.db`. La app escucha en el puerto 0 (el sistema
operativo asigna uno libre), así los tests pueden correr con el servidor de
desarrollo levantado.

## Roadmap

- [x] **v1.0** — Calendario navegable
- [x] **v1.1** — Tareas persistidas (SQLite + Prisma), rangos, prioridad y categoría
- [x] **v1.2 · Fase 1** — Pulido: fechas independientes de la zona horaria, validación, manejo de errores, índices, UX, tests
- [ ] **v1.2 · Fase 2** — Objetivos y planificación: el usuario define un objetivo con fecha límite y un algoritmo propio (sin IA) genera un plan por semanas (`Goal` → `GoalWeek` → `Task`)
- [ ] Login y múltiples usuarios
