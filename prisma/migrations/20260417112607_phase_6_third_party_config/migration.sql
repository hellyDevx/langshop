-- CreateTable
CREATE TABLE "ThirdPartyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "presetsJson" TEXT NOT NULL DEFAULT '{}',
    "customSelectorsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ThirdPartyConfig_shop_key" ON "ThirdPartyConfig"("shop");
