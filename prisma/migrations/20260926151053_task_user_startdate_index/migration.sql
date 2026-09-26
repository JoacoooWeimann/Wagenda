-- DropIndex
DROP INDEX "Task_startDate_idx";

-- DropIndex
DROP INDEX "Task_userId_idx";

-- CreateIndex
CREATE INDEX "Task_userId_startDate_idx" ON "Task"("userId", "startDate");
