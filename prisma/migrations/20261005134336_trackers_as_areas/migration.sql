-- Seguimientos como áreas con ítems. Renombres (Prisma los vería como borrar y
-- crear, perdiendo los datos), así que los datos se pasan a mano:
--   Board        -> Tracker      (el seguimiento: "Gimnasio", "Facultad")
--   Tracker      -> TrackerItem  (sus ítems: "Press banca", "Lógica")
--   BoardShare   -> TrackerShare
-- Los ids de tableros e ítems se conservan. Para los seguimientos nuevos se
-- usan ids desplazados (máximo id de tablero + id viejo), así el mapeo es
-- aritmético y no hacen falta tablas auxiliares:
--   - un seguimiento suelto de ACTIVIDAD (ej. "FACULTAD") pasa a ser un
--     seguimiento: id = B + id viejo. Se conserva además como ítem adentro
--     solo si tiene registros u objetivos (para no perderlos).
--   - los sueltos de MEDICIÓN pasan a ser ítems de un seguimiento "General"
--     por usuario: id = B + T + userId.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Tracker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "sourceTrackerId" INTEGER,
    CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tracker_sourceTrackerId_fkey" FOREIGN KEY ("sourceTrackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TrackerItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'medicion',
    "unit" TEXT,
    "higherIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "trackerId" INTEGER NOT NULL,
    "sourceItemId" INTEGER,
    CONSTRAINT "TrackerItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackerItem_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackerItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "TrackerItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TrackerShare" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" INTEGER NOT NULL,
    "trackerId" INTEGER NOT NULL,
    CONSTRAINT "TrackerShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackerShare_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 1. Tableros -> seguimientos (mismo id; la copia apunta a su original)
INSERT INTO "new_Tracker" ("id", "name", "description", "createdAt", "userId", "sourceTrackerId")
SELECT "id", "name", "description", "createdAt", "userId", "sourceBoardId" FROM "Board";

-- 2. Sueltos de actividad -> seguimientos (id = B + id viejo)
INSERT INTO "new_Tracker" ("id", "name", "createdAt", "userId")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM "Board") + t."id", t."name", t."createdAt", t."userId"
FROM "Tracker" t WHERE t."boardId" IS NULL AND t."kind" = 'actividad';

-- 3. Un seguimiento "General" por usuario con sueltos de medición (id = B + T + userId)
INSERT INTO "new_Tracker" ("id", "name", "userId")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM "Board") + (SELECT COALESCE(MAX("id"), 0) FROM "Tracker") + t."userId", 'General', t."userId"
FROM "Tracker" t WHERE t."boardId" IS NULL AND t."kind" = 'medicion'
GROUP BY t."userId";

-- 4. Ítems: todos los que estaban en un tablero, los de medición y los de
--    actividad sueltos que tengan registros u objetivos (mismo id)
INSERT INTO "TrackerItem" ("id", "name", "kind", "unit", "higherIsBetter", "createdAt", "userId", "trackerId", "sourceItemId")
SELECT t."id", t."name", t."kind", t."unit", t."higherIsBetter", t."createdAt", t."userId",
  CASE
    WHEN t."boardId" IS NOT NULL THEN t."boardId"
    WHEN t."kind" = 'actividad' THEN (SELECT COALESCE(MAX("id"), 0) FROM "Board") + t."id"
    ELSE (SELECT COALESCE(MAX("id"), 0) FROM "Board") + (SELECT COALESCE(MAX("id"), 0) FROM "Tracker") + t."userId"
  END,
  t."sourceTrackerId"
FROM "Tracker" t
WHERE t."boardId" IS NOT NULL OR t."kind" = 'medicion'
   OR EXISTS (SELECT 1 FROM "TrackerEntry" e WHERE e."trackerId" = t."id")
   OR EXISTS (SELECT 1 FROM "Goal" g WHERE g."trackerId" = t."id");

-- Una copia cuyo original no quedó como ítem queda desvinculada
UPDATE "TrackerItem" SET "sourceItemId" = NULL
WHERE "sourceItemId" IS NOT NULL AND "sourceItemId" NOT IN (SELECT "id" FROM "TrackerItem");

-- 5. Registros: de su ítem (mismo id)
CREATE TABLE "new_TrackerEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "value" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "TrackerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackerItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TrackerEntry" ("id", "date", "value", "note", "createdAt", "itemId")
SELECT "id", "date", "value", "note", "createdAt", "trackerId" FROM "TrackerEntry";

-- 6. Objetivos: vinculados al ítem (mismo id)
CREATE TABLE "new_Goal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "deadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "itemId" INTEGER,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackerItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("id", "title", "description", "type", "strategy", "startDate", "deadline", "status", "closedAt", "createdAt", "userId", "itemId")
SELECT "id", "title", "description", "type", "strategy", "startDate", "deadline", "status", "closedAt", "createdAt", "userId", "trackerId" FROM "Goal";

-- 7. Tareas: si su seguimiento viejo quedó como ítem, ítem + su seguimiento;
--    si pasó a ser un seguimiento (suelto de actividad), solo el seguimiento
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
    "itemId" INTEGER,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_goalWeekId_fkey" FOREIGN KEY ("goalWeekId") REFERENCES "GoalWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackerItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("id", "title", "description", "startDate", "endDate", "done", "priority", "kind", "category", "createdAt", "userId", "goalWeekId", "trackerId", "itemId")
SELECT t."id", t."title", t."description", t."startDate", t."endDate", t."done", t."priority", t."kind", t."category", t."createdAt", t."userId", t."goalWeekId",
  CASE
    WHEN t."trackerId" IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM "TrackerItem" i WHERE i."id" = t."trackerId") THEN (SELECT i."trackerId" FROM "TrackerItem" i WHERE i."id" = t."trackerId")
    ELSE (SELECT COALESCE(MAX("id"), 0) FROM "Board") + t."trackerId"
  END,
  CASE WHEN EXISTS (SELECT 1 FROM "TrackerItem" i WHERE i."id" = t."trackerId") THEN t."trackerId" ELSE NULL END
FROM "Task" t;

-- 8. Compartidos: tableros compartidos -> seguimientos compartidos (mismo id)
INSERT INTO "TrackerShare" ("id", "createdAt", "groupId", "trackerId")
SELECT "id", "createdAt", "groupId", "boardId" FROM "BoardShare";

CREATE TABLE "new_ShareJoin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "ShareJoin_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "TrackerShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareJoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShareJoin" ("id", "joinedAt", "shareId", "userId") SELECT "id", "joinedAt", "shareId", "userId" FROM "ShareJoin";

-- 9. Fuera lo viejo, adentro lo nuevo
DROP TABLE "ShareJoin";
DROP TABLE "BoardShare";
DROP TABLE "Task";
DROP TABLE "Goal";
DROP TABLE "TrackerEntry";
DROP TABLE "Tracker";
DROP TABLE "Board";
ALTER TABLE "new_Tracker" RENAME TO "Tracker";
ALTER TABLE "new_TrackerEntry" RENAME TO "TrackerEntry";
ALTER TABLE "new_Goal" RENAME TO "Goal";
ALTER TABLE "new_Task" RENAME TO "Task";
ALTER TABLE "new_ShareJoin" RENAME TO "ShareJoin";

CREATE INDEX "Tracker_userId_idx" ON "Tracker"("userId");
CREATE INDEX "Tracker_sourceTrackerId_idx" ON "Tracker"("sourceTrackerId");
CREATE INDEX "TrackerItem_userId_idx" ON "TrackerItem"("userId");
CREATE INDEX "TrackerItem_trackerId_idx" ON "TrackerItem"("trackerId");
CREATE INDEX "TrackerItem_sourceItemId_idx" ON "TrackerItem"("sourceItemId");
CREATE INDEX "TrackerEntry_itemId_date_idx" ON "TrackerEntry"("itemId", "date");
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");
CREATE INDEX "Task_goalWeekId_idx" ON "Task"("goalWeekId");
CREATE INDEX "Task_trackerId_idx" ON "Task"("trackerId");
CREATE INDEX "Task_itemId_idx" ON "Task"("itemId");
CREATE INDEX "Task_userId_startDate_idx" ON "Task"("userId", "startDate");
CREATE INDEX "TrackerShare_trackerId_idx" ON "TrackerShare"("trackerId");
CREATE UNIQUE INDEX "TrackerShare_groupId_trackerId_key" ON "TrackerShare"("groupId", "trackerId");
CREATE INDEX "ShareJoin_userId_idx" ON "ShareJoin"("userId");
CREATE UNIQUE INDEX "ShareJoin_shareId_userId_key" ON "ShareJoin"("shareId", "userId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
