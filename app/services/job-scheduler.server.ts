import {
  claimNextJob,
  recoverStrandedJobs,
  runTranslationJob,
} from "./auto-translate.server";

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_STALE_MS = 5 * 60_000;
const MAX_JOBS_PER_TICK = 3;

let started = false;

export function startJobPicker(options: {
  intervalMs?: number;
  staleAfterMs?: number;
} = {}): void {
  if (started) return;
  started = true;

  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_TICK_MS;

  void recoverOnStartup(staleAfterMs);

  setInterval(() => {
    void tick().catch((err) => {
      console.error("[scheduler] tick failed:", err);
    });
  }, intervalMs);
}

async function recoverOnStartup(staleAfterMs: number): Promise<void> {
  try {
    const recovered = await recoverStrandedJobs(staleAfterMs);
    if (recovered > 0) {
      console.log(`[scheduler] recovered ${recovered} stranded job(s)`);
    }
  } catch (err) {
    console.error("[scheduler] startup recovery failed:", err);
  }
}

async function tick(): Promise<void> {
  for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
    const claimed = await claimNextJob();
    if (!claimed) return;
    try {
      await runTranslationJob(claimed.job.id, {
        apiKey: claimed.providerConfig.apiKey,
        projectId: claimed.providerConfig.projectId ?? undefined,
      });
    } catch (err) {
      console.error(`[scheduler] job ${claimed.job.id} failed:`, err);
    }
  }
}
