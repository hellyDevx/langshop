import prisma from "../db.server";

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function recordProviderUsage(
  shop: string,
  provider: string,
  locale: string,
  charCount: number,
): Promise<void> {
  const date = todayUtc();
  await prisma.usageTracking.upsert({
    where: {
      shop_provider_locale_date: { shop, provider, locale, date },
    },
    create: {
      shop,
      provider,
      locale,
      date,
      characterCount: charCount,
      requestCount: 1,
    },
    update: {
      characterCount: { increment: charCount },
      requestCount: { increment: 1 },
    },
  });
}
