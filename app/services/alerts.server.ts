import type { TranslationAlert } from "@prisma/client";
import prisma from "../db.server";

export type AlertType = "failure" | "stale" | "quota_warning" | "job_error";
export type AlertSeverity = "info" | "warning" | "critical";

export interface CreateAlertInput {
  shop: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  resourceId?: string | null;
  locale?: string | null;
  jobId?: string | null;
}

export async function createAlert(
  input: CreateAlertInput,
): Promise<TranslationAlert> {
  return prisma.translationAlert.create({
    data: {
      shop: input.shop,
      type: input.type,
      severity: input.severity,
      message: input.message,
      resourceId: input.resourceId ?? null,
      locale: input.locale ?? null,
      jobId: input.jobId ?? null,
    },
  });
}

export interface ListAlertsOptions {
  includeDismissed?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listAlerts(
  shop: string,
  options?: ListAlertsOptions,
): Promise<{
  alerts: TranslationAlert[];
  hasMore: boolean;
  endCursor: string | null;
}> {
  const limit = options?.limit ?? 25;
  const alerts = await prisma.translationAlert.findMany({
    where: {
      shop,
      ...(options?.includeDismissed ? {} : { dismissed: false }),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options?.cursor
      ? { skip: 1, cursor: { id: options.cursor } }
      : {}),
  });
  const hasMore = alerts.length > limit;
  if (hasMore) alerts.pop();
  return {
    alerts,
    hasMore,
    endCursor: alerts.length > 0 ? alerts[alerts.length - 1].id : null,
  };
}

export async function dismissAlert(
  shop: string,
  id: string,
): Promise<void> {
  const alert = await prisma.translationAlert.findUnique({ where: { id } });
  if (!alert || alert.shop !== shop) return;
  await prisma.translationAlert.update({
    where: { id },
    data: { dismissed: true },
  });
}

export async function dismissAll(shop: string): Promise<number> {
  const result = await prisma.translationAlert.updateMany({
    where: { shop, dismissed: false },
    data: { dismissed: true },
  });
  return result.count;
}

export async function countUndismissed(shop: string): Promise<number> {
  return prisma.translationAlert.count({
    where: { shop, dismissed: false },
  });
}

export async function hasUndismissedOfType(
  shop: string,
  type: AlertType,
): Promise<boolean> {
  const count = await prisma.translationAlert.count({
    where: { shop, type, dismissed: false },
  });
  return count > 0;
}
