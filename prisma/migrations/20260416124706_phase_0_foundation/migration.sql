-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "marketId" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "glossaryApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranslationJobEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "translatedValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "providerResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TranslationJobEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "monthlyQuota" INTEGER,
    "quotaUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImageTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL DEFAULT 'featured',
    "imagePosition" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL,
    "marketId" TEXT NOT NULL DEFAULT '',
    "originalImageUrl" TEXT NOT NULL,
    "translatedImageUrl" TEXT NOT NULL,
    "metafieldId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranslationStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "marketId" TEXT NOT NULL DEFAULT '',
    "totalSampled" INTEGER NOT NULL DEFAULT 0,
    "translatedCount" INTEGER NOT NULL DEFAULT 0,
    "hasResources" BOOLEAN NOT NULL DEFAULT false,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "sourceTerm" TEXT NOT NULL,
    "targetTerm" TEXT NOT NULL,
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "neverTranslate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrandVoiceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranslationAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "marketId" TEXT,
    "fieldKey" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TranslationAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resourceId" TEXT,
    "locale" TEXT,
    "jobId" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentDigest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lastCheckedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranslationSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "marketId" TEXT,
    "sourceValue" TEXT NOT NULL,
    "suggestedValue" TEXT NOT NULL,
    "editedValue" TEXT,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" TEXT NOT NULL,
    "primaryLocale" TEXT,
    "targetLocales" TEXT,
    "selectedProvider" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TranslationJob_shop_status_idx" ON "TranslationJob"("shop", "status");

-- CreateIndex
CREATE INDEX "TranslationJob_shop_createdAt_idx" ON "TranslationJob"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationJobEntry_jobId_status_idx" ON "TranslationJobEntry"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationProviderConfig_shop_provider_key" ON "TranslationProviderConfig"("shop", "provider");

-- CreateIndex
CREATE INDEX "ImageTranslation_shop_resourceId_idx" ON "ImageTranslation"("shop", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageTranslation_shop_resourceId_imageId_locale_marketId_key" ON "ImageTranslation"("shop", "resourceId", "imageId", "locale", "marketId");

-- CreateIndex
CREATE INDEX "TranslationStats_shop_locale_idx" ON "TranslationStats"("shop", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationStats_shop_resourceType_locale_marketId_key" ON "TranslationStats"("shop", "resourceType", "locale", "marketId");

-- CreateIndex
CREATE INDEX "GlossaryTerm_shop_sourceLocale_idx" ON "GlossaryTerm"("shop", "sourceLocale");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryTerm_shop_sourceLocale_targetLocale_sourceTerm_key" ON "GlossaryTerm"("shop", "sourceLocale", "targetLocale", "sourceTerm");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoiceConfig_shop_key" ON "BrandVoiceConfig"("shop");

-- CreateIndex
CREATE INDEX "TranslationAuditLog_shop_resourceId_locale_idx" ON "TranslationAuditLog"("shop", "resourceId", "locale");

-- CreateIndex
CREATE INDEX "TranslationAuditLog_shop_createdAt_idx" ON "TranslationAuditLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationAlert_shop_dismissed_createdAt_idx" ON "TranslationAlert"("shop", "dismissed", "createdAt");

-- CreateIndex
CREATE INDEX "UsageTracking_shop_date_idx" ON "UsageTracking"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UsageTracking_shop_provider_locale_date_key" ON "UsageTracking"("shop", "provider", "locale", "date");

-- CreateIndex
CREATE INDEX "ContentDigest_shop_resourceId_idx" ON "ContentDigest"("shop", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDigest_shop_resourceId_fieldKey_key" ON "ContentDigest"("shop", "resourceId", "fieldKey");

-- CreateIndex
CREATE INDEX "TranslationSuggestion_shop_status_idx" ON "TranslationSuggestion"("shop", "status");

-- CreateIndex
CREATE INDEX "TranslationSuggestion_shop_resourceId_locale_idx" ON "TranslationSuggestion"("shop", "resourceId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationSuggestion_shop_resourceId_fieldKey_locale_marketId_key" ON "TranslationSuggestion"("shop", "resourceId", "fieldKey", "locale", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_shop_key" ON "OnboardingState"("shop");
