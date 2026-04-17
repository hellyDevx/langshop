import type { AdminClient } from "../types/shopify";

export interface ProductContext {
  productType: string | null;
  tags: string[];
  collections: string[];
}

export interface BatchedResource {
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
  productContext?: ProductContext;
}

interface BatchedResourceResponse {
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

interface ProductContextResponse {
  productType?: string | null;
  tags?: string[];
  collections?: { nodes: Array<{ title: string }> };
}

/**
 * Batches multiple translatableResource queries into a single GraphQL request
 * using aliases. This avoids N+1 API calls when processing multiple resources.
 *
 * When `includeProductContext` is true, each resource is also queried as a
 * Product inline fragment to pull category/tags/collection names for AI
 * prompt context injection (Phase 4). Safe for non-product IDs — the fields
 * simply come back empty.
 */
export async function batchFetchTranslatableResources(
  admin: AdminClient,
  resourceIds: string[],
  locale: string,
  opts?: { includeProductContext?: boolean },
): Promise<Record<string, BatchedResource>> {
  if (resourceIds.length === 0) return {};

  const includeProductContext = opts?.includeProductContext === true;

  const fragments = resourceIds.map((id, i) => {
    const base = `
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
    }`;
    if (!includeProductContext) return base;
    return (
      base +
      `
    p${i}: product(id: "${id}") {
      productType
      tags
      collections(first: 3) { nodes { title } }
    }`
    );
  });

  const query = `#graphql
    query BatchTranslatableResources {
      ${fragments.join("\n")}
    }
  `;

  const response = await admin.graphql(query);
  const { data } = (await response.json()) as {
    data: Record<string, BatchedResourceResponse | ProductContextResponse | null>;
  };

  const results: Record<string, BatchedResource> = {};
  resourceIds.forEach((id, i) => {
    const resource = data[`r${i}`] as BatchedResourceResponse | null;
    if (!resource) return;
    const combined: BatchedResource = {
      resourceId: resource.resourceId,
      translatableContent: resource.translatableContent,
      translations: resource.translations,
    };
    if (includeProductContext) {
      const pc = data[`p${i}`] as ProductContextResponse | null;
      if (pc) {
        combined.productContext = {
          productType: pc.productType ?? null,
          tags: pc.tags ?? [],
          collections: pc.collections?.nodes.map((n) => n.title) ?? [],
        };
      }
    }
    results[id] = combined;
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

    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
