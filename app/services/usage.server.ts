import prisma from "../db.server";
import { createAlert, hasUndismissedOfType } from "./alerts.server";

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const QUOTA_WARNING_THRESHOLD = 0.8;

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

  const config = await prisma.translationProviderConfig.findUnique({
    where: { shop_provider: { shop, provider } },
  });
  if (!config) return;

  const priorUsage = config.quotaUsed;
  const newUsage = priorUsage + charCount;
  await prisma.translationProviderConfig.update({
    where: { id: config.id },
    data: { quotaUsed: newUsage },
  });

  if (!config.monthlyQuota || config.monthlyQuota <= 0) return;

  const wasUnderThreshold =
    priorUsage / config.monthlyQuota < QUOTA_WARNING_THRESHOLD;
  const nowOverThreshold =
    newUsage / config.monthlyQuota >= QUOTA_WARNING_THRESHOLD;

  if (wasUnderThreshold && nowOverThreshold) {
    const already = await hasUndismissedOfType(shop, "quota_warning");
    if (!already) {
      const pct = Math.round((newUsage / config.monthlyQuota) * 100);
      await createAlert({
        shop,
        type: "quota_warning",
        severity: "warning",
        message: `${provider} has used ${pct}% of its monthly quota (${newUsage.toLocaleString()} / ${config.monthlyQuota.toLocaleString()} characters).`,
      });
    }
  }
}
