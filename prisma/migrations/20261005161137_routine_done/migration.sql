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
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "goalWeekId" INTEGER,
    "trackerId" INTEGER,
    "itemId" INTEGER,
    "routineBlockId" INTEGER,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_goalWeekId_fkey" FOREIGN KEY ("goalWeekId") REFERENCES "GoalWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackerItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_routineBlockId_fkey" FOREIGN KEY ("routineBlockId") REFERENCES "RoutineBlock" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("category", "createdAt", "description", "done", "endDate", "endMinute", "goalWeekId", "id", "itemId", "kind", "priority", "startDate", "startMinute", "title", "trackerId", "userId") SELECT "category", "createdAt", "description", "done", "endDate", "endMinute", "goalWeekId", "id", "itemId", "kind", "priority", "startDate", "startMinute", "title", "trackerId", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_goalWeekId_idx" ON "Task"("goalWeekId");
CREATE INDEX "Task_trackerId_idx" ON "Task"("trackerId");
CREATE INDEX "Task_itemId_idx" ON "Task"("itemId");
CREATE INDEX "Task_userId_startDate_idx" ON "Task"("userId", "startDate");
CREATE UNIQUE INDEX "Task_routineBlockId_startDate_key" ON "Task"("routineBlockId", "startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

