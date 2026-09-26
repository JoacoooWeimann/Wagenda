-- Editada a mano: Prisma no puede inventar el valor de columnas obligatorias
-- nuevas en tablas con filas, así que se calculan desde los datos existentes.
--  * GoalWeek.target: cantidad de tareas de la semana, sin la marca de fecha límite
--  * Task.kind: 'hito' para la marca de fecha límite de un plan, 'tarea' para el resto

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GoalWeek" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "label" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "goalId" INTEGER NOT NULL,
    CONSTRAINT "GoalWeek_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GoalWeek" ("endDate", "goalId", "id", "label", "number", "startDate", "target")
SELECT "endDate", "goalId", "id", "label", "number", "startDate",
       (SELECT COUNT(*) FROM "Task" t
         WHERE t."goalWeekId" = "GoalWeek"."id" AND t."title" NOT LIKE 'Fecha límite:%')
FROM "GoalWeek";
DROP TABLE "GoalWeek";
ALTER TABLE "new_GoalWeek" RENAME TO "GoalWeek";
CREATE UNIQUE INDEX "GoalWeek_goalId_number_key" ON "GoalWeek"("goalId", "number");
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "kind" TEXT NOT NULL DEFAULT 'tarea',
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "goalWeekId" INTEGER,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_goalWeekId_fkey" FOREIGN KEY ("goalWeekId") REFERENCES "GoalWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("category", "createdAt", "description", "done", "endDate", "goalWeekId", "id", "priority", "startDate", "title", "userId", "kind")
SELECT "category", "createdAt", "description", "done", "endDate", "goalWeekId", "id", "priority", "startDate", "title", "userId",
       CASE WHEN "goalWeekId" IS NOT NULL AND "title" LIKE 'Fecha límite:%' THEN 'hito' ELSE 'tarea' END
FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_goalWeekId_idx" ON "Task"("goalWeekId");
CREATE INDEX "Task_userId_startDate_idx" ON "Task"("userId", "startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
