# Wagenda

Agenda y calendario personal con planificación de objetivos. Permite organizar
tareas por día (con rangos de fechas, prioridades y categorías) y definir
**objetivos con fecha límite**, para los que un algoritmo propio (sin IA) genera
un plan por semanas que después se puede ajustar a mano.

Es un proyecto de aprendizaje con desarrollo estructurado: versionado semántico,
ramas `develop` → `main` y decisiones técnicas documentadas.

## Stack

| Pieza | Rol | Por qué |
|---|---|---|
| **Node.js + Express 5** | Servidor HTTP y API REST | Express 5 manda automáticamente los errores de los handlers `async` al manejador de errores, sin `try/catch` en cada ruta |
| **EJS** | Vistas renderizadas en el servidor | Las páginas simples (portada, errores, login y registro) no necesitan JavaScript en el cliente |
| **Bootstrap 5.3 + Bootstrap Icons** (CDN) | Base de estilos y los íconos de la navegación | En modo oscuro (`data-bs-theme="dark"`), con sus variables apuntadas a nuestra paleta. Solo el CSS: no se usa su JavaScript |
| **React** (como "islas") | Inicio, calendario, objetivos, seguimientos y grupos | La interactividad está concentrada en dos widgets: React se monta en un `<div>` de cada vista EJS en vez de convertir todo en una SPA |
| **Vite** | Compila el código de React | Un punto de entrada por isla (`app.js`, `goals.js`); React va en un chunk común que el navegador descarga una sola vez |
| **Prisma 6 + SQLite** | Modelo de datos, migraciones y consultas | SQLite no necesita un servidor aparte. Prisma está fijado en la versión 6 porque la 7 cambia el flujo clásico de generación del cliente |
| **node:test** | Tests unitarios y de integración | Viene incluido en Node: no suma dependencias |
| **node:crypto** | Hash de contraseñas (scrypt) y tokens de sesión | Viene incluido en Node: el login no suma dependencias (ver "Autenticación") |

Todo el proyecto usa **ESM** (`import`/`export`) con extensión `.js` explícita en
los imports relativos.

## Instalación

Requiere **Node.js 22.12 o superior** (desarrollado con Node 24): el mínimo que exigen el proyecto y Vite 8 juntos. Está declarado en `engines` de `package.json`.

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
  schema.prisma          Modelo de datos
  migrations/            Historial de migraciones SQL
  seed.js                Usuario invitado (id 1): la primera cuenta registrada se queda con él
src/
  index.js               Punto de entrada: solo app.listen()
  app.js                 Arma la app de Express (middlewares, rutas, errores)
  routes/                Definición de endpoints (auth, tasks, goals, trackers, boards, groups, páginas)
  controllers/           Orquestan: validar → consultar/guardar → responder
  middlewares/           Sesión (loadUser, requireAuth), errores y datos comunes a las vistas
  utiles/                Utilidades del backend (sin dependencia de Express)
    db.js                  Cliente de Prisma compartido
    dates.js               Convención de fechas (ver abajo)
    currentUser.js         Único punto que decide el usuario del pedido
    auth/                  Hash de contraseñas y sesiones
    groups/                Código de invitación y sincronización de copias (sharing.js)
    queries.js / responses.js
    validation/            Validación de entrada (funciones puras)
    planning/              Algoritmo de planificación y cambio de plazo (funciones puras)
    trackers.js            Resumen de un seguimiento (función pura)
  views/                 Plantillas EJS
  public/                Archivos estáticos (CSS, imágenes, build de Vite)
    css/main.css           Design tokens (la paleta) y estilos base
    css/layout.css         Navegación: barra lateral o inferior
  client/                Todo lo que compila Vite (separado del backend)
    main.jsx / home.jsx / goals.jsx / trackers.jsx / groups.jsx   Una entrada por isla
    components/home/       DayCard (la card del día del inicio)
    components/calendar/   Calendar, DayModal, DayPanel, TaskItem, TaskForm, SessionLogger
    components/goals/      GoalsPage, GoalForm, GoalCard, PlanWeeks, GoalInfoForm, DeadlineForm
    components/trackers/   TrackersPage, BoardSection, TrackerCard, TrackerForm, Sparkline
    components/groups/     GroupsPage, GroupDetail, GroupForm, Ranking
    utiles/                Lógica pura del cliente y acceso a la API
test/
  unit/                  Funciones puras (sin servidor ni base)
  api/                   API de punta a punta contra una base de test
  helpers/               Levanta la app de test
```

**Capas del backend:** `routes` → `controllers` → `utiles`. Las rutas solo
conectan URL y handler; los controllers orquestan; `utiles` tiene la lógica
reutilizable. El algoritmo de planificación y la validación son funciones puras:
no saben nada de HTTP ni de la base.

## Modelo de datos

```
User ─┬─< Session                    (sesiones iniciadas)
      ├─< Task                       (tareas sueltas)
      ├─< Goal ─< GoalWeek ─< Task   (tareas de un plan)
      ├─< Board ─○< Tracker          (tableros; un seguimiento está en uno o en ninguno)
      ├─< Tracker ─< TrackerEntry    (seguimientos y sus registros)
      │   Goal >─○ Tracker           (vínculo opcional, solo objetivos por fases)
      └─< GroupMember >─ Group       (grupos de amigos)
          Group ─< BoardShare >─ Board          (tablero compartido en un grupo)
          BoardShare ─< ShareJoin >─ User       ("Unirme")
          Board/Tracker ─○ source               (copias vinculadas al original)
```

| Modelo | Campos clave |
|---|---|
| `User` | `name` (visible), `username` (único, para entrar), `passwordHash` |
| `Session` | `tokenHash` (único), `expiresAt` |
| `Task` | `title`, `startDate`/`endDate`, `priority`, `category`, `done`, `kind`, `goalWeekId?` |
| `Goal` | `title`, `type` (académico, físico, videojuego, profesional), `strategy` (divisible, fases), `startDate`, `deadline`, `status` (activo, logrado, abandonado), `closedAt?`, `trackerId?` |
| `GoalWeek` | `number`, `startDate`/`endDate`, `label` (ej. "Unidad 3 · TP 2", "Intensidad"), `target` (cuota) |
| `Board` | `name`, `description?` |
| `Tracker` | `name`, `unit?`, `higherIsBetter`, `boardId?` |
| `TrackerEntry` | `date`, `value`, `note?` |
| `Group` | `name`, `description?`, `inviteCode` (único), `weeklyLimit?` |
| `GroupMember` | `role` (owner, member) |

- Las tareas de un plan **son `Task` comunes**: aparecen en el calendario y se
  editan, marcan o borran como cualquier otra.
- `Task.kind` distingue `tarea` (tarea común o contenido de un plan), `sesion`
  (sesión registrada de un objetivo por fases) e `hito` (la marca de fecha límite).
- `Task` referencia solo la semana; el objetivo se obtiene a través de ella, así
  no puede quedar una tarea con un objetivo y una semana que no se corresponden.
- Todo tiene `onDelete: Cascade`: borrar un objetivo borra sus semanas y sus
  tareas, y borrar un seguimiento borra sus registros. La excepción es
  `Goal.trackerId` y `Tracker.boardId` (`SetNull`): borrar un seguimiento no
  borra el objetivo, y borrar un tablero no borra sus seguimientos (pasan a
  "Sin tablero").

## Objetivos y planificación

### 1. Semanas
El plazo `[inicio, fecha límite]` se divide en semanas **de lunes a domingo**,
como las filas del calendario. La primera y la última pueden ser parciales; cada
semana tiene una **capacidad** (días disponibles) que se usa como peso. Máximo 52
semanas.

### 2. `distribute(total, pesos)`: el núcleo del algoritmo
Reparte un total entero entre casilleros en proporción a sus pesos, con
**redondeo acumulado**:

```
repartido hasta i = round(total × pesos acumulados hasta i / suma de pesos)
asignado a i      = repartido hasta i − repartido hasta i−1
```

Propiedades, verificadas con tests sobre cientos de combinaciones:
1. La suma es exactamente `total`.
2. En cada casillero, el acumulado está a **≤ 0,5** del reparto ideal: el avance
   nunca se aleja más de media unidad de un ritmo parejo.
3. Nunca asigna negativos y es determinista.

Se usa para repartir contenidos entre semanas, semanas entre fases y cuotas.

### 3. Estrategia "por contenido" (divisible)
Para objetivos del tipo "6 unidades + 4 TP para el 8/11".
- Cada **tipo de contenido se reparte por separado** con `distribute`, así cada
  uno avanza a su propio ritmo parejo; las semanas mezclan tipos
  (`Unidades 1–2 · TP 1`).
- Cada contenido es una tarea que ocupa toda su semana.
- **Repaso** opcional al final. Si la última semana tiene menos de 4 días, el
  repaso ocupa las dos últimas, para que siempre tenga al menos 4 días.
- Las semanas que no reciben contenido llevan una tarea de "Refuerzo".

### 4. Estrategia "por fases"
Para objetivos del tipo "correr 10 km" o "subir de rango".
- Cuatro fases por tipo (ej. físico: Diagnóstico → Consistencia → Intensidad →
  Evaluación). Apertura y cierre duran 1 semana; las dos del medio se reparten el
  resto. Requiere al menos 4 semanas.
- Cada semana tiene una **cuota de sesiones** (proporcional en semanas parciales).
  No se fijan días: el usuario **registra cada sesión el día que la hace**.
- El algoritmo no conoce los tipos de objetivo: el tipo solo elige los textos de
  las fases y la estrategia sugerida. Agregar un tipo es agregar una fila a
  `planning/templates.js`.

### 5. Seguimiento
- **Resumen semanal:** cuota futura, "llevás 1 de 3 · quedan 4 días", cuota
  cumplida, superada o "te faltaron N".
- **Cumplimiento del objetivo:** `Σ min(hecho, cuota) / Σ cuota`. El `min` es por
  semana: el exceso de una semana no compensa la falta de otra, porque el plan
  apunta a la constancia. La fecha límite (hito) no cuenta.
- **Ritmo:** una marca en la barra indica dónde se debería estar según las
  semanas ya cerradas, con "al día" o "atrasado N".

### 6. Edición del plan
La app genera un borrador y el usuario lo ajusta:
- Etiqueta y cuota de cada semana, con opción de aplicar a toda la fase. Una
  **fase es el conjunto de semanas con la misma etiqueta**: renombrarla es un
  `updateMany` por etiqueta, y alargarla es cambiarle la etiqueta a una semana.
- En objetivos por contenido: renombrar, mover de semana, borrar y agregar
  contenidos. Mover una tarea (también desde el calendario) la pasa a la semana
  que contiene su nueva fecha.
- La fecha límite no se mueve como una tarea: se cambia con "Cambiar plazo" (7).
- Título, tipo y descripción se editan. La **estrategia no**: define la
  estructura del plan (contenidos o cuotas); cambiarla es crear otro objetivo.
  Al renombrar, se actualiza el título del hito; al cambiar el tipo, la
  categoría de las tareas. Las etiquetas de las fases no: pueden estar personalizadas.

### 7. Cambiar el plazo
`resizePlan` (en `planning/resize.js`) es una función pura, como `generatePlan`:
recibe el plan guardado y el nuevo plazo, y devuelve las operaciones a aplicar.
La regla prioriza **no perder datos ni pisar lo que el usuario editó**, en vez
de re-planificar:

- El nuevo plazo no puede ser anterior a hoy: **el pasado no se toca**. Como
  las sesiones tienen fecha ≤ hoy, ninguna queda afuera.
- Como el inicio no cambia, las semanas son las mismas en la grilla vieja y en
  la nueva; solo cambia el fin de la última semana conservada.
- **Extender:** se agregan semanas. En fases siguen la última fase, con la cuota
  de la última semana completa (proporcional a los días). En contenido quedan
  como "Semana libre", para completarlas con "Editar plan". Los contenidos que
  cubrían la última semana se estiran con ella.
- **Acortar:** las tareas de las semanas quitadas pasan a la nueva última semana
  (conservando si estaban hechas) y lo que se pasa del plazo se recorta.
- El hito se mueve a la nueva fecha.
- Se aplica en una transacción, **borrando las semanas al final**: el cascade
  borraría las tareas que todavía no se movieron.

### 8. Cerrar un objetivo
Un objetivo se marca como **logrado** (incluso antes de tiempo) o **abandonado**
sin borrarlo, para conservar el historial. Cerrado, es de solo lectura (no se
registran sesiones ni se edita el plan o sus tareas); el calendario oculta lo
pendiente y sigue mostrando lo hecho. **Cerrar no borra nada**: al reabrirlo
vuelve todo. Los cerrados se listan aparte, en "Historial".

## Seguimientos

Un **seguimiento** es algo que se mide en el tiempo **sin fecha límite**: el
peso en press banca (kg), el rating de un juego (pts), el tiempo en 5 km (min).
Cada registro es un valor con fecha y una nota opcional. El resumen (último
valor, mejor marca, variación desde el inicio) **se calcula** a partir de los
registros; la mejor marca depende de `higherIsBetter` (en 5 km, menos es mejor).

- **Objetivo y seguimiento son cosas distintas.** El objetivo mide
  *constancia* (sesiones contra una cuota, con plazo); el seguimiento mide
  *rendimiento*. Un objetivo por fases puede vincularse a uno: al registrar la
  sesión se carga también la medición, en la misma transacción.
- Borrar la sesión no borra la medición: son hechos distintos.
- **Por qué una entidad nueva** y no un objetivo sin fecha límite: el algoritmo,
  el progreso y el ritmo dependen del plazo; hacerlo opcional llenaría todo de
  casos especiales. Además, los seguimientos son la base para compartir
  progreso en grupos (ver Roadmap): así hay **un único lugar para las
  mediciones**, y lo compartido nunca tiene fecha límite.
- **Tableros:** agrupan seguimientos relacionados ("Gimnasio": press banca,
  sentadilla; "CS2": rating, K/D). Un seguimiento está en un solo tablero o en
  ninguno (1-N): así, al compartir un tablero queda claro qué se ve y qué no.
  Borrar un tablero es una acción de organización y no destruye historial.
  Reemplazan a la "categoría" que tenía el seguimiento: dos formas de agrupar
  confundían, y "Gimnasio" dice más que "Físico".
- Limitación: los valores son numéricos. Los rangos con nombre (ej. "Gold
  Nova") necesitarían una escala ordinal.
- El gráfico de evolución es un SVG hecho a mano (una `polyline`), sin
  librería. El eje X es el tiempo real, no el número de registro.

## Grupos

Grupos de amigos para compartir progreso, **siempre de forma opcional**: la app
tiene que servir igual a quien la usa solo.

- **Entrar a un grupo no comparte nada.** Se entra con un código de invitación
  (o su link, `/groups?join=CÓDIGO`). Cada miembro comparte, si quiere, alguno
  de sus tableros, y cada uno elige a qué tableros **unirse**.
- **Al unirse, recibe una copia** del tablero y sus seguimientos en su cuenta
  (`Board.sourceBoardId`, `Tracker.sourceTrackerId`), y carga ahí sus valores.
  El grupo ve un **ranking por seguimiento** (el dueño con el original, los
  demás con su copia), ordenable por mejor marca, último valor o mejora.
- **Solo valores y fechas:** las notas de los registros son privadas. Nunca se
  comparten objetivos, fechas límite, tareas ni otros seguimientos.
- **Participar es por grupo:** unirse a un tablero en un grupo no te muestra en
  otro grupo donde también esté compartido.
- **Límite semanal (anti-spam):** el grupo puede fijar "N registros por
  semana". Cada uno carga lo que quiera en su cuenta, pero el ranking solo toma
  los primeros N de cada semana: nadie infla su marca cargando 50 veces, y el
  grupo no le pone reglas a los datos personales.
- **Roles:** quien crea el grupo lo administra: lo edita, regenera el código
  (invalida el link anterior), expulsa miembros, transfiere la administración y
  puede quitar un tablero compartido (moderación). **No edita tableros ajenos:**
  qué se mide y en qué unidad lo define solo el dueño de cada tablero, porque
  son datos de su cuenta.

### Por qué copias vinculadas
La alternativa era un único seguimiento con registros de varias personas. Con
copias, **cada uno es dueño de sus datos**: si el dueño borra el tablero, lo deja
de compartir, o alguien sale o es expulsado, nadie pierde mediciones. La copia
se **desvincula** y queda como tablero personal con todo su historial. Además,
cada uno puede vincular su objetivo por fases a su copia.

El costo es mantener la estructura sincronizada, y está concentrado en un solo
módulo (`utiles/groups/sharing.js`), que los controllers llaman dentro de la
misma transacción que el cambio:
- El dueño agrega, renombra o cambia la unidad de un seguimiento, o renombra el
  tablero: se replica en las copias.
- El dueño quita o borra un seguimiento: sus copias se desvinculan.
- Una copia está vinculada **mientras su usuario participe del tablero en al
  menos un grupo** (si se unió en dos grupos, hay una sola copia).
- Mientras está vinculada, la copia es de solo lectura en su estructura: se
  cargan registros, pero no se renombra ni se borra.

## API

Todas las rutas de `/api` trabajan sobre los datos del usuario de la sesión.
Sin sesión responden `401`; el cliente redirige al login.

### Autenticación (formularios HTML)

| Método | Ruta | Descripción |
|---|---|---|
| `GET`/`POST` | `/login` | `username`, `password`, `next?`. OK: cookie de sesión y redirección a `next` |
| `GET`/`POST` | `/register` | `name`, `username`, `password`, `passwordConfirm`, `next?` |
| `POST` | `/logout` | Borra la sesión y la cookie |

| Campo | Regla |
|---|---|
| `username` | 3–20 caracteres: letras, números y `_`. Se guarda en minúsculas y es único |
| `name` | Obligatorio, máximo 40: el nombre que ven los demás |
| `password` | 8–200 caracteres (no se recortan espacios) |

### Tareas

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/tasks?year=2026&month=9` | Tareas que tocan ese mes (con su objetivo y semana, si pertenecen a un plan) | `200` + lista |
| `POST` | `/api/tasks` | Crea una tarea | `201` + tarea |
| `PATCH` | `/api/tasks/:id` | Actualiza solo los campos enviados. En una tarea de un plan, cambiar fechas la pasa de semana | `200` + tarea |
| `DELETE` | `/api/tasks/:id` | Borra la tarea | `200` + `{ ok: true }` |

| Campo | Regla |
|---|---|
| `title` | Obligatorio, 1–100 caracteres (se recortan los espacios de los bordes) |
| `description` | Opcional, máximo 1000 caracteres |
| `startDate` | Obligatorio, `"YYYY-MM-DD"` |
| `endDate` | `"YYYY-MM-DD"`, mayor o igual que `startDate`. Si no viene, es igual a `startDate` |
| `priority` | `baja`, `normal` o `alta` (por defecto `normal`) |
| `category` | Opcional, máximo 30 caracteres |
| `done` | `true` o `false` (booleano estricto) |

### Objetivos

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `POST` | `/api/goals/preview` | Genera el plan **sin guardarlo** | `200` + plan |
| `POST` | `/api/goals` | Genera y guarda objetivo, semanas y tareas | `201` + objetivo |
| `GET` | `/api/goals` | Objetivos con progreso y resumen de semanas (sin tareas) | `200` + lista |
| `GET` | `/api/goals/:id` | Objetivo con semanas, tareas y progreso | `200` + objetivo |
| `PATCH` | `/api/goals/:id` | `{ title?, description?, type?, status?, trackerId? }`: edita datos básicos, cierra o reabre, vincula un seguimiento | `200` + objetivo |
| `PUT` | `/api/goals/:id/deadline` | `{ deadline, today }`: cambia el plazo (ver 7) | `200` + objetivo |
| `DELETE` | `/api/goals/:id` | Borra el objetivo, sus semanas y sus tareas | `200` + `{ ok: true }` |
| `POST` | `/api/goals/:id/sessions` | `{ date, value?, note? }`: registra una sesión (solo por fases); con `value`, también un registro del seguimiento vinculado | `201` + tarea |
| `PATCH` | `/api/goals/:id/weeks/:weekId` | `{ label?, target?, applyToPhase? }` (`target` solo por fases, 0–14) | `200` + objetivo |
| `POST` | `/api/goals/:id/weeks/:weekId/tasks` | `{ title }`: agrega un contenido (solo por contenido) | `201` + tarea |

| Campo (crear) | Regla |
|---|---|
| `title` | Obligatorio, 1–100 caracteres |
| `type` | `academico`, `fisico`, `videojuego` o `profesional` |
| `strategy` | `divisible` o `fases`. Si no viene, la sugerida para el tipo |
| `startDate`, `deadline` | `"YYYY-MM-DD"`, `deadline ≥ startDate`, hasta 52 semanas |
| `contents` | Solo `divisible`: `[{ name, count }]`, 1–5 tipos, 1–100 de cada uno, sin nombres repetidos |
| `reviewWeek` | Solo `divisible`, booleano (por defecto `true`) |
| `sessionsPerWeek` | Solo `fases`, entero 1–7 |
| `trackerId` | Solo `fases`, opcional: id de un seguimiento propio |

Sobre un objetivo cerrado, todo lo que modifica el plan responde `400` con
`fields.status`.

### Seguimientos

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/trackers` | Seguimientos con registros y resumen | `200` + lista |
| `POST` | `/api/trackers` | `{ name, unit?, higherIsBetter?, boardId? }` | `201` + seguimiento |
| `GET` | `/api/trackers/:id` | Seguimiento con registros y resumen | `200` + seguimiento |
| `PATCH` | `/api/trackers/:id` | Actualiza solo los campos enviados | `200` + seguimiento |
| `DELETE` | `/api/trackers/:id` | Borra el seguimiento y sus registros | `200` + `{ ok: true }` |
| `POST` | `/api/trackers/:id/entries` | `{ date, value, note? }` | `201` + registro |
| `DELETE` | `/api/trackers/:id/entries/:entryId` | Borra un registro | `200` + `{ ok: true }` |
| `GET` | `/api/boards` | Tableros (sin seguimientos: la página los agrupa por `boardId`) | `200` + lista |
| `POST` | `/api/boards` | `{ name, description? }` | `201` + tablero |
| `PATCH` | `/api/boards/:id` | Actualiza solo los campos enviados | `200` + tablero |
| `DELETE` | `/api/boards/:id` | Borra el tablero; sus seguimientos quedan sin tablero | `200` + `{ ok: true }` |

| Campo | Regla |
|---|---|
| `name` | Obligatorio, 1–40 caracteres |
| `unit` | Opcional, máximo 10 caracteres |
| `higherIsBetter` | Booleano (por defecto `true`) |
| `boardId` | Opcional: id de un tablero propio, o `null` (sin tablero) |
| `name` (tablero) | Obligatorio, 1–40 caracteres; `description` opcional, máximo 200 |
| `value` | Número finito (`|value| ≤ 10⁹`) |
| `note` | Opcional, máximo 200 caracteres |

### Grupos

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/groups` | Grupos del usuario (con rol y cantidad de miembros) | `200` + lista |
| `POST` | `/api/groups` | `{ name, description?, weeklyLimit? }`: quien lo crea lo administra | `201` + grupo |
| `POST` | `/api/groups/join` | `{ code }`: entrar con el código de invitación | `201` (o `200` si ya era miembro) + grupo |
| `GET` | `/api/groups/:id` | Miembros y tableros compartidos | `200` + grupo |
| `PATCH` | `/api/groups/:id` | Solo administrador | `200` + grupo |
| `DELETE` | `/api/groups/:id` | Solo administrador; las copias quedan como personales | `200` + `{ ok: true }` |
| `POST` | `/api/groups/:id/code` | Regenera el código (solo administrador) | `200` + grupo |
| `POST` | `/api/groups/:id/transfer` | `{ userId }`: pasa la administración | `200` + grupo |
| `DELETE` | `/api/groups/:id/members/me` | Salir (el administrador primero transfiere) | `200` + `{ ok: true }` |
| `DELETE` | `/api/groups/:id/members/:userId` | Expulsar (solo administrador) | `200` + grupo |
| `POST` | `/api/groups/:id/shares` | `{ boardId }`: compartir un tablero propio (no una copia) | `201` + grupo |
| `DELETE` | `/api/groups/:id/shares/:shareId` | Dejar de compartir (el dueño) o quitarlo (el administrador) | `200` + grupo |
| `POST`/`DELETE` | `/api/groups/:id/shares/:shareId/join` | Unirse / dejar de participar | `201`/`200` + grupo |
| `GET` | `/api/groups/:id/shares/:shareId/ranking` | Resumen de cada participante por seguimiento (sin notas, con el límite semanal) | `200` + ranking |

| Campo | Regla |
|---|---|
| `name` | Obligatorio, 1–40 caracteres; `description` opcional, máximo 200 |
| `weeklyLimit` | Entero 1–50, o `null` (sin límite) |
| `code` | 8 caracteres; se ignoran espacios, guiones y mayúsculas |

Un grupo del que no sos miembro responde `404`; una acción de administrador
hecha por un miembro, `403`.

### Errores

```json
{ "error": "Datos inválidos", "fields": { "deadline": "La estrategia por fases necesita al menos 4 semanas" } }
```

- `400`: datos inválidos. `fields` trae **todos** los errores juntos, para que el
  formulario marque cada campo. Incluye los errores del algoritmo (`PlanError`),
  como un plazo demasiado corto.
- `404`: el recurso no existe o pertenece a otro usuario (no se distingue, para no revelar qué ids existen).
- `500`: error inesperado. El cliente recibe un mensaje genérico; el detalle queda solo en el log del servidor.

Las rutas `/api/*` responden errores en JSON; las páginas responden la vista
`error.ejs`.

## Decisiones técnicas

### Design tokens y tema oscuro
La paleta vive **solo** en `:root` de `main.css`, como variables CSS
(`--wg-bg`, `--wg-surface`, `--wg-primary`, `--wg-danger`…). El resto del CSS
(y hasta los puntos de prioridad del calendario, que se pintan desde JS) usa
esas variables, así cambiar la paleta es editar un bloque. Bootstrap 5.3 lee sus
colores de variables CSS (`--bs-body-bg`, `--bs-primary`…): se las apunta a
nuestros tokens en vez de pelear con sus estilos. El texto sobre el turquesa es
oscuro (`--wg-on-primary`), para mantener contraste.

### Navegación
Una sola lista de secciones (`partials/navigation.ejs`) que el CSS muestra como
**barra lateral** en pantallas anchas y como **barra inferior** en el celular,
siempre a un toque y sin menú hamburguesa. No usa JavaScript: el menú de
usuario del celular es un `<details>`, y por eso ya no se carga el JS de Bootstrap.

### El inicio: la card del día
Con sesión, `/` muestra un día con sus tareas (`DayCard`), que se recorre como
un carrusel: flechas, teclas ← →, o deslizando en el celular (pointer events
con un umbral de 50 px, sin librería). El contenido del día es `DayPanel`, **el
mismo componente** del modal del calendario: marcar, editar, borrar, agregar y
registrar sesiones funcionan igual en los dos lugares. Las tareas se piden por
mes y quedan en cache, así moverse dentro del mes no hace pedidos. La URL
(`/?date=`) refleja el día, para recargar o compartir. Las fechas se mueven en
UTC (`shiftDay`), así el horario de verano no corre el día.

### Fechas de calendario en UTC
Una tarea de agenda tiene un **día**, no un **instante**. Las fechas viajan como
`"YYYY-MM-DD"` y se guardan como **medianoche UTC** de ese día. El cliente
compara la parte `"YYYY-MM-DD"` como texto (con ceros a la izquierda, el orden
alfabético coincide con el cronológico), así la zona horaria del servidor o del
navegador no interviene.

En v1.1 se comparaban objetos `Date` en hora local: en Argentina (UTC-3), las
tareas de un día no se mostraban y los rangos perdían su último día. Un test de
regresión corre esa lógica en cuatro zonas horarias.

Por el mismo motivo, **"hoy" lo decide el cliente**: el servidor corre en UTC y
a las 22:00 en Argentina ya es el día siguiente. El inicio de un objetivo, la
semana actual y el ritmo se calculan con la fecha de la computadora del usuario.

### Validación como funciones puras
`src/utiles/validation/` no depende de Express ni de Prisma: recibe el body y
devuelve `{ data, fields }`. Se puede testear sin servidor, y `data` solo trae
campos permitidos (whitelist). Las reglas que necesitan la base (comparar con
fechas guardadas, la semana de una tarea) las resuelve el controller.

### Errores esperados e inesperados
Los errores **esperados** (validación, recurso inexistente, `PlanError`) los
responde el controller. Los **inesperados** llegan al middleware `errorHandler`,
que decide en un único lugar el formato de la respuesta y qué se registra en el log.

### Propiedad de los datos
Toda consulta filtra por `id` **y** `userId`, que sale de `currentUserId(req)`.
Hasta la v1.3 devolvía siempre el invitado; con el login pasó a leer la sesión
y **ningún controller cambió**: para eso estaba ese punto único. Un recurso de
otro usuario responde `404`, igual que uno inexistente: no revela que existe.

### Autenticación
- **Contraseñas con scrypt** (`node:crypto`, sin dependencias). Es un hash
  *lento* y *memory-hard*: verificar una contraseña tarda decenas de
  milisegundos y usa 32 MiB, así que probar millones (si se filtrara la base)
  sale muy caro. Parámetros `N=2^15, r=8, p=3`, una de las configuraciones
  mínimas que recomienda OWASP. Cada hash tiene su propio *salt* aleatorio
  (dos contraseñas iguales dan hashes distintos) y guarda sus parámetros, así
  se pueden subir sin invalidar los anteriores. Se compara con
  `timingSafeEqual`.
- **Sesiones en una tabla propia**, en vez de `express-session` o JWT. Al
  loguearse se genera un token de 256 bits aleatorios que va en una cookie; en
  la base se guarda solo su SHA-256 (si se filtrara la base, los tokens no
  sirven). Cerrar sesión es borrar la fila: a diferencia de un JWT, se puede
  revocar. Duran 30 días.
- **Cookie `HttpOnly`** (el JavaScript de la página no la puede leer: un XSS no
  roba la sesión), **`SameSite=Lax`** (el navegador no la manda en un POST que
  venga de otro sitio: corta los ataques CSRF a la API) y **`Secure`** en
  producción (solo por HTTPS).
- **No revela qué usuarios existen:** "usuario inexistente" y "contraseña
  incorrecta" dan el mismo mensaje, y en el primer caso igual se calcula un
  scrypt, para que tarden lo mismo.
- **`next` solo acepta rutas propias** (`/goals`), no `//otro-sitio.com`: si no,
  el login serviría para redirigir a una página falsa (*open redirect*).
- **El usuario invitado:** la primera cuenta registrada se queda con el
  usuario 1 y sus datos. El `updateMany` filtra por `passwordHash: null`, así
  que solo puede pasar una vez.
- **Pendiente:** limitar intentos de login por IP (fuerza bruta online).

### El algoritmo es puro y determinista
`generatePlan` recibe un objetivo validado y devuelve el plan en memoria, sin
tocar la base. Eso permite:
- **Vista previa** sin guardar nada.
- **"Crear plan" reenvía el formulario, no el plan:** el servidor lo vuelve a
  generar (misma entrada, mismo plan) y nunca acepta un plan armado por el
  cliente, que podría traer, por ejemplo, 10.000 tareas.
- **Creación atómica:** un único `prisma.goal.create` con semanas y tareas
  anidadas, que Prisma ejecuta en una transacción.

### Qué se guarda y qué se calcula
- **Cuota por contenido: calculada.** Es la cantidad de contenidos de la semana,
  así mover, agregar o borrar uno la ajusta sola. Un dato derivado no se
  desincroniza.
- **Cuota por fases: guardada.** No sale de ningún otro dato: la decide el usuario.
- **Parámetros de generación (contenidos, sesiones por semana, repaso): no se
  guardan.** Con el plan editable, "6 unidades" dejaría de ser cierto apenas se
  agrega una; la fuente de verdad son las semanas y las tareas.
- **Resumen de un seguimiento: calculado.** Último, mejor marca y variación
  salen de los registros.
- **`Task.kind` explícito** en vez de reconocer el hito por su título: si el
  texto cambia, un cálculo basado en el título se rompe en silencio.

### Migraciones con datos existentes
Dos migraciones se escribieron a mano, porque Prisma no puede decidir qué hacer
con los datos existentes:
- `week_target_task_kind` agrega columnas obligatorias y **calcula sus valores**
  a partir de los datos (cuota = tareas de la semana; `kind = 'hito'` para la
  fecha límite).
- `drop_goal_generation_params` borra columnas; se generó con `prisma migrate diff`
  porque `migrate dev` pide confirmación interactiva cuando se pierden datos.

### Índice compuesto `[userId, startDate]`
La consulta más frecuente es "tareas del usuario en este mes, ordenadas por
fecha". Según `EXPLAIN QUERY PLAN`, con índices separados SQLite usaba solo el de
`userId` y después ordenaba en una estructura temporal. El índice compuesto
filtra, recorta el rango y ordena en un solo paso. Como empieza por `userId`,
también sirve para las búsquedas por foreign key.

### Componentes que se reinician con `key`
`DayModal`, `TaskForm` y los editores del plan se montan con una `key` (el día,
la tarea en edición o los datos de la semana). Cuando la `key` cambia, React crea
el componente de nuevo con estado limpio, en vez de resetearlo a mano.

### Tests aislados
Los tests de integración usan una base SQLite propia por proceso
(`prisma/test-<pid>.db`), creada con las mismas migraciones y borrada al
terminar: nunca tocan `dev.db`. La app escucha en el puerto 0 (el sistema
operativo asigna uno libre), así los tests pueden correr con el servidor de
desarrollo levantado. Hay 254 tests; la lógica de planificación está cubierta
al 100%.

## Roadmap

- [x] **v1.0** — Calendario navegable
- [x] **v1.1** — Tareas persistidas (SQLite + Prisma), rangos, prioridad y categoría
- [x] **v1.2 · Fase 1** — Pulido: fechas independientes de la zona horaria, validación, manejo de errores, índices, UX, tests
- [x] **v1.2 · Fase 2** — Objetivos: plan automático por semanas (por contenido o por fases), cuotas semanales, registro de sesiones, seguimiento y edición del plan
- [x] **v1.3** — Pulido de objetivos (editar datos, cambiar el plazo, cerrar o abandonar) y seguimientos personales, agrupados en tableros y vinculables a objetivos
- [x] **v1.4** — Login y múltiples usuarios: registro, sesiones propias con scrypt, la primera cuenta reclama los datos del invitado
- [x] **v1.5** — Grupos de amigos: tableros compartidos a los que cada miembro elige unirse (copias vinculadas), ranking por seguimiento, límite semanal anti-spam y administración del grupo
- [x] **v2.0** — Rediseño: tema oscuro con design tokens, navegación lateral/inferior y el inicio con la card del día
- [ ] Rediseño de las demás páginas (calendario, objetivos, seguimientos, grupos)
- [ ] Límite de intentos de login (fuerza bruta)
- [ ] Rangos con nombre en los seguimientos (escala ordinal, ej. rangos de CS2)
