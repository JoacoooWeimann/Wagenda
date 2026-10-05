-- CreateTable
CREATE TABLE "Group" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "weeklyLimit" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardShare" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" INTEGER NOT NULL,
    "boardId" INTEGER NOT NULL,
    CONSTRAINT "BoardShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardShare_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareJoin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "ShareJoin_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "BoardShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareJoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Board" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "sourceBoardId" INTEGER,
    CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Board_sourceBoardId_fkey" FOREIGN KEY ("sourceBoardId") REFERENCES "Board" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Board" ("createdAt", "description", "id", "name", "userId") SELECT "createdAt", "description", "id", "name", "userId" FROM "Board";
DROP TABLE "Board";
ALTER TABLE "new_Board" RENAME TO "Board";
CREATE INDEX "Board_userId_idx" ON "Board"("userId");
CREATE INDEX "Board_sourceBoardId_idx" ON "Board"("sourceBoardId");
CREATE TABLE "new_Tracker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "higherIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "boardId" INTEGER,
    "sourceTrackerId" INTEGER,
    CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tracker_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tracker_sourceTrackerId_fkey" FOREIGN KEY ("sourceTrackerId") REFERENCES "Tracker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tracker" ("boardId", "createdAt", "higherIsBetter", "id", "name", "unit", "userId") SELECT "boardId", "createdAt", "higherIsBetter", "id", "name", "unit", "userId" FROM "Tracker";
DROP TABLE "Tracker";
ALTER TABLE "new_Tracker" RENAME TO "Tracker";
CREATE INDEX "Tracker_userId_idx" ON "Tracker"("userId");
CREATE INDEX "Tracker_boardId_idx" ON "Tracker"("boardId");
CREATE INDEX "Tracker_sourceTrackerId_idx" ON "Tracker"("sourceTrackerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "BoardShare_boardId_idx" ON "BoardShare"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardShare_groupId_boardId_key" ON "BoardShare"("groupId", "boardId");

-- CreateIndex
CREATE INDEX "ShareJoin_userId_idx" ON "ShareJoin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareJoin_shareId_userId_key" ON "ShareJoin"("shareId", "userId");

