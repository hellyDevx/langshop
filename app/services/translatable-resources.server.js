import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import {
  RESOURCE_TRANSLATIONS_QUERY,
  RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY,
} from "../graphql/queries/translatableResource";
import { TRANSLATABLE_RESOURCES_WITH_TRANSLATIONS_QUERY } from "../graphql/queries/translatableResourcesWithTranslations";
import { NESTED_TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/nestedTranslatableResources";
import { RESOURCE_CATEGORIES } from "../utils/resource-type-map";
import prisma from "../db.server";

export async function fetchTranslatableResources(
  admin,
  { resourceType, first = 25, after = null },
) {
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
  admin,
  { resourceId, locale, marketId = null },
) {
  const query = marketId
    ? RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY
    : RESOURCE_TRANSLATIONS_QUERY;

  const variables = { resourceId, locale };
  if (marketId) variables.marketId = marketId;

  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  return data.translatableResource;
}

export async function fetchTranslatableResourceWithNested(
  admin,
  { resourceId, locale },
) {
  const response = await admin.graphql(NESTED_TRANSLATABLE_RESOURCES_QUERY, {
    variables: { resourceId, locale },
  });
  const { data } = await response.json();
  return data.translatableResource;
}

// --- Translation Stats ---

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchResourceTypeStats(admin, resourceType, locale) {
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
        .filter((c) => c.value && c.value.trim() !== "")
        .map((c) => c.key);

      if (contentKeys.length === 0) continue;

      const translatedKeys = new Set(
        (node.translations || []).map((t) => t.key),
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
    console.error(`Stats error for ${resourceType}:`, error.message);
    return { totalSampled: 0, translatedCount: 0, hasResources: false };
  }
}

export async function fetchAllCategoryStats(admin, shop, locale) {
  // Collect all resource types
  const allTypes = [];
  RESOURCE_CATEGORIES.forEach((cat) => {
    cat.resourceTypes.forEach((rt) => {
      allTypes.push(rt.type);
    });
  });

  // Check cache first
  const cached = await prisma.translationStats.findMany({
    where: { shop, locale },
  });

  const cachedMap = {};
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
  const results = { ...cachedMap };

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
            shop_resourceType_locale: {
              shop,
              resourceType: batch[j],
              locale,
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
      } catch (e) {
        // Cache write failure is non-critical
      }
    }
  }

  return results;
}
