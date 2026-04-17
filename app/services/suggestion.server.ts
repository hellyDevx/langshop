import type { TranslationSuggestion } from "@prisma/client";
import prisma from "../db.server";

export interface UpsertSuggestionInput {
  shop: string;
  resourceId: string;
  resourceType: string;
  fieldKey: string;
  locale: string;
  marketId: string | null;
  sourceValue: string;
  suggestedValue: string;
  provider: string;
}

export async function upsertSuggestion(
  input: UpsertSuggestionInput,
): Promise<TranslationSuggestion> {
  // Prisma's composite-unique `where` typing doesn't accept null for nullable
  // fields even though the underlying SQLite @@unique treats null as distinct.
  // Use findFirst + create/update so null marketId works naturally.
  const existing = await prisma.translationSuggestion.findFirst({
    where: {
      shop: input.shop,
      resourceId: input.resourceId,
      fieldKey: input.fieldKey,
      locale: input.locale,
      marketId: input.marketId,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.translationSuggestion.update({
      where: { id: existing.id },
      data: {
        sourceValue: input.sourceValue,
        suggestedValue: input.suggestedValue,
        provider: input.provider,
        status: "pending",
        editedValue: null,
        reviewedAt: null,
        rejectionReason: null,
      },
    });
  }

  return prisma.translationSuggestion.create({
    data: {
      shop: input.shop,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      fieldKey: input.fieldKey,
      locale: input.locale,
      marketId: input.marketId,
      sourceValue: input.sourceValue,
      suggestedValue: input.suggestedValue,
      provider: input.provider,
      status: "pending",
    },
  });
}

export async function listPendingSuggestions(
  shop: string,
  resourceId: string,
  locale: string,
  marketId: string | null,
): Promise<TranslationSuggestion[]> {
  return prisma.translationSuggestion.findMany({
    where: { shop, resourceId, locale, marketId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSuggestion(
  shop: string,
  id: string,
): Promise<TranslationSuggestion | null> {
  const row = await prisma.translationSuggestion.findUnique({ where: { id } });
  if (!row || row.shop !== shop) return null;
  return row;
}

export async function acceptSuggestion(
  shop: string,
  id: string,
  finalValue: string,
  edited: boolean,
): Promise<TranslationSuggestion> {
  const existing = await prisma.translationSuggestion.findUnique({
    where: { id },
  });
  if (!existing || existing.shop !== shop) {
    throw new Error("Suggestion not found");
  }
  return prisma.translationSuggestion.update({
    where: { id },
    data: {
      status: edited ? "edited" : "accepted",
      editedValue: edited ? finalValue : null,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });
}

export async function rejectSuggestion(
  shop: string,
  id: string,
  reason: string | null,
): Promise<TranslationSuggestion> {
  const existing = await prisma.translationSuggestion.findUnique({
    where: { id },
  });
  if (!existing || existing.shop !== shop) {
    throw new Error("Suggestion not found");
  }
  return prisma.translationSuggestion.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });
}
