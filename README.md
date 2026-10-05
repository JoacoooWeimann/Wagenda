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
| **React** (como "islas") | Inicio, calendario, objetivos, seguimientos y grupos | La interactividad está concentrada en widgets: React se monta en un `<div>` de cada vista EJS en vez de convertir todo en una SPA |
| **Vite** | Compila el código de React | Un punto de entrada por isla (`app.js`, `goals.js`); React va en un chunk común que el navegador descarga una sola vez |
| **Prisma 6 + SQLite** | Modelo de datos, migraciones y consultas | SQLite no necesita un servidor aparte. Prisma está fijado en la versión 6 porque la 7 cambia el flujo clásico de generación del cliente |
| **node:test** | Tests unitarios y de integración | Viene incluido en Node: no suma dependencias |
| **node:crypto** | Hash de contraseñas (scrypt) y tokens de sesión | Viene incluido en Node: el login no suma dependencias (ver "Autenticación") |
| **helmet** | Encabezados de seguridad (CSP, anti-iframe, HSTS) | Es el estándar de Express para esto: buenos valores por defecto y una CSP configurable (ver "Seguridad en producción") |

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

## Despliegue (Railway)

La app está lista para [Railway](https://railway.com) (`railway.json`): cada push
a la rama conectada despliega solo.

1. **Nuevo proyecto → Deploy from GitHub repo** y elegir el repositorio (rama `main`).
2. **Volumen persistente:** agregar un volumen montado en `/data`. Ahí viven la
   base y los backups; sin volumen, cada deploy empezaría con la base vacía.
3. **Variables de entorno:**

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `file:/data/wagenda.db` |
   | `NODE_ENV` | `production` |
   | `BACKUP_DIR` | `/data/backups` (opcional: es el valor por defecto con esa base) |

4. **Dominio:** Settings → Networking → Generate Domain (HTTPS automático).

Al desplegar, Railway corre `npm run build:prod` y arranca con
`npm run start:prod` (aplica las migraciones y levanta el servidor). Considera
el deploy sano cuando `GET /health` responde `200`, y antes de reemplazar la
versión anterior le manda `SIGTERM`: la app termina los pedidos en curso y
cierra la base.

**Backups:** todos los días se hace una copia de la base en `BACKUP_DIR` y se
guardan los últimos 7 (`BACKUP_KEEP`). Están en el mismo volumen: protegen
contra errores (un borrado, una migración fallida), no contra perder el volumen.
Para una copia fuera del servidor, descargarla de vez en cuando con
`railway ssh` (o `railway run`) y `cat /data/backups/<archivo> > copia.db`.

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
| `npm run build:prod` | `prisma generate` + build del cliente (lo usa Railway al desplegar) |
| `npm run start:prod` | `migrate deploy` + servidor: aplica las migraciones pendientes y arranca |
| `npm run backup` | Hace el backup del día a mano (el mismo mecanismo que el automático) |
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
  routes/                Definición de endpoints (auth, tasks, goals, trackers + items, groups, páginas)
  controllers/           Orquestan: validar → consultar/guardar → responder
  middlewares/           Sesión (loadUser, requireAuth), errores y datos comunes a las vistas
  utiles/                Utilidades del backend (sin dependencia de Express)
    db.js                  Cliente de Prisma compartido
    dates.js               Convención de fechas (ver abajo)
    currentUser.js         Único punto que decide el usuario del pedido
    auth/                  Hash de contraseñas y sesiones
    groups/                Código de invitación y sincronización de copias (sharing.js)
    schedule/              Huecos libres (slots.js, compartido con el cliente) y carga de la agenda
    queries.js / responses.js
    validation/            Validación de entrada (funciones puras)
    planning/              Algoritmo de planificación y cambio de plazo (funciones puras)
    trackers.js            Resumen de valores y actividad (funciones puras)
  views/                 Plantillas EJS
  public/                Archivos estáticos (CSS, imágenes, build de Vite)
    css/main.css           Design tokens (la paleta) y estilos base
    css/layout.css         Navegación: barra lateral o inferior
  client/                Todo lo que compila Vite (separado del backend)
    main.jsx / home.jsx / goals.jsx / trackers.jsx / groups.jsx   Una entrada por isla
    components/home/       DayCard y DayAgenda (la card del día y su línea de tiempo)
    components/week/       WeekPage y RoutineForm (Mi semana)
    components/calendar/   Calendar, DayModal, DayPanel, TaskItem, TaskForm, SessionLogger
    components/goals/      GoalsPage, GoalForm, GoalCard, PlanWeeks, GoalInfoForm, DeadlineForm
    components/trackers/   TrackersPage, TrackerSection, ItemCard, formularios, gráficos (Sparkline, ActivityBars)
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
      ├─< DayWindow / RoutineBlock   (Mi semana: franja de cada día y rutina fija)
      ├─< Tracker ─< TrackerItem ─< TrackerEntry   (seguimientos, sus ítems y los registros)
      │   Task >─○ Tracker / TrackerItem          (tarea que suma actividad)
      │   Goal >─○ TrackerItem                    (objetivo por fases vinculado a un ítem)
      └─< GroupMember >─ Group       (grupos de amigos)
          Group ─< TrackerShare >─ Tracker      (seguimiento compartido en un grupo)
          TrackerShare ─< ShareJoin >─ User     ("Unirme")
          Tracker/TrackerItem ─○ source         (copias vinculadas al original)
```

| Modelo | Campos clave |
|---|---|
| `User` | `name` (visible), `username` (único, para entrar), `passwordHash` |
| `Session` | `tokenHash` (único), `expiresAt` |
| `Task` | `title`, `startDate`/`endDate`, `priority`, `done`, `kind`, `goalWeekId?`, `trackerId?` + `itemId?` (seguimiento e ítem a los que suma), `startMinute?`/`endMinute?` (horario), `routineBlockId?` (rutina hecha), `category?` (solo tareas de objetivos) |
| `Goal` | `title`, `type` (académico, físico, videojuego, profesional), `strategy` (divisible, fases), `startDate`, `deadline`, `status` (activo, logrado, abandonado), `closedAt?`, `itemId?`, `sessionMinutes?` + `timePreference?` (planificación con horarios) |
| `GoalWeek` | `number`, `startDate`/`endDate`, `label` (ej. "Unidad 3 · TP 2", "Intensidad"), `target` (cuota) |
| `Tracker` | `name`, `description?`, `itemLabel?` ("Ejercicio", "Materia") |
| `TrackerItem` | `name`, `kind` (medicion, actividad), `unit?`, `higherIsBetter`, `trackerId` |
| `TrackerEntry` | `date`, `value`, `note?` |
| `Group` | `name`, `description?`, `inviteCode` (único), `weeklyLimit?` |
| `DayWindow` | `weekday` (0 = lunes), `startMinute`, `endMinute` (único por usuario y día) |
| `RoutineBlock` | `weekday`, `startMinute`, `endMinute`, `title`, `trackerId?` |
| `GroupMember` | `role` (owner, member) |

- Las tareas de un plan **son `Task` comunes**: aparecen en el calendario y se
  editan, marcan o borran como cualquier otra.
- `Task.kind` distingue `tarea` (tarea común o contenido de un plan), `sesion`
  (sesión registrada de un objetivo por fases) e `hito` (la marca de fecha límite).
- `Task` referencia solo la semana; el objetivo se obtiene a través de ella, así
  no puede quedar una tarea con un objetivo y una semana que no se corresponden.
- Todo tiene `onDelete: Cascade`: borrar un objetivo borra sus semanas y sus
  tareas, y borrar un seguimiento borra sus ítems y registros. Las
  excepciones son los vínculos (`SetNull`): borrar un seguimiento o un ítem no
  borra las tareas ni los objetivos vinculados.

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
  Sin horarios, no se fijan días: el usuario **registra cada sesión el día que
  la hace**. Con horarios (ver 9), las sesiones se planifican con día y hora y
  se tildan al hacerlas; igual se pueden registrar sesiones extra.
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

### 9. Planificación con horarios
Un objetivo puede planificarse **en el tiempo libre real** del usuario: cada
sesión queda con día y horario, sin pisar su rutina.

- **Mi semana:** el usuario carga la franja en la que está disponible cada día
  de la semana (si no, 08:00–23:00) y su rutina fija (trabajo, cursada,
  entrenamiento), opcionalmente vinculada a un seguimiento. Los bloques de un
  mismo día no se superponen.
- **Horarios en minutos desde las 00:00** (`540` = 09:00), en hora local, igual
  que las fechas de calendario: un entero se compara y se suma sin zonas
  horarias. Nada cruza la medianoche.
- **Tiempo libre de un día** (`freeSlots`, `schedule/slots.js`): la franja menos
  la rutina, las tareas con horario y lo ya ubicado, con **15 minutos de
  margen** alrededor de cada cosa.
- **Entrada:** por fases, cuánto dura cada sesión; por contenido, cuánto lleva
  cada uno ("Unidad · 6 · 120 min") y el tope de una sentada. Y un horario
  preferido: mañana (6–12), tarde (12–19), noche (19–24) o cualquiera.
- **Algoritmo** (`planning/schedule.js`, puro):
  1. Las N sesiones de la semana se reparten **parejas** en sus días (días ideales).
  2. En cada día, el primer hueco que entra **dentro del horario preferido**; si
     no hay, cualquier hueco del día (`pickSlot`).
  3. Si el día ideal no tiene lugar, se prueban **los días siguientes** de la
     semana y después los anteriores.
  4. Lo ubicado ocupa lugar: dos sesiones no se pisan.
  5. Sin lugar en toda la semana, la sesión queda **sin horario** en su día
     ideal y la vista previa **avisa** (para liberar tiempo o moverla).
- Por contenido, cada contenido se divide en sentadas parejas de hasta el tope
  ("Unidad 3 · 1/2", "2/2"), redondeadas a 5 minutos; la cuota de la semana
  pasa a contar sentadas.
- **El algoritmo sigue siendo puro:** el controller arma la "agenda" (franjas,
  rutina y tareas con horario del rango, `schedule/agenda.js`) y se la pasa.
  Por eso se testea sin base de datos.
- **Cambiar el plazo:** las semanas nuevas reciben sesiones ubicadas igual; al
  acortar, las sesiones pendientes planificadas de las semanas quitadas se
  descartan (amontonadas inflarían la última semana) y lo que se mueve queda
  sin horario.
- **Objetivos anteriores:** sin `sessionMinutes`, el plan es el de siempre. No
  se movió nada.
- **Bloques que cruzan la medianoche** (trabajo de 22:00 a 06:00) se guardan como
  dos tramos, uno en cada día (`splitOvernight`): todo lo demás sigue
  trabajando con intervalos de un solo día.
- **Rutina hecha:** en la agenda del día, cada bloque de rutina se tilda si se
  hizo ("fui al gimnasio"), solo hoy o días pasados. Tildarlo crea una tarea
  hecha de ese día con su horario y su seguimiento (`Task.routineBlockId`, única
  por bloque y fecha): suma actividad, aparece en el calendario y en los
  rankings como cualquier tarea. Destildarlo la borra. Borrar el bloque no borra
  ese historial (`SetNull`).

## Seguimientos

Un **seguimiento** es un área que se sigue en el tiempo **sin fecha límite**:
el gimnasio, la facultad, el trabajo. Adentro tiene **ítems**: los ejercicios
del gimnasio, las materias de la facultad, los proyectos del trabajo. Cada
seguimiento elige cómo se llaman sus ítems (`itemLabel`: "Ejercicio",
"Materia"), y la pantalla dice "+ Agregar ejercicio".

- **Dos tipos de ítem:** de **medición** (se cargan valores con fecha: press
  banca en kg, la nota de un parcial) o de **actividad** (cuenta tareas hechas:
  "Lógica", "Cardio"). Un seguimiento puede mezclarlos.
- **Las tareas se clasifican eligiendo un seguimiento y, si se quiere, uno de
  sus ítems** ("Facultad › Lógica", o solo "Facultad" para "Inscribirme a
  finales"). Si viene el ítem, el seguimiento es el suyo: el servidor lo
  completa y rechaza combinaciones inconsistentes.
- **Actividad:** cada tarea hecha suma a su seguimiento y a su ítem. El
  seguimiento suma **todas** sus tareas (con o sin ítem), así se ve cuánto se
  trabaja en el área; cada ítem, solo las suyas. La página muestra esta
  semana, el total y un gráfico de barras de las últimas 8 semanas.
  - **Qué fecha cuenta:** la de la tarea (su fin: el día en que tenía que estar
    hecha), no el momento en que se marcó. Es simple y no agrega un campo.
  - El servidor devuelve la actividad como `[{ date, count }]` (tareas hechas
    por día, con `groupBy`); las semanas las arma el cliente, que es quien sabe
    qué día es hoy.
- **Resumen de un ítem de medición** (último valor, mejor marca, variación):
  se calcula a partir de los registros; la mejor marca depende de
  `higherIsBetter` (en 5 km, menos es mejor).
- **Objetivo y seguimiento son cosas distintas.** El objetivo mide
  *constancia* (sesiones contra una cuota, con plazo); el seguimiento mide
  *rendimiento*. Un objetivo por fases puede vincularse a un ítem: cada sesión
  suma actividad ahí y, si el ítem es de medición, puede cargar el valor en la
  misma transacción. Borrar la sesión no borra el registro: son hechos distintos.
- **Por qué una entidad aparte** y no un objetivo sin fecha límite: el
  algoritmo, el progreso y el ritmo dependen del plazo. Además, los
  seguimientos son lo que se comparte con amigos (ver Grupos): así hay **un
  único lugar para las mediciones**, y lo compartido nunca tiene fecha límite.
- **Por qué áreas con ítems** (y no un seguimiento por ejercicio): uno quiere
  seguir "el gimnasio" y anotar adentro sus ejercicios; con seguimientos
  sueltos, cada ejercicio quedaba desconectado del resto y no había una
  actividad del área. Antes existía un "tablero" que agrupaba seguimientos;
  pasó a ser el seguimiento, y los seguimientos de adentro, sus ítems.
- **Migración de datos** (hecha a mano: Prisma ve los renombres como borrar y
  crear tablas, y perdería todo): `Board` → `Tracker`, `Tracker` →
  `TrackerItem`, `BoardShare` → `TrackerShare`, conservando los ids. Los
  seguimientos sueltos de actividad pasaron a ser seguimientos; los de medición
  sueltos, ítems de un seguimiento "General" por usuario. Para los ids nuevos se
  usan desplazamientos fijos, así el mapeo es aritmético. Se verificó sobre una
  copia de la base (mismas tareas y registros, `foreign_key_check` vacío) y que
  el resultado coincide con el schema (`migrate diff` vacío).
- Limitación: los valores son numéricos. Los rangos con nombre (ej. "Gold
  Nova") necesitarían una escala ordinal.
- Los gráficos (línea de valores y barras de actividad) son SVG hechos a mano,
  sin librería.

## Grupos

Grupos de amigos para compartir progreso, **siempre de forma opcional**: la app
tiene que servir igual a quien la usa solo.

- **Entrar a un grupo no comparte nada.** Se entra con un código de invitación
  (o su link, `/groups?join=CÓDIGO`). Cada miembro comparte, si quiere, alguno
  de sus seguimientos, y cada uno elige a cuáles **unirse**.
- **Al unirse, recibe una copia** del seguimiento con sus ítems
  (`Tracker.sourceTrackerId`, `TrackerItem.sourceItemId`) y carga ahí sus
  valores y tareas. El grupo ve un **ranking**: la actividad de cada uno en el
  seguimiento (tareas hechas en el gimnasio) y, por cada ítem, mejor marca,
  último valor, mejora o actividad.
- **Solo números:** de las tareas, solo la cantidad (nunca títulos ni fechas);
  de los registros, nunca la nota. Nunca se comparten objetivos ni fechas límite.
- **Participar es por grupo:** unirse en un grupo no te muestra en otro grupo
  donde también esté compartido.
- **Límite semanal (anti-spam):** el grupo puede fijar "N por semana". Cada uno
  carga lo que quiera en su cuenta, pero el ranking solo toma los primeros N de
  cada semana (registros y tareas): nadie infla su marca, y el grupo no le pone
  reglas a los datos personales.
- **Roles:** quien crea el grupo lo administra: lo edita, regenera el código
  (invalida el link anterior), expulsa miembros, transfiere la administración y
  puede quitar un seguimiento compartido (moderación). **No edita seguimientos
  ajenos:** qué se mide y en qué unidad lo define solo su dueño.

### Por qué copias vinculadas
La alternativa era un único seguimiento con registros de varias personas. Con
copias, **cada uno es dueño de sus datos**: si el dueño lo borra o lo deja de
compartir, o alguien sale o es expulsado, nadie pierde mediciones. La copia se
**desvincula** y queda como seguimiento personal con todo su historial. Además,
cada uno puede vincular su objetivo por fases a un ítem de su copia.

El costo es mantener la estructura sincronizada, y está concentrado en un solo
módulo (`utiles/groups/sharing.js`), que los controllers llaman dentro de la
misma transacción que el cambio:
- El dueño agrega, renombra o cambia la unidad de un ítem, o edita el
  seguimiento: se replica en las copias.
- El dueño borra un ítem o lo pasa a otro seguimiento: las copias de ese ítem
  quedan como ítems personales de quien las tenía.
- Una copia está vinculada **mientras su usuario participe en al menos un
  grupo** (si se unió en dos, hay una sola copia).
- Mientras está vinculada, la copia es de solo lectura en su estructura: se
  cargan registros y tareas, pero no se renombra ni se agregan ítems.

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
| `startMinute`, `endMinute` | Opcionales, minutos desde las 00:00: los dos o ninguno, fin después del inicio y solo en tareas de un día. Si la tarea pasa a ser de varios días (ej. al moverla de semana), se borra el horario |
| `trackerId`, `itemId` | Opcionales: seguimiento propio y uno de sus ítems, o `null`. Con `itemId`, el seguimiento sale del ítem. Reemplazan a la categoría escrita (`category` ya no se acepta) |
| `done` | `true` o `false` (booleano estricto) |

### Objetivos

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `POST` | `/api/goals/preview` | Genera el plan **sin guardarlo** | `200` + plan |
| `POST` | `/api/goals` | Genera y guarda objetivo, semanas y tareas | `201` + objetivo |
| `GET` | `/api/goals` | Objetivos con progreso y resumen de semanas (sin tareas) | `200` + lista |
| `GET` | `/api/goals/:id` | Objetivo con semanas, tareas y progreso | `200` + objetivo |
| `PATCH` | `/api/goals/:id` | `{ title?, description?, type?, status?, itemId? }`: edita datos básicos, cierra o reabre, vincula un ítem | `200` + objetivo |
| `PUT` | `/api/goals/:id/deadline` | `{ deadline, today }`: cambia el plazo (ver 7) | `200` + objetivo |
| `DELETE` | `/api/goals/:id` | Borra el objetivo, sus semanas y sus tareas | `200` + `{ ok: true }` |
| `POST` | `/api/goals/:id/sessions` | `{ date, value?, note? }`: registra una sesión (solo por fases); suma actividad al ítem vinculado; con `value` (ítem de medición), también un registro | `201` + tarea |
| `PATCH` | `/api/goals/:id/weeks/:weekId` | `{ label?, target?, applyToPhase? }` (`target` solo por fases, 0–14) | `200` + objetivo |
| `POST` | `/api/goals/:id/weeks/:weekId/tasks` | `{ title }`: agrega un contenido (solo por contenido) | `201` + tarea |

| Campo (crear) | Regla |
|---|---|
| `title` | Obligatorio, 1–100 caracteres |
| `type` | `academico`, `fisico`, `videojuego` o `profesional` |
| `strategy` | `divisible` o `fases`. Si no viene, la sugerida para el tipo |
| `startDate`, `deadline` | `"YYYY-MM-DD"`, `deadline ≥ startDate`, hasta 52 semanas |
| `contents` | Solo `divisible`: `[{ name, count, minutes? }]`, 1–5 tipos, 1–100 de cada uno, sin nombres repetidos. `minutes` (15–1200) es obligatorio con horarios |
| `sessionMinutes` | Opcional, 15–240: planifica con horarios (duración de la sesión o tope de una sentada) |
| `timePreference` | Con horarios: `manana`, `tarde`, `noche` o `cualquiera` (por defecto) |
| `reviewWeek` | Solo `divisible`, booleano (por defecto `true`) |
| `sessionsPerWeek` | Solo `fases`, entero 1–7 |
| `itemId` | Solo `fases`, opcional: id de un ítem propio |

Sobre un objetivo cerrado, todo lo que modifica el plan responde `400` con
`fields.status`.

### Mi semana

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/week` | Las 7 franjas (con la de por defecto si no se configuró) y la rutina | `200` + semana |
| `PUT` | `/api/week/windows/:weekday` | `{ startMinute, endMinute }`: franja de un día (0 = lunes) | `200` + semana |
| `POST` | `/api/routine` | `{ title, weekdays: [0..6], startMinute, endMinute, trackerId? }`: un bloque en varios días a la vez (si alguno se superpone, no se crea ninguno) | `201` + semana |
| `PATCH` | `/api/routine/:id` | Actualiza solo los campos enviados (`weekday`, horario, título, seguimiento) | `200` + semana |
| `DELETE` | `/api/routine/:id` | Borra el bloque (lo que ya se tildó queda) | `200` + semana |
| `PUT` | `/api/routine/:id/done/:date` | Tilda el bloque ese día: crea la tarea hecha (idempotente). La fecha tiene que ser de su día de la semana | `201` + tarea |
| `DELETE` | `/api/routine/:id/done/:date` | Destilda: borra esa tarea | `200` + `{ ok: true }` |

La vista previa y la creación de un objetivo con horarios devuelven además
`warnings` (semanas con sesiones sin lugar); el cambio de plazo también.

### Seguimientos e ítems

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/trackers` | Seguimientos con sus ítems, registros, resúmenes y actividad | `200` + lista |
| `GET` | `/api/trackers/options` | Lista liviana (seguimientos con sus ítems) para elegir en formularios | `200` + lista |
| `POST` | `/api/trackers` | `{ name, description?, itemLabel? }` | `201` + seguimiento |
| `GET` | `/api/trackers/:id` | Un seguimiento completo | `200` + seguimiento |
| `PATCH` | `/api/trackers/:id` | Actualiza solo los campos enviados (no en copias) | `200` + seguimiento |
| `DELETE` | `/api/trackers/:id` | Borra el seguimiento con sus ítems y registros (las tareas quedan) | `200` + `{ ok: true }` |
| `POST` | `/api/trackers/:id/items` | `{ name, kind?, unit?, higherIsBetter? }`: agrega un ítem | `201` + seguimiento |
| `PATCH` | `/api/items/:id` | Edita o pasa a otro seguimiento (`trackerId`) | `200` + seguimiento |
| `DELETE` | `/api/items/:id` | Borra el ítem y sus registros (sus tareas quedan en el seguimiento) | `200` + seguimiento |
| `POST` | `/api/items/:id/entries` | `{ date, value, note? }` (también en copias) | `201` + registro |
| `DELETE` | `/api/items/:id/entries/:entryId` | Borra un registro | `200` + `{ ok: true }` |

| Campo | Regla |
|---|---|
| `name` | Obligatorio, 1–40 caracteres |
| `description` | Opcional, máximo 200 |
| `itemLabel` | Opcional, máximo 20 ("Ejercicio", "Materia") |
| `kind` | `medicion` (por defecto) o `actividad` |
| `unit` | Opcional, máximo 10 caracteres |
| `higherIsBetter` | Booleano (por defecto `true`) |
| `value` | Número finito (`|value| ≤ 10⁹`) |
| `note` | Opcional, máximo 200 caracteres |

Las ediciones de estructura devuelven el seguimiento completo: la página lo
redibuja entero. Sobre una copia vinculada responden `400`.

### Grupos

| Método | Ruta | Descripción | Respuesta OK |
|---|---|---|---|
| `GET` | `/api/groups` | Grupos del usuario (con rol y cantidad de miembros) | `200` + lista |
| `POST` | `/api/groups` | `{ name, description?, weeklyLimit? }`: quien lo crea lo administra | `201` + grupo |
| `POST` | `/api/groups/join` | `{ code }`: entrar con el código de invitación | `201` (o `200` si ya era miembro) + grupo |
| `GET` | `/api/groups/:id` | Miembros y seguimientos compartidos | `200` + grupo |
| `PATCH` | `/api/groups/:id` | Solo administrador | `200` + grupo |
| `DELETE` | `/api/groups/:id` | Solo administrador; las copias quedan como personales | `200` + `{ ok: true }` |
| `POST` | `/api/groups/:id/code` | Regenera el código (solo administrador) | `200` + grupo |
| `POST` | `/api/groups/:id/transfer` | `{ userId }`: pasa la administración | `200` + grupo |
| `DELETE` | `/api/groups/:id/members/me` | Salir (el administrador primero transfiere) | `200` + `{ ok: true }` |
| `DELETE` | `/api/groups/:id/members/:userId` | Expulsar (solo administrador) | `200` + grupo |
| `POST` | `/api/groups/:id/shares` | `{ trackerId }`: compartir un seguimiento propio (no una copia) | `201` + grupo |
| `DELETE` | `/api/groups/:id/shares/:shareId` | Dejar de compartir (el dueño) o quitarlo (el administrador) | `200` + grupo |
| `POST`/`DELETE` | `/api/groups/:id/shares/:shareId/join` | Unirse / dejar de participar | `201`/`200` + grupo |
| `GET` | `/api/groups/:id/shares/:shareId/ranking` | Actividad de cada participante en el seguimiento y resumen por ítem (solo números, con el límite semanal) | `200` + ranking |

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

### Un cálculo de huecos compartido
`schedule/slots.js` (huecos libres, intervalos, `HH:MM`) es puro y sin
dependencias, y lo importan **tanto el servidor como el cliente**: la agenda
que se ve en la card y el planificador usan exactamente el mismo cálculo de
tiempo libre. Es la única excepción a "el cliente no importa código del
backend", justificada porque dos implementaciones podrían no coincidir.

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

### Seguridad en producción
- **`trust proxy`:** en Railway la app está detrás de un proxy HTTPS. Express
  confía en sus encabezados `X-Forwarded-*` para saber que el pedido vino por
  HTTPS (si no, la cookie `Secure` no se mandaría) y cuál es la IP real del
  cliente (para el límite de intentos). Solo en producción: sin proxy, esos
  encabezados los podría falsificar cualquiera.
- **Límite de intentos** (`utiles/auth/rateLimit.js`, sin dependencias): 5
  contraseñas incorrectas seguidas bloquean la cuenta 15 minutos (aunque cambie
  la IP); 20 intentos de login por IP cada 15 minutos; 5 registros por IP por
  hora. Mientras está bloqueado responde `429` **aunque la contraseña sea
  correcta**: si no, el bloqueo le avisaría al atacante cuándo acertó. Vive en
  memoria: alcanza para una instancia; con varias haría falta un almacén compartido.
- **Encabezados (helmet):** una Content-Security-Policy hecha a medida: scripts
  solo propios (no hay scripts en línea), estilos y fuentes propios y del CDN de
  Bootstrap, nadie puede meter la app en un iframe. Si alguien lograra inyectar
  un `<script>`, el navegador no lo ejecuta. HSTS solo en producción.
- **Sesiones vencidas:** además de limpiarse al iniciar sesión, cada 6 horas se
  borran las de todos (`jobs.js`).
- **Backups:** `VACUUM INTO` hace una copia consistente con la app andando (y
  compacta el archivo), sin herramientas externas. Si el servidor estuvo
  apagado a la hora del backup, se hace al arrancar: cada hora se asegura de que
  exista el del día.
- **CI:** GitHub Actions corre los tests y el build en cada push, con la versión
  mínima de Node que declaramos.

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
- **Límite de intentos:** ver "Seguridad en producción".

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
- **Resúmenes y actividad: calculados.** Último valor, mejor marca, variación
  y tareas hechas por semana salen de los registros y las tareas.
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
desarrollo levantado. Hay 334 tests; la lógica de planificación está cubierta
al 100%.

## Roadmap

- [x] **v1.0** — Calendario navegable
- [x] **v1.1** — Tareas persistidas (SQLite + Prisma), rangos, prioridad y categoría
- [x] **v1.2 · Fase 1** — Pulido: fechas independientes de la zona horaria, validación, manejo de errores, índices, UX, tests
- [x] **v1.2 · Fase 2** — Objetivos: plan automático por semanas (por contenido o por fases), cuotas semanales, registro de sesiones, seguimiento y edición del plan
- [x] **v1.3** — Pulido de objetivos (editar datos, cambiar el plazo, cerrar o abandonar) y seguimientos personales, agrupados en tableros y vinculables a objetivos
- [x] **v1.4** — Login y múltiples usuarios: registro, sesiones propias con scrypt, la primera cuenta reclama los datos del invitado
- [x] **v1.5** — Grupos de amigos: tableros compartidos a los que cada miembro elige unirse (copias vinculadas), ranking por seguimiento, límite semanal anti-spam y administración del grupo
- [x] **v2.0** — Rediseño: tema oscuro con design tokens, navegación lateral/inferior y el inicio con la card del día; tareas como mini-cards; seguimientos como áreas con ítems y actividad de las tareas
- [x] Mi semana (franjas y rutina), agenda del día con horarios y planificador de objetivos en el tiempo libre
- [ ] Rediseño de las demás páginas (calendario, objetivos, seguimientos, grupos)
- [x] Rutina que suma actividad a su seguimiento (tildar cada día si se hizo)
- [x] **v2.1** — Producción y seguridad: despliegue en Railway, health check, límite de intentos, encabezados de seguridad, backups diarios, limpieza de sesiones y CI
- [ ] **v2.2** — Cuenta: cambiar nombre y contraseña, cerrar sesión en todos los dispositivos, borrar la cuenta, recuperar el acceso
- [ ] **v2.3** — Rediseño de Calendario, Objetivos y Grupos, guía de primer uso, PWA, términos y privacidad
- [ ] Rangos con nombre en los seguimientos (escala ordinal, ej. rangos de CS2)
