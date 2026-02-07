-- CreateTable
CREATE TABLE "BotVaultSecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botInstanceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BotVaultSecret_botInstanceId_fkey" FOREIGN KEY ("botInstanceId") REFERENCES "BotInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BotVaultSecret_botInstanceId_idx" ON "BotVaultSecret"("botInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "BotVaultSecret_botInstanceId_key_key" ON "BotVaultSecret"("botInstanceId", "key");
