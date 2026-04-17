// Prices as of 2026-04 — USD per 1M tokens. Refresh before shipping to prod.
const PROVIDER_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

const CHARS_PER_TOKEN = 4;
const OUTPUT_RATIO = 0.5;

export interface CostEstimate {
  usd: number;
  note: string;
}

export function estimateCost(
  model: string,
  charCount: number,
): CostEstimate | null {
  const price = PROVIDER_PRICES[model];
  if (!price) return null;

  const inputTokens = charCount / CHARS_PER_TOKEN;
  const outputTokens = inputTokens * OUTPUT_RATIO;
  const usd =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;

  return {
    usd: Math.max(0.01, Math.round(usd * 100) / 100),
    note: "Estimate only — check your provider dashboard for actual billing.",
  };
}

export const DEFAULT_MODEL_FOR_PROVIDER: Record<string, string> = {
  claude: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
};

export const AVAILABLE_MODELS: Record<string, string[]> = {
  claude: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
  openai: ["gpt-4o-mini", "gpt-4o"],
};
