import prisma from "../db.server";
import { createProvider } from "./providers/provider-interface.server";
import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import { RESOURCE_TRANSLATIONS_QUERY } from "../graphql/queries/translatableResource";
import { TRANSLATIONS_REGISTER_MUTATION } from "../graphql/mutations/translationsRegister";
import { batchFetchTranslatableResources } from "../utils/graphql-batcher";
import type { AdminClient, TranslatableContent } from "../types/shopify";
import type { TranslationInput } from "../types/translation";
import type { TranslationProvider, ProviderConfig } from "../types/provider";

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

export async function runTranslationJob(
  admin: AdminClient,
  jobId: string,
  providerConfig: ProviderConfig,
) {
  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
  });

  if (!job) throw new Error("Job not found");

  const provider = createProvider(job.provider, providerConfig);

  await prisma.translationJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  let cursor: string | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;

  try {
    while (true) {
      // Fetch a page of resources
      const gqlResponse = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
        variables: {
          resourceType: job.resourceType,
          first: 10,
          after: cursor,
        },
      });
      const gqlJson = await gqlResponse.json();
      const { nodes, pageInfo } = gqlJson.data.translatableResources as {
        nodes: Array<{ resourceId: string }>;
        pageInfo: { hasNextPage: boolean; endCursor?: string };
      };

      if (nodes.length === 0) break;

      // Update total count on first page
      if (!cursor) {
        await prisma.translationJob.update({
          where: { id: jobId },
          data: { totalItems: nodes.length + (pageInfo.hasNextPage ? 10 : 0) },
        });
      }

      // Batch-fetch fresh digests for all resources on this page
      const resourceIds = nodes.map((n) => n.resourceId);
      const batchedResources = await batchFetchTranslatableResources(
        admin,
        resourceIds,
        job.targetLocale,
      );

      // Process each resource using pre-fetched data
      for (const resource of nodes) {
        try {
          const freshResource = batchedResources[resource.resourceId];
          if (!freshResource) throw new Error("Resource not found in batch");

          await translateResourceFromData(
            admin,
            provider,
            freshResource,
            job.sourceLocale,
            job.targetLocale,
            job.marketId,
            jobId,
          );
          totalProcessed++;
        } catch (error) {
          totalFailed++;
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to translate ${resource.resourceId}:`,
            message,
          );
        }

        // Update progress
        await prisma.translationJob.update({
          where: { id: jobId },
          data: {
            completedItems: totalProcessed,
            failedItems: totalFailed,
            totalItems: totalProcessed + totalFailed + (pageInfo.hasNextPage ? 10 : 0),
          },
        });
      }

      // Rate limit delay between pages
      if (pageInfo.hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor ?? null;
    }

    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status: totalFailed > 0 && totalProcessed === 0 ? "failed" : "completed",
        completedItems: totalProcessed,
        failedItems: totalFailed,
        totalItems: totalProcessed + totalFailed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: message,
        completedItems: totalProcessed,
        failedItems: totalFailed,
      },
    });
    throw error;
  }
}

async function translateResourceFromData(
  admin: AdminClient,
  provider: TranslationProvider,
  freshResource: {
    resourceId: string;
    translatableContent: Array<{ key: string; value: string; digest: string; locale: string }>;
  },
  sourceLocale: string,
  targetLocale: string,
  marketId: string | null,
  jobId: string,
) {
  const translatableFields = freshResource.translatableContent.filter(
    (c) => c.value && c.value.trim() !== "",
  );

  if (translatableFields.length === 0) return;

  const textsToTranslate = translatableFields.map((f) => f.value);
  const translatedTexts = await provider.translate(
    textsToTranslate,
    sourceLocale,
    targetLocale,
  );

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
  const registerData = await registerResponse.json();

  if (registerData.data.translationsRegister.userErrors.length > 0) {
    throw new Error(
      registerData.data.translationsRegister.userErrors
        .map((e: { message: string }) => e.message)
        .join(", "),
    );
  }

  await prisma.translationJobEntry.createMany({
    data: translatableFields.map((field, index) => ({
      jobId,
      resourceId: freshResource.resourceId,
      key: field.key,
      sourceValue: field.value,
      translatedValue: translatedTexts[index],
      status: "completed",
    })),
  });
}

async function translateResource(
  admin: AdminClient,
  provider: TranslationProvider,
  resource: { resourceId: string },
  sourceLocale: string,
  targetLocale: string,
  marketId: string | null,
  jobId: string,
) {
  // Get fresh digests
  const response = await admin.graphql(RESOURCE_TRANSLATIONS_QUERY, {
    variables: { resourceId: resource.resourceId, locale: targetLocale },
  });
  const { data } = await response.json();
  const freshResource = data.translatableResource;

  // Filter to text content that has values
  const translatableFields = freshResource.translatableContent.filter(
    (c: TranslatableContent) => c.value && c.value.trim() !== "",
  );

  if (translatableFields.length === 0) return;

  // Batch translate all fields
  const textsToTranslate = translatableFields.map((f: TranslatableContent) => f.value);
  const translatedTexts = await provider.translate(
    textsToTranslate,
    sourceLocale,
    targetLocale,
  );

  // Build translation inputs
  const translations: TranslationInput[] = translatableFields.map(
    (field: TranslatableContent, index: number) => {
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

  // Register translations
  const registerResponse = await admin.graphql(
    TRANSLATIONS_REGISTER_MUTATION,
    {
      variables: {
        resourceId: resource.resourceId,
        translations,
      },
    },
  );
  const registerData = await registerResponse.json();

  if (registerData.data.translationsRegister.userErrors.length > 0) {
    throw new Error(
      registerData.data.translationsRegister.userErrors
        .map((e: { message: string }) => e.message)
        .join(", "),
    );
  }

  // Record entries
  await prisma.translationJobEntry.createMany({
    data: translatableFields.map((field: TranslatableContent, index: number) => ({
      jobId,
      resourceId: resource.resourceId,
      key: field.key,
      sourceValue: field.value,
      translatedValue: translatedTexts[index],
      status: "completed",
    })),
  });
}
