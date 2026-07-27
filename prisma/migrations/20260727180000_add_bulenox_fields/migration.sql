-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "balance" DOUBLE PRECISION,
ADD COLUMN     "threshold" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "bestPnlDay" TEXT,
ADD COLUMN     "closedPnl" DOUBLE PRECISION,
ADD COLUMN     "consistency" TEXT,
ADD COLUMN     "maxContracts" INTEGER,
ADD COLUMN     "nextBill" TEXT,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "safetyReserve" DOUBLE PRECISION;

