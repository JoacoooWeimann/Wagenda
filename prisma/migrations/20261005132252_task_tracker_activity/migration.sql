-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "trackerId" INTEGER,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_goalWeekId_fkey" FOREIGN KEY ("goalWeekId") REFERENCES "GoalWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("category", "createdAt", "description", "done", "endDate", "goalWeekId", "id", "kind", "priority", "startDate", "title", "userId") SELECT "category", "createdAt", "description", "done", "endDate", "goalWeekId", "id", "kind", "priority", "startDate", "title", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_goalWeekId_idx" ON "Task"("goalWeekId");
CREATE INDEX "Task_trackerId_idx" ON "Task"("trackerId");
CREATE INDEX "Task_userId_startDate_idx" ON "Task"("userId", "startDate");
CREATE TABLE "new_Tracker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'medicion',
    "higherIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "boardId" INTEGER,
    "sourceTrackerId" INTEGER,
    CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tracker_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tracker_sourceTrackerId_fkey" FOREIGN KEY ("sourceTrackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tracker" ("boardId", "createdAt", "higherIsBetter", "id", "name", "sourceTrackerId", "unit", "userId") SELECT "boardId", "createdAt", "higherIsBetter", "id", "name", "sourceTrackerId", "unit", "userId" FROM "Tracker";
DROP TABLE "Tracker";
ALTER TABLE "new_Tracker" RENAME TO "Tracker";
CREATE INDEX "Tracker_userId_idx" ON "Tracker"("userId");
CREATE INDEX "Tracker_boardId_idx" ON "Tracker"("boardId");
CREATE INDEX "Tracker_sourceTrackerId_idx" ON "Tracker"("sourceTrackerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Datos: cada categoría escrita a mano (de tareas sueltas) pasa a ser un
-- seguimiento de actividad del usuario, sin importar mayúsculas ni espacios.
-- Si ya tiene un seguimiento propio con ese nombre, se usa ese.
INSERT INTO "Tracker" ("name", "kind", "higherIsBetter", "userId", "createdAt")
SELECT MIN(TRIM(t."category")), 'actividad', 1, t."userId", CURRENT_TIMESTAMP
FROM "Task" t
WHERE t."category" IS NOT NULL AND TRIM(t."category") <> '' AND t."goalWeekId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Tracker" r
    WHERE r."userId" = t."userId" AND r."sourceTrackerId" IS NULL AND LOWER(r."name") = LOWER(TRIM(t."category"))
  )
GROUP BY t."userId", LOWER(TRIM(t."category"));

-- Vincula esas tareas a su seguimiento; la categoría escrita deja de usarse
UPDATE "Task" SET
  "trackerId" = (
    SELECT r."id" FROM "Tracker" r
    WHERE r."userId" = "Task"."userId" AND r."sourceTrackerId" IS NULL AND LOWER(r."name") = LOWER(TRIM("Task"."category"))
    ORDER BY r."id" LIMIT 1
  ),
  "category" = NULL
WHERE "category" IS NOT NULL AND TRIM("category") <> '' AND "goalWeekId" IS NULL;

UPDATE "Task" SET "category" = NULL WHERE "goalWeekId" IS NULL AND "category" IS NOT NULL;

-- Las sesiones de un objetivo con seguimiento suman actividad a ese seguimiento
UPDATE "Task" SET "trackerId" = (
  SELECT g."trackerId" FROM "GoalWeek" w JOIN "Goal" g ON g."id" = w."goalId" WHERE w."id" = "Task"."goalWeekId"
)
WHERE "kind" = 'sesion' AND "trackerId" IS NULL;
