import { getPool } from "@/db";
import { getAuth } from "@/auth";
import { GoogleConnections, googleConfiguration } from "@/google/connections";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    const result = await new GoogleConnections(getPool()).callback(
      url.searchParams.get("state") ?? "",
      url.searchParams.get("code"),
      url.searchParams.has("error"),
      session?.user.id,
    );
    const path =
      result.platform === "mobile"
        ? "/connect/google/complete"
        : "/settings/connected";
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          googleConfiguration().base +
          path +
          "?google=" +
          (result.success ? "complete" : "cancelled") +
          ("reference" in result
            ? "&reference=" +
              encodeURIComponent(result.reference!) +
              "&transactionId=" +
              result.transactionId
            : ""),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    // Never reflect provider codes, tokens, raw errors or attacker destinations.
    const messages: Record<string, string> = {
      google_state:
        "Your connection attempt expired, was already used, or belongs to a different sign-in. Return to Sahaay and start again in the same browser.",
      google_scopes:
        "Google returned permissions that Sahaay does not support. Return to Sahaay and start a fresh connection.",
      google_account_changed:
        "The Google account or connection changed. Reconnect using the same account; use Add another Google account to connect a different one.",
      google_identity:
        "Google identity verification failed. Return to Sahaay and start again.",
      google_reauthorization:
        "Google authorization expired or was revoked. Return to Sahaay and reconnect.",
      google_permission:
        "Google denied access. Check your test-user permissions or Workspace administrator restrictions, then start again.",
    };
    return new Response(
      (error instanceof RequestError && messages[error.code]) ||
        "Google connection could not be completed. Return to Sahaay and start again.",
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}
