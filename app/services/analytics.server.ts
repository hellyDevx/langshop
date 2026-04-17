import type { TranslationAuditLog } from "@prisma/client";
import prisma from "../db.server";
import type { AdminClient } from "../types/shopify";
import {
  batchFetchTranslatableResources,
  type BatchedResource,
} from "../utils/graphql-batcher";
import { hashContent } from "../utils/content-hash";
import { estimateCost } from "../utils/cost-estimator";
import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";

const CACHE_TTL_MS = 5 * 60_000;

// ===== Coverage =====

export type CoverageView = "locale" | "market";

export interface CoverageCell {
  total: number;
  translated: number;
  percent: number;
  stale: boolean;
}

export interface CoverageMatrix {
  rows: string[];
  columns: string[];
  cells: Record<string, Record<string, CoverageCell>>;
}

export async function getCoverageMatrix(
  shop: string,
  view: CoverageView,
): Promise<CoverageMatrix> {
  const stats = await prisma.translationStats.findMany({ where: { shop } });
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const cells: Record<string, Record<string, CoverageCell>> = {};
  const now = Date.now();

  for (const s of stats) {
    const col = view === "locale" ? s.locale : s.marketId || "global";
    rowSet.add(s.resourceType);
    colSet.add(col);
    if (!cells[s.resourceType]) cells[s.resourceType] = {};
    const existing = cells[s.resourceType][col];
    const cell: CoverageCell = {
      total: (existing?.total ?? 0) + s.totalSampled,
      translated: (existing?.translated ?? 0) + s.translatedCount,
      percent: 0,
      stale: now - s.cachedAt.getTime() > CACHE_TTL_MS,
    };
    cell.percent = cell.total > 0 ? (cell.translated / cell.total) * 100 : 0;
    cells[s.resourceType][col] = cell;
  }

  return {
    rows: [...rowSet].sort(),
    columns: [...colSet].sort(),
    cells,
  };
}

interface TranslatableResourcesResponse {
  data: {
    translatableResources: {
      nodes: Array<{
        resourceId: string;
        translatableContent: Array<{ key: string; value: string }>;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

export async function recomputeExact(
  admin: AdminClient,
  shop: string,
  resourceType: string,
  locale: string,
  marketId: string,
): Promise<CoverageCell> {
  let cursor: string | null = null;
  let total = 0;
  let translated = 0;

  while (true) {
    const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
      variables: { resourceType, first: 50, after: cursor },
    });
    const json = (await response.json()) as TranslatableResourcesResponse;
    const { nodes, pageInfo } = json.data.translatableResources;
    if (nodes.length === 0) break;

    const ids = nodes.map((n) => n.resourceId);
    const batched = await batchFetchTranslatableResources(admin, ids, locale);
    for (const id of ids) {
      const r = batched[id];
      if (!r) continue;
      const translationKeys = new Set(
        r.translations
          .filter((t) => t.value && t.value.trim() !== "")
          .map((t) => t.key),
      );
      for (const field of r.translatableContent) {
        if (!field.value || field.value.trim() === "") continue;
        total++;
        if (translationKeys.has(field.key)) translated++;
      }
    }

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  await prisma.translationStats.upsert({
    where: {
      shop_resourceType_locale_marketId: {
        shop,
        resourceType,
        locale,
        marketId,
      },
    },
    create: {
      shop,
      resourceType,
      locale,
      marketId,
      totalSampled: total,
      translatedCount: translated,
      hasResources: total > 0,
      cachedAt: new Date(),
    },
    update: {
      totalSampled: total,
      translatedCount: translated,
      hasResources: total > 0,
      cachedAt: new Date(),
    },
  });

  return {
    total,
    translated,
    percent: total > 0 ? (translated / total) * 100 : 0,
    stale: false,
  };
}

// ===== Usage =====

export interface UsageRow {
  provider: string;
  locale: string;
  date: Date;
  characterCount: number;
  requestCount: number;
  estimatedUsd: number | null;
}

export interface UsageTotal {
  provider: string;
  characters: number;
  requests: number;
  usd: number | null;
}

export async function getUsageSummary(
  shop: string,
  days: number,
): Promise<{ rows: UsageRow[]; totals: UsageTotal[] }> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const [usage, providerConfigs] = await Promise.all([
    prisma.usageTracking.findMany({
      where: { shop, date: { gte: since } },
      orderBy: [{ date: "desc" }, { provider: "asc" }],
    }),
    prisma.translationProviderConfig.findMany({ where: { shop } }),
  ]);

  const modelByProvider: Record<string, string | null> = {};
  for (const c of providerConfigs) modelByProvider[c.provider] = c.model;

  const rows: UsageRow[] = usage.map((u) => {
    const model = modelByProvider[u.provider];
    const usd = model
      ? (estimateCost(model, u.characterCount)?.usd ?? null)
      : null;
    return {
      provider: u.provider,
      locale: u.locale,
      date: u.date,
      characterCount: u.characterCount,
      requestCount: u.requestCount,
      estimatedUsd: usd,
    };
  });

  const totalsMap = new Map<string, UsageTotal>();
  for (const r of rows) {
    const existing = totalsMap.get(r.provider);
    if (existing) {
      existing.characters += r.characterCount;
      existing.requests += r.requestCount;
      if (r.estimatedUsd !== null) {
        existing.usd = (existing.usd ?? 0) + r.estimatedUsd;
      }
    } else {
      totalsMap.set(r.provider, {
        provider: r.provider,
        characters: r.characterCount,
        requests: r.requestCount,
        usd: r.estimatedUsd,
      });
    }
  }

  return { rows, totals: [...totalsMap.values()] };
}

// ===== Stale detection =====

export interface StaleRow {
  resourceId: string;
  fieldKey: string;
  storedHash: string;
  currentHash: string;
  currentSource: string;
}

export async function detectStale(
  admin: AdminClient,
  shop: string,
): Promise<StaleRow[]> {
  const digests = await prisma.contentDigest.findMany({ where: { shop } });
  if (digests.length === 0) return [];

  // Group digests by resourceId to batch fetches.
  const byResource = new Map<string, typeof digests>();
  for (const d of digests) {
    const arr = byResource.get(d.resourceId) ?? [];
    arr.push(d);
    byResource.set(d.resourceId, arr);
  }

  const stale: StaleRow[] = [];
  const ids = [...byResource.keys()];
  const chunkSize = 10;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const batch = ids.slice(i, i + chunkSize);
    // Use an empty locale — we only compare source content, not translations.
    const fetched = await batchFetchTranslatableResources(admin, batch, "");
    for (const id of batch) {
      const fresh: BatchedResource | undefined = fetched[id];
      if (!fresh) continue;
      const currentByKey = new Map<string, string>();
      for (const c of fresh.translatableContent) {
        currentByKey.set(c.key, c.value);
      }
      for (const d of byResource.get(id) ?? []) {
        const current = currentByKey.get(d.fieldKey);
        if (!current) continue;
        const currentHash = hashContent(current);
        if (currentHash !== d.contentHash) {
          stale.push({
            resourceId: id,
            fieldKey: d.fieldKey,
            storedHash: d.contentHash,
            currentHash,
            currentSource: current,
          });
        }
      }
    }
    if (i + chunkSize < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return stale;
}

// ===== Audit log =====

export type AuditSource =
  | "manual"
  | "auto_google"
  | "auto_deepl"
  | "auto_claude"
  | "auto_openai"
  | "auto_ai";

export interface WriteAuditLogInput {
  shop: string;
  resourceId: string;
  resourceType: string;
  locale: string;
  marketId: string | null;
  fieldKey: string;
  previousValue: string | null;
  newValue: string;
  source: AuditSource;
}

export async function writeAuditLog(
  input: WriteAuditLogInput,
): Promise<TranslationAuditLog | null> {
  if (
    input.previousValue !== null &&
    input.previousValue === input.newValue
  ) {
    return null;
  }
  return prisma.translationAuditLog.create({
    data: {
      shop: input.shop,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      locale: input.locale,
      marketId: input.marketId,
      fieldKey: input.fieldKey,
      previousValue: input.previousValue,
      newValue: input.newValue,
      source: input.source,
    },
  });
}

export interface ListAuditOptions {
  resourceId?: string;
  locale?: string;
  source?: AuditSource;
  cursor?: string;
  limit?: number;
}

export async function listAuditLog(
  shop: string,
  options?: ListAuditOptions,
): Promise<{
  rows: TranslationAuditLog[];
  hasMore: boolean;
  endCursor: string | null;
}> {
  const limit = options?.limit ?? 10;
  const rows = await prisma.translationAuditLog.findMany({
    where: {
      shop,
      ...(options?.resourceId ? { resourceId: options.resourceId } : {}),
      ...(options?.locale ? { locale: options.locale } : {}),
      ...(options?.source ? { source: options.source } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options?.cursor
      ? { skip: 1, cursor: { id: options.cursor } }
      : {}),
  });
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  return {
    rows,
    hasMore,
    endCursor: rows.length > 0 ? rows[rows.length - 1].id : null,
  };
}
