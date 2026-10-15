import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
// Standard full-jitter backoff. Honor Retry-After; fail instead of retrying
// earlier when Google's requested wait exceeds this interactive request budget.
export function retryDelay(
  defaultDelay: number,
  retryAfter: string | null,
  now = Date.now(),
  jitter = randomInt(0, 1001) / 1000,
) {
  const requested =
    retryAfter === null
      ? 0
      : /^\d+(\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : Date.parse(retryAfter) - now;
  const minimum = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  if (minimum > 5000) return null;
  return Math.ceil(
    minimum + Math.min(2000, Math.max(0, defaultDelay)) * jitter,
  );
}
export async function googleReadBackoff(
  error: { response?: { headers: Headers }; config?: { signal?: AbortSignal | null } },
  defaultDelay: number,
) {
  const ms = retryDelay(
    defaultDelay,
    error.response?.headers.get("retry-after") ?? null,
  );
  if (ms === null) throw error;
  await delay(ms, undefined, { signal: error.config?.signal ?? undefined });
}
