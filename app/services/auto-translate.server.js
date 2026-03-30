import prisma from "../db.server";
import { createProvider } from "./providers/provider-interface.server";
import { fetchTranslatableResources } from "./translatable-resources.server";
import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import { RESOURCE_TRANSLATIONS_QUERY } from "../graphql/queries/translatableResource";
import { TRANSLATIONS_REGISTER_MUTATION } from "../graphql/mutations/translationsRegister";

export async function createTranslationJob(
  shop,
  { provider, resourceType, sourceLocale, targetLocale, marketId },
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

export async function getJob(jobId) {
  return prisma.translationJob.findUnique({
    where: { id: jobId },
    include: { entries: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function getJobsForShop(shop) {
  return prisma.translationJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function runTranslationJob(admin, jobId, providerConfig) {
  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
  });

  if (!job) throw new Error("Job not found");

  const provider = createProvider(job.provider, providerConfig);

  await prisma.translationJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  let cursor = null;
  let totalProcessed = 0;
  let totalFailed = 0;

  try {
    while (true) {
      // Fetch a page of resources
      const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
        variables: {
          resourceType: job.resourceType,
          first: 10,
          after: cursor,
        },
      });
      const { data } = await response.json();
      const { nodes, pageInfo } = data.translatableResources;

      if (nodes.length === 0) break;

      // Update total count on first page
      if (!cursor) {
        await prisma.translationJob.update({
          where: { id: jobId },
          data: { totalItems: nodes.length + (pageInfo.hasNextPage ? 10 : 0) },
        });
      }

      // Process each resource
      for (const resource of nodes) {
        try {
          await translateResource(
            admin,
            provider,
            resource,
            job.sourceLocale,
            job.targetLocale,
            job.marketId,
            jobId,
          );
          totalProcessed++;
        } catch (error) {
          totalFailed++;
          console.error(
            `Failed to translate ${resource.resourceId}:`,
            error.message,
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

      if (!pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor;
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
    await prisma.translationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: error.message,
        completedItems: totalProcessed,
        failedItems: totalFailed,
      },
    });
    throw error;
  }
}

async function translateResource(
  admin,
  provider,
  resource,
  sourceLocale,
  targetLocale,
  marketId,
  jobId,
) {
  // Get fresh digests
  const response = await admin.graphql(RESOURCE_TRANSLATIONS_QUERY, {
    variables: { resourceId: resource.resourceId, locale: targetLocale },
  });
  const { data } = await response.json();
  const freshResource = data.translatableResource;

  // Filter to text content that has values
  const translatableFields = freshResource.translatableContent.filter(
    (c) => c.value && c.value.trim() !== "",
  );

  if (translatableFields.length === 0) return;

  // Batch translate all fields
  const textsToTranslate = translatableFields.map((f) => f.value);
  const translatedTexts = await provider.translate(
    textsToTranslate,
    sourceLocale,
    targetLocale,
  );

  // Build translation inputs
  const translations = translatableFields.map((field, index) => {
    const input = {
      key: field.key,
      value: translatedTexts[index],
      locale: targetLocale,
      translatableContentDigest: field.digest,
    };
    if (marketId) input.marketId = marketId;
    return input;
  });

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
        .map((e) => e.message)
        .join(", "),
    );
  }

  // Record entries
  await prisma.translationJobEntry.createMany({
    data: translatableFields.map((field, index) => ({
      jobId,
      resourceId: resource.resourceId,
      key: field.key,
      sourceValue: field.value,
      translatedValue: translatedTexts[index],
      status: "completed",
    })),
  });
}
