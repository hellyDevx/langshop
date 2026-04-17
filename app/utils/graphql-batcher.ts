import type { AdminClient } from "../types/shopify";

/**
 * Batches multiple translatableResource queries into a single GraphQL request
 * using aliases. This avoids N+1 API calls when processing multiple resources.
 */
export async function batchFetchTranslatableResources(
  admin: AdminClient,
  resourceIds: string[],
  locale: string,
): Promise<
  Record<
    string,
    {
      resourceId: string;
      translatableContent: Array<{
        key: string;
        value: string;
        digest: string;
        locale: string;
      }>;
      translations: Array<{
        key: string;
        value: string;
        locale: string;
        outdated?: boolean;
      }>;
    }
  >
> {
  if (resourceIds.length === 0) return {};

  // Build aliased query
  const fragments = resourceIds.map(
    (id, i) => `
    r${i}: translatableResource(resourceId: "${id}") {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
      translations(locale: "${locale}") {
        key
        value
        locale
        outdated
      }
    }`,
  );

  const query = `#graphql
    query BatchTranslatableResources {
      ${fragments.join("\n")}
    }
  `;

  const response = await admin.graphql(query);
  const { data } = await response.json();

  const results: Record<string, (typeof data)[string]> = {};
  resourceIds.forEach((id, i) => {
    if (data[`r${i}`]) {
      results[id] = data[`r${i}`];
    }
  });

  return results;
}

/**
 * Process items in batches with a delay between batches to respect rate limits.
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  delayMs = 100,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);

    // Delay between batches (skip after last batch)
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
