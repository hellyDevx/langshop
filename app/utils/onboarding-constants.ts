export const TOTAL_STEPS = 6;

export interface OnboardingPayload {
  step: number;
  primaryLocale: string | null;
  targetLocales: string[];
  selectedProvider: string | null;
  completedSteps: string[];
  completedAt: Date | string | null;
}
