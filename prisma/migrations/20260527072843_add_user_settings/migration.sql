-- CreateTable
CREATE TABLE "UserSettings" (
    "clerkUserId" TEXT NOT NULL,
    "layout" TEXT,
    "visibility" TEXT,
    "theme" TEXT,
    "acctFilter" TEXT,
    "accountsPanelFilter" TEXT,
    "aiProvider" TEXT,
    "aiKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("clerkUserId")
);
