import { RequestError } from "../core/validation";
export function googleFailure(error: unknown): RequestError {
  if (error instanceof RequestError) return error;
  const e = error as {
    response?: {
      status?: number;
      data?: { error?: string | { errors?: { reason?: string }[] } };
    };
    code?: string;
  };
  const status = e?.response?.status;
  if (e?.response?.data?.error === "invalid_grant" || status === 401)
    return new RequestError(
      401,
      "google_reauthorization",
      "Reconnect this Google account.",
    );
  const providerError = e?.response?.data?.error;
  const reason =
    typeof providerError === "object"
      ? providerError?.errors?.[0]?.reason
      : undefined;
  if (
    status === 403 &&
    [
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "quotaExceeded",
      "dailyLimitExceeded",
    ].includes(reason ?? "")
  )
    return new RequestError(
      429,
      "google_rate_limit",
      "Google’s request quota was reached. Try again later.",
    );
  if (status === 403)
    return new RequestError(
      403,
      "google_permission",
      "Google denied access. Check permissions or Workspace administrator restrictions.",
    );
  if (status === 412)
    return new RequestError(
      409,
      "google_stale",
      "The Google event changed. Review a fresh proposal.",
    );
  if (status === 404)
    return new RequestError(
      404,
      "google_not_found",
      "The Google item was not found.",
    );
  if (status === 429)
    return new RequestError(
      429,
      "google_rate_limit",
      "Google is busy. Try again later.",
    );
  return new RequestError(
    503,
    "google_unavailable",
    "Google is temporarily unavailable. No success is confirmed.",
  );
}
