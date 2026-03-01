/**
 * Exponential-backoff retry wrapper for async operations.
 *
 * Used primarily for email dispatch so transient email-service hiccups do not
 * immediately surface as user-visible errors.
 *
 * Usage:
 *   const result = await withRetry(() => sendEmail(...), { maxAttempts: 3 });
 *   if (!result.success) { ... handle graceful fallback ... }
 */

export interface RetryConfig {
  /** Total number of attempts (including the first). Defaults to 3. */
  maxAttempts: number;
  /** Delay after the first failure in ms. Doubles each attempt. Defaults to 1 000. */
  initialDelayMs: number;
  /** Upper bound for calculated delays. Defaults to 30 000. */
  maxDelayMs: number;
  /** Multiplier applied to the delay after each failure. Defaults to 2. */
  backoffMultiplier: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  /** Number of attempts that were made */
  attempts: number;
  /** Total time spent waiting between retries (ms) */
  totalDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `operation` up to `config.maxAttempts` times with exponential backoff
 * between failures. Resolves (never rejects) — inspect `result.success` to
 * determine whether to proceed or fall back.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const data = await operation();
      return { success: true, data, attempts: attempt, totalDelayMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < cfg.maxAttempts) {
        const delayMs = Math.min(
          cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
          cfg.maxDelayMs
        );
        totalDelayMs += delayMs;

        if (process.env.NODE_ENV !== "test") {
          console.warn(
            JSON.stringify({
              ts: new Date().toISOString(),
              service: "email-retry",
              event: "retry_attempt",
              attempt,
              maxAttempts: cfg.maxAttempts,
              delayMs,
              error: lastError.message,
            })
          );
        }

        await sleep(delayMs);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: cfg.maxAttempts,
    totalDelayMs,
  };
}
