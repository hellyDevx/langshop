import type {
  GlossaryTerm,
  TranslationJob,
  TranslationProviderConfig,
} from "@prisma/client";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  createProvider,
  isAiProvider,
  ProviderTransientError,
} from "./providers/provider-interface.server";
import type { AiTranslationProvider } from "./providers/ai-provider.server";
import { upsertContentDigest } from "./content-sync.server";
import {
  applyGlossaryPost,
  applyGlossaryPre,
  getGlossaryTermsByLocalePair,
  type ViolationWarning,
} from "./glossary.server";
import { getBrandVoiceConfig, buildAISystemPrompt } from "./brand-voice.server";
import { upsertSuggestion } from "./suggestion.server";
import { recordProviderUsage } from "./usage.server";
import { createAlert } from "./alerts.server";
import { writeAuditLog, type AuditSource } from "./analytics.server";
import { hashContent } from "../utils/content-hash";
import type { ProductContext } from "../utils/graphql-batcher";
import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import { TRANSLATIONS_REGISTER_MUTATION } from "../graphql/mutations/translationsRegister";
import { batchFetchTranslatableResources } from "../utils/graphql-batcher";
import type { AdminClient } from "../types/shopify";
import type { TranslationInput } from "../types/translation";
import type { TranslationProvider, ProviderConfig } from "../types/provider";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 10 * 60_000;

interface TranslatableResourcesResponse {
  data: {
    translatableResources: {
      nodes: Array<{ resourceId: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

interface TranslationsRegisterResponse {
  data: {
    translationsRegister: {
      translations: Array<{ key: string; value: string; locale: string }>;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  };
}

interface FreshResource {
  resourceId: string;
  translatableContent: Array<{
    key: string;
    value: string;
    digest: string;
    locale: string;
  }>;
  translations?: Array<{
    key: string;
    value: string;
    locale: string;
    outdated?: boolean;
  }>;
  productContext?: ProductContext;
}

export async function createTranslationJob(
  shop: string,
  {
    provider,
    resourceType,
    sourceLocale,
    targetLocale,
    marketId,
  }: {
    provider: string;
    resourceType: string;
    sourceLocale: string;
    targetLocale: string;
    marketId?: string | null;
  },
) {
  return prisma.translationJob.create({
    data: {
      shop,
      provider,
      resourceType,
      sourceLocale,
      targetLocale,
      marketId,
      status: "pending",
    },
  });
}

export async function getJob(jobId: string) {
  return prisma.translationJob.findUnique({
    where: { id: jobId },
    include: { entries: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function getJobsForShop(
  shop: string,
  options?: { cursor?: string; take?: number },
) {
  const take = options?.take ?? 20;
  const jobs = await prisma.translationJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(options?.cursor
      ? { skip: 1, cursor: { id: options.cursor } }
      : {}),
  });

  const hasMore = jobs.length > take;
  if (hasMore) jobs.pop();

  return {
    jobs,
    hasMore,
    endCursor: jobs.length > 0 ? jobs[jobs.length - 1].id : null,
  };
}

export async function recoverStrandedJobs(
  staleAfterMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const result = await prisma.translationJob.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "pending",
      startedAt: null,
      scheduledAt: null,
    },
  });
  return result.count;
}

export async function claimNextJob(): Promise<{
  job: TranslationJob;
  providerConfig: TranslationProviderConfig;
} | null> {
  const now = new Date();
  const candidate = await prisma.translationJob.findFirst({
    where: {
      status: "pending",
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const providerConfig = await prisma.translationProviderConfig.findUnique({
    where: {
      shop_provider: { shop: candidate.shop, provider: candidate.provider },
    },
  });
  if (!providerConfig || !providerConfig.isActive) {
    await prisma.translationJob.update({
      where: { id: candidate.id },
      data: {
        status: "failed",
        errorMessage: `Provider ${candidate.provider} is not configured for this shop.`,
        completedAt: new Date(),
      },
    });
    return null;
  }

  const claimed = await prisma.translationJob.update({
    where: { id: candidate.id },
    data: { status: "running", startedAt: new Date() },
  });

  return { job: claimed, providerConfig };
}

export async function scheduleRetry(
  jobId: string,
  attemptCount: number,
  errorMessage: string,
): Promise<void> {
  if (attemptCount >= MAX_RETRIES) {
    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage,
        retryCount: attemptCount,
        completedAt: new Date(),
      },
    });
    const { shop } = await prisma.translationJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { shop: true },
    });
    await createAlert({
      shop,
      type: "failure",
      severity: "critical",
      message: `Translation job failed after ${attemptCount} attempts: ${errorMessage}`,
      jobId,
    });
    return;
  }

  const backoff = Math.min(
    RETRY_BASE_MS * Math.pow(2, attemptCount),
    RETRY_CAP_MS,
  );
  const scheduledAt = new Date(Date.now() + backoff);
  await prisma.translationJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      retryCount: attemptCount,
      scheduledAt,
      startedAt: null,
      errorMessage,
    },
  });
}

export async function runTranslationJob(
  jobId: string,
  providerConfig: ProviderConfig & { model?: string },
) {
  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
  });
  if (!job) throw new Error("Job not found");

  const { admin } = await unauthenticated.admin(job.shop);
  const provider = createProvider(
    job.provider,
    providerConfig,
    providerConfig.model,
  );

  const glossaryRules = await getGlossaryTermsByLocalePair(
    job.shop,
    job.sourceLocale,
    job.targetLocale,
  );
  let glossaryApplied = false;

  const useAi = isAiProvider(job.provider);
  let aiSystemPrompt: string | null = null;
  if (useAi) {
    const brandVoice = await getBrandVoiceConfig(job.shop);
    aiSystemPrompt = buildAISystemPrompt(brandVoice, glossaryRules, {
      resourceType: job.resourceType,
      sourceLocale: job.sourceLocale,
      targetLocale: job.targetLocale,
    });
  }

  const filterIds = job.resourceIdFilter
    ? (JSON.parse(job.resourceIdFilter) as string[])
    : null;

  let totalProcessed = 0;
  let totalFailed = 0;

  const processResourceBatch = async (
    resourceIds: string[],
    hasMoreHint: number,
  ): Promise<void> => {
    const batchedResources = await batchFetchTranslatableResources(
      admin,
      resourceIds,
      job.targetLocale,
      { includeProductContext: useAi && job.resourceType === "PRODUCT" },
    );

    for (const resourceId of resourceIds) {
      try {
        const freshResource = batchedResources[resourceId];
        if (!freshResource) throw new Error("Resource not found in batch");

        const resourceStats = useAi
          ? await translateResourceAi(
              provider as AiTranslationProvider,
              freshResource,
              job.shop,
              job.sourceLocale,
              job.targetLocale,
              job.marketId,
              job.resourceType,
              job.provider,
              aiSystemPrompt ?? "",
              glossaryRules,
            )
          : await translateResourceFromData(
              admin,
              provider,
              freshResource,
              job.shop,
              job.sourceLocale,
              job.targetLocale,
              job.marketId,
              jobId,
              glossaryRules,
              job.provider,
              job.resourceType,
            );
        if (resourceStats.glossaryMatched) glossaryApplied = true;
        totalProcessed++;
      } catch (error) {
        if (error instanceof ProviderTransientError) {
          throw error;
        }
        totalFailed++;
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(`Failed to translate ${resourceId}:`, message);
      }

      await prisma.translationJob.update({
        where: { id: jobId },
        data: {
          completedItems: totalProcessed,
          failedItems: totalFailed,
          totalItems: totalProcessed + totalFailed + hasMoreHint,
        },
      });
    }
  };

  try {
    if (filterIds) {
      await prisma.translationJob.update({
        where: { id: jobId },
        data: { totalItems: filterIds.length },
      });

      const chunkSize = 10;
      for (let i = 0; i < filterIds.length; i += chunkSize) {
        const chunk = filterIds.slice(i, i + chunkSize);
        const remaining = Math.max(
          0,
          filterIds.length - totalProcessed - totalFailed - chunk.length,
        );
        await processResourceBatch(chunk, remaining);
        if (i + chunkSize < filterIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } else {
      let cursor: string | null = null;
      while (true) {
        const gqlResponse = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
          variables: {
            resourceType: job.resourceType,
            first: 10,
            after: cursor,
          },
        });
        const gqlJson = (await gqlResponse.json()) as TranslatableResourcesResponse;
        const { nodes, pageInfo } = gqlJson.data.translatableResources;

        if (nodes.length === 0) break;

        if (!cursor) {
          await prisma.translationJob.update({
            where: { id: jobId },
            data: {
              totalItems: nodes.length + (pageInfo.hasNextPage ? 10 : 0),
            },
          });
        }

        await processResourceBatch(
          nodes.map((n) => n.resourceId),
          pageInfo.hasNextPage ? 10 : 0,
        );

        if (pageInfo.hasNextPage) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!pageInfo.hasNextPage) break;
        cursor = pageInfo.endCursor ?? null;
      }
    }

    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status:
          totalFailed > 0 && totalProcessed === 0 ? "failed" : "completed",
        completedItems: totalProcessed,
        failedItems: totalFailed,
        totalItems: totalProcessed + totalFailed,
        completedAt: new Date(),
        glossaryApplied,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof ProviderTransientError) {
      await scheduleRetry(jobId, job.retryCount + 1, message);
      return;
    }

    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: message,
        completedItems: totalProcessed,
        failedItems: totalFailed,
        completedAt: new Date(),
      },
    });
    await createAlert({
      shop: job.shop,
      type: "failure",
      severity: "critical",
      message: `Translation job failed: ${message}`,
      jobId,
    });
    throw error;
  }
}

interface ResourceTranslationStats {
  glossaryMatched: boolean;
}

const AUDIT_SOURCE_BY_PROVIDER: Record<string, AuditSource> = {
  google: "auto_google",
  deepl: "auto_deepl",
  claude: "auto_claude",
  openai: "auto_openai",
};

async function translateResourceFromData(
  admin: AdminClient,
  provider: TranslationProvider,
  freshResource: FreshResource,
  shop: string,
  sourceLocale: string,
  targetLocale: string,
  marketId: string | null,
  jobId: string,
  glossaryRules: GlossaryTerm[],
  jobProvider: string,
  resourceType: string,
): Promise<ResourceTranslationStats> {
  const translatableFields = freshResource.translatableContent.filter(
    (c) => c.value && c.value.trim() !== "",
  );

  if (translatableFields.length === 0) {
    return { glossaryMatched: false };
  }

  let glossaryMatched = false;
  const preResults = translatableFields.map((f) => {
    const pre = applyGlossaryPre(f.value, glossaryRules);
    if (pre.placeholderMap.length > 0) glossaryMatched = true;
    return pre;
  });

  const maskedTexts = preResults.map((p) => p.masked);
  const charCount = maskedTexts.reduce((sum, t) => sum + t.length, 0);
  const providerOutputs = await provider.translate(
    maskedTexts,
    sourceLocale,
    targetLocale,
  );
  await recordProviderUsage(shop, jobProvider, targetLocale, charCount);

  const postResults = providerOutputs.map((out, i) =>
    applyGlossaryPost(out, preResults[i].placeholderMap, glossaryRules),
  );
  const translatedTexts = postResults.map((r) => r.restored);
  if (postResults.some((r) => r.violations.length > 0)) {
    glossaryMatched = true;
  }

  const translations: TranslationInput[] = translatableFields.map(
    (field, index) => {
      const input: TranslationInput = {
        key: field.key,
        value: translatedTexts[index],
        locale: targetLocale,
        translatableContentDigest: field.digest,
      };
      if (marketId) input.marketId = marketId;
      return input;
    },
  );

  const registerResponse = await admin.graphql(
    TRANSLATIONS_REGISTER_MUTATION,
    {
      variables: {
        resourceId: freshResource.resourceId,
        translations,
      },
    },
  );
  const registerData =
    (await registerResponse.json()) as TranslationsRegisterResponse;

  if (registerData.data.translationsRegister.userErrors.length > 0) {
    throw new Error(
      registerData.data.translationsRegister.userErrors
        .map((e) => e.message)
        .join(", "),
    );
  }

  await prisma.translationJobEntry.createMany({
    data: translatableFields.map((field, index) => {
      const violations: ViolationWarning[] = postResults[index].violations;
      return {
        jobId,
        resourceId: freshResource.resourceId,
        key: field.key,
        sourceValue: field.value,
        translatedValue: translatedTexts[index],
        status: "completed",
        providerResponse:
          violations.length > 0
            ? JSON.stringify({ glossaryViolations: violations })
            : null,
      };
    }),
  });

  for (const field of translatableFields) {
    await upsertContentDigest(
      shop,
      freshResource.resourceId,
      field.key,
      hashContent(field.value),
    );
  }

  const prevByKey = new Map<string, string>();
  for (const t of freshResource.translations ?? []) {
    prevByKey.set(t.key, t.value);
  }
  const auditSource = AUDIT_SOURCE_BY_PROVIDER[jobProvider];
  if (auditSource) {
    for (let i = 0; i < translatableFields.length; i++) {
      const field = translatableFields[i];
      await writeAuditLog({
        shop,
        resourceId: freshResource.resourceId,
        resourceType,
        locale: targetLocale,
        marketId,
        fieldKey: field.key,
        previousValue: prevByKey.get(field.key) ?? null,
        newValue: translatedTexts[i],
        source: auditSource,
      });
    }
  }

  return { glossaryMatched };
}

async function translateResourceAi(
  provider: AiTranslationProvider,
  freshResource: FreshResource,
  shop: string,
  sourceLocale: string,
  targetLocale: string,
  marketId: string | null,
  resourceType: string,
  jobProvider: string,
  baseSystemPrompt: string,
  glossaryRules: GlossaryTerm[],
): Promise<ResourceTranslationStats> {
  const translatableFields = freshResource.translatableContent.filter(
    (c) => c.value && c.value.trim() !== "",
  );
  if (translatableFields.length === 0) {
    return { glossaryMatched: false };
  }

  let glossaryMatched = false;
  const preResults = translatableFields.map((f) => {
    const pre = applyGlossaryPre(f.value, glossaryRules);
    if (pre.placeholderMap.length > 0) glossaryMatched = true;
    return pre;
  });

  const maskedTexts = preResults.map((p) => p.masked);
  const charCount = maskedTexts.reduce((sum, t) => sum + t.length, 0);

  // Append per-resource context (product type / tags / collections) to the
  // cached base prompt. Appending keeps the base prefix byte-identical for
  // cache reuse — only the suffix varies by resource.
  let systemPrompt = baseSystemPrompt;
  if (freshResource.productContext) {
    const { productType, tags, collections } = freshResource.productContext;
    const lines: string[] = ["Product context:"];
    if (productType) lines.push(`- Category: ${productType}`);
    if (tags.length > 0) lines.push(`- Tags: ${tags.join(", ")}`);
    if (collections.length > 0) {
      lines.push(`- Collections: ${collections.join(", ")}`);
    }
    if (lines.length > 1) {
      systemPrompt = `${baseSystemPrompt}\n\n${lines.join("\n")}`;
    }
  }

  const result = await provider.translateWithContext(
    maskedTexts,
    sourceLocale,
    targetLocale,
    systemPrompt,
    freshResource.productContext
      ? {
          resourceType,
          category: freshResource.productContext.productType ?? undefined,
          tags: freshResource.productContext.tags,
          collection: freshResource.productContext.collections[0],
        }
      : { resourceType },
  );

  await recordProviderUsage(shop, jobProvider, targetLocale, charCount);

  const postResults = result.translations.map((out, i) =>
    applyGlossaryPost(out, preResults[i].placeholderMap, glossaryRules),
  );
  if (postResults.some((r) => r.violations.length > 0)) {
    glossaryMatched = true;
  }
  const translatedTexts = postResults.map((r) => r.restored);

  for (let i = 0; i < translatableFields.length; i++) {
    const field = translatableFields[i];
    const suggested = translatedTexts[i];
    if (!suggested) continue;
    await upsertSuggestion({
      shop,
      resourceId: freshResource.resourceId,
      resourceType,
      fieldKey: field.key,
      locale: targetLocale,
      marketId,
      sourceValue: field.value,
      suggestedValue: suggested,
      provider: jobProvider,
    });
  }

  return { glossaryMatched };
}
