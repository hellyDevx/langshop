import type { OnboardingState } from "@prisma/client";
import prisma from "../db.server";
import {
  TOTAL_STEPS,
  type OnboardingPayload,
} from "../utils/onboarding-constants";

export { TOTAL_STEPS } from "../utils/onboarding-constants";
export type { OnboardingPayload } from "../utils/onboarding-constants";

function splitCsv(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getOnboardingState(
  shop: string,
): Promise<OnboardingPayload> {
  const row = await prisma.onboardingState.findUnique({ where: { shop } });
  if (!row) {
    return {
      step: 0,
      primaryLocale: null,
      targetLocales: [],
      selectedProvider: null,
      completedSteps: [],
      completedAt: null,
    };
  }
  return {
    step: row.step,
    primaryLocale: row.primaryLocale ?? null,
    targetLocales: splitCsv(row.targetLocales),
    selectedProvider: row.selectedProvider ?? null,
    completedSteps: splitCsv(row.completedSteps),
    completedAt: row.completedAt ?? null,
  };
}

export async function isOnboardingComplete(shop: string): Promise<boolean> {
  const row = await prisma.onboardingState.findUnique({
    where: { shop },
    select: { completedAt: true },
  });
  return !!row?.completedAt;
}

export async function saveOnboardingState(
  shop: string,
  update: Partial<OnboardingPayload>,
): Promise<OnboardingState> {
  return prisma.onboardingState.upsert({
    where: { shop },
    create: {
      shop,
      step: update.step ?? 0,
      completedSteps: (update.completedSteps ?? []).join(","),
      primaryLocale: update.primaryLocale ?? null,
      targetLocales: (update.targetLocales ?? []).join(","),
      selectedProvider: update.selectedProvider ?? null,
    },
    update: {
      ...(update.step !== undefined ? { step: update.step } : {}),
      ...(update.completedSteps !== undefined
        ? { completedSteps: update.completedSteps.join(",") }
        : {}),
      ...(update.primaryLocale !== undefined
        ? { primaryLocale: update.primaryLocale }
        : {}),
      ...(update.targetLocales !== undefined
        ? { targetLocales: update.targetLocales.join(",") }
        : {}),
      ...(update.selectedProvider !== undefined
        ? { selectedProvider: update.selectedProvider }
        : {}),
    },
  });
}

export async function markOnboardingComplete(shop: string): Promise<void> {
  await prisma.onboardingState.upsert({
    where: { shop },
    create: {
      shop,
      step: TOTAL_STEPS,
      completedSteps: Array.from({ length: TOTAL_STEPS }, (_, i) =>
        String(i),
      ).join(","),
      completedAt: new Date(),
    },
    update: {
      step: TOTAL_STEPS,
      completedAt: new Date(),
    },
  });
}
