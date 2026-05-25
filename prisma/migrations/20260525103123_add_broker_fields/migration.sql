-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "activeDays" INTEGER,
ADD COLUMN     "balance" DOUBLE PRECISION,
ADD COLUMN     "threshold" DOUBLE PRECISION,
ADD COLUMN     "updateDate" TEXT;
