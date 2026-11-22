-- The single-user to-do list is gone: its table only held anonymous demo tasks.
-- DropTable
DROP TABLE "tasks";

-- CreateTable
CREATE TABLE "boards" (
    "id" VARCHAR(16) NOT NULL,
    "keyHash" BYTEA NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "boardId" VARCHAR(16) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "tokenHash" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "boardId" VARCHAR(16) NOT NULL,
    "id" UUID NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "position" TEXT COLLATE "C",
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "columns_pkey" PRIMARY KEY ("boardId","id")
);

-- CreateTable
CREATE TABLE "cards" (
    "boardId" VARCHAR(16) NOT NULL,
    "id" UUID NOT NULL,
    "columnId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'med',
    "dueDate" DATE,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT COLLATE "C",
    "fieldVersions" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("boardId","id")
);

-- CreateTable
CREATE TABLE "board_events" (
    "boardId" VARCHAR(16) NOT NULL,
    "seq" INTEGER NOT NULL,
    "clientOpId" UUID,
    "actorId" UUID,
    "type" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_events_pkey" PRIMARY KEY ("boardId","seq")
);

-- CreateIndex
CREATE INDEX "boards_lastActivityAt_idx" ON "boards"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "participants_tokenHash_key" ON "participants"("tokenHash");

-- CreateIndex
CREATE INDEX "participants_boardId_idx" ON "participants"("boardId");

-- Order keys compare byte by byte, as in JavaScript (see packages/shared/src/positions.ts).
-- CreateIndex
CREATE UNIQUE INDEX "columns_boardId_position_key" ON "columns"("boardId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "cards_boardId_columnId_position_key" ON "cards"("boardId", "columnId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "board_events_boardId_clientOpId_key" ON "board_events"("boardId", "clientOpId");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_boardId_columnId_fkey" FOREIGN KEY ("boardId", "columnId") REFERENCES "columns"("boardId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_events" ADD CONSTRAINT "board_events_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
