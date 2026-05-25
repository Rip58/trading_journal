-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "entry_time" TEXT NOT NULL,
    "exit_time" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "exit_price" DOUBLE PRECISION NOT NULL,
    "gross" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "mfe" DOUBLE PRECISION NOT NULL,
    "etd" DOUBLE PRECISION NOT NULL,
    "rr" DOUBLE PRECISION NOT NULL,
    "result" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "dd_limit" DOUBLE PRECISION NOT NULL,
    "daily_limit" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "balance" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "updateDate" TEXT,
    "activeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_clerkUserId_name_key" ON "Account"("clerkUserId", "name");
