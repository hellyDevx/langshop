import prisma from "../db.server";
import { hashContent } from "../utils/content-hash";

export async function upsertContentDigest(
  shop: string,
  resourceId: string,
  fieldKey: string,
  contentHash: string,
): Promise<void> {
  await prisma.contentDigest.upsert({
    where: {
      shop_resourceId_fieldKey: { shop, resourceId, fieldKey },
    },
    create: {
      shop,
      resourceId,
      fieldKey,
      contentHash,
      lastCheckedAt: new Date(),
    },
    update: {
      contentHash,
      lastCheckedAt: new Date(),
    },
  });
}

export async function getContentDigests(
  shop: string,
  resourceId: string,
): Promise<Map<string, { contentHash: string; lastCheckedAt: Date }>> {
  const rows = await prisma.contentDigest.findMany({
    where: { shop, resourceId },
    select: { fieldKey: true, contentHash: true, lastCheckedAt: true },
  });
  const map = new Map<string, { contentHash: string; lastCheckedAt: Date }>();
  for (const row of rows) {
    map.set(row.fieldKey, {
      contentHash: row.contentHash,
      lastCheckedAt: row.lastCheckedAt,
    });
  }
  return map;
}

export async function shouldRetranslate(
  shop: string,
  resourceId: string,
  fieldKey: string,
  freshHash: string,
): Promise<boolean> {
  const row = await prisma.contentDigest.findUnique({
    where: {
      shop_resourceId_fieldKey: { shop, resourceId, fieldKey },
    },
    select: { contentHash: true },
  });
  if (!row) return true;
  return row.contentHash !== freshHash;
}

export async function findStaleFields(
  shop: string,
  resourceId: string,
  freshFields: Array<{ key: string; value: string }>,
): Promise<Array<{ key: string; reason: "new" | "changed" }>> {
  const stored = await getContentDigests(shop, resourceId);
  const stale: Array<{ key: string; reason: "new" | "changed" }> = [];
  for (const field of freshFields) {
    const freshHash = hashContent(field.value);
    const prior = stored.get(field.key);
    if (!prior) {
      stale.push({ key: field.key, reason: "new" });
    } else if (prior.contentHash !== freshHash) {
      stale.push({ key: field.key, reason: "changed" });
    }
  }
  return stale;
}
