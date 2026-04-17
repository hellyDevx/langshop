import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import {
  RESOURCE_TRANSLATIONS_QUERY,
  RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY,
} from "../graphql/queries/translatableResource";
import { TRANSLATABLE_RESOURCES_WITH_TRANSLATIONS_QUERY } from "../graphql/queries/translatableResourcesWithTranslations";
import { NESTED_TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/nestedTranslatableResources";
import { RESOURCE_CATEGORIES } from "../utils/resource-type-map";
import prisma from "../db.server";
import type {
  AdminClient,
  TranslatableResource,
  TranslatableResourceWithTranslations,
  TranslatableResourceWithNested,
  PageInfo,
} from "../types/shopify";
import type { CategoryStats } from "../types/translation";

export async function fetchTranslatableResources(
  admin: AdminClient,
  {
    resourceType,
    first = 25,
    after = null,
  }: {
    resourceType: string;
    first?: number;
    after?: string | null;
  },
): Promise<{ nodes: TranslatableResource[]; pageInfo: PageInfo }> {
  const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
    variables: { resourceType, first, after },
  });
  const { data } = await response.json();
  return {
    nodes: data.translatableResources.nodes,
    pageInfo: data.translatableResources.pageInfo,
  };
}

export async function fetchTranslatableResource(
  admin: AdminClient,
  {
    resourceId,
    locale,
    marketId = null,
  }: {
    resourceId: string;
    locale: string;
    marketId?: string | null;
  },
): Promise<TranslatableResourceWithTranslations> {
  const query = marketId
    ? RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY
    : RESOURCE_TRANSLATIONS_QUERY;

  const variables: Record<string, string> = { resourceId, locale };
  if (marketId) variables.marketId = marketId;

  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  return data.translatableResource;
}

export async function fetchTranslatableResourceWithNested(
  admin: AdminClient,
  { resourceId, locale }: { resourceId: string; locale: string },
): Promise<TranslatableResourceWithNested> {
  const response = await admin.graphql(NESTED_TRANSLATABLE_RESOURCES_QUERY, {
    variables: { resourceId, locale },
  });
  const { data } = await response.json();
  return data.translatableResource;
}

// --- Translation Stats ---

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchResourceTypeStats(
  admin: AdminClient,
  resourceType: string,
  locale: string,
): Promise<CategoryStats> {
  try {
    const response = await admin.graphql(
      TRANSLATABLE_RESOURCES_WITH_TRANSLATIONS_QUERY,
      { variables: { resourceType, first: 50, locale } },
    );
    const { data } = await response.json();
    const nodes = data.translatableResources.nodes;

    if (nodes.length === 0) {
      return { totalSampled: 0, translatedCount: 0, hasResources: false };
    }

    let translatedCount = 0;
    for (const node of nodes) {
      const contentKeys = node.translatableContent
        .filter((c: { value: string }) => c.value && c.value.trim() !== "")
        .map((c: { key: string }) => c.key);

      if (contentKeys.length === 0) continue;

      const translatedKeys = new Set(
        (node.translations || []).map((t: { key: string }) => t.key),
      );

      // Count as translated if at least one field has a translation
      if (translatedKeys.size > 0) {
        translatedCount++;
      }
    }

    return {
      totalSampled: nodes.length,
      translatedCount,
      hasResources: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Stats error for ${resourceType}:`, message);
    return { totalSampled: 0, translatedCount: 0, hasResources: false };
  }
}

export async function fetchAllCategoryStats(
  admin: AdminClient,
  shop: string,
  locale: string,
): Promise<Record<string, CategoryStats>> {
  // Collect all resource types
  const allTypes: string[] = [];
  RESOURCE_CATEGORIES.forEach((cat) => {
    cat.resourceTypes.forEach((rt) => {
      allTypes.push(rt.type);
    });
  });

  // Check cache first
  const cached = await prisma.translationStats.findMany({
    where: { shop, locale },
  });

  const cachedMap: Record<string, CategoryStats> = {};
  const now = Date.now();
  cached.forEach((c) => {
    if (now - c.cachedAt.getTime() < CACHE_TTL_MS) {
      cachedMap[c.resourceType] = {
        totalSampled: c.totalSampled,
        translatedCount: c.translatedCount,
        hasResources: c.hasResources,
      };
    }
  });

  // Fetch uncached types (with concurrency limit)
  const uncachedTypes = allTypes.filter((t) => !cachedMap[t]);
  const results: Record<string, CategoryStats> = { ...cachedMap };

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < uncachedTypes.length; i += 5) {
    const batch = uncachedTypes.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map((type) => fetchResourceTypeStats(admin, type, locale)),
    );

    for (let j = 0; j < batch.length; j++) {
      results[batch[j]] = batchResults[j];

      // Cache the result
      try {
        await prisma.translationStats.upsert({
          where: {
            shop_resourceType_locale_marketId: {
              shop,
              resourceType: batch[j],
              locale,
              marketId: "",
            },
          },
          create: {
            shop,
            resourceType: batch[j],
            locale,
            totalSampled: batchResults[j].totalSampled,
            translatedCount: batchResults[j].translatedCount,
            hasResources: batchResults[j].hasResources,
            cachedAt: new Date(),
          },
          update: {
            totalSampled: batchResults[j].totalSampled,
            translatedCount: batchResults[j].translatedCount,
            hasResources: batchResults[j].hasResources,
            cachedAt: new Date(),
          },
        });
      } catch {
        // Cache write failure is non-critical
      }
    }
  }

  return results;
}
