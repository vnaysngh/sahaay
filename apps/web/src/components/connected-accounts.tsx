"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectionsSchema,
  googlePermissions,
  approvalSchema,
  actionDetails,
  actionTitle,
  actionStatus,
  type Capability,
} from "@sahaay/api-client";
import { z } from "zod";
import { Unplug } from "lucide-react";
type Connections = z.infer<typeof connectionsSchema>;
type Approval = z.infer<typeof approvalSchema>;
const allPermissions = googlePermissions.map(
  (permission) => permission.capability,
);
async function request(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const r = await fetch(path, {
    method,
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Could not complete this request.");
  return data;
}
export function ConnectedAccounts() {
  const [data, setData] = useState<Connections>(),
    [actions, setActions] = useState<Approval[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [disconnectAccount, setDisconnectAccount] =
      useState<Connections["connections"][number]>(),
    [disconnectError, setDisconnectError] = useState(""),
    [notice, setNotice] = useState("");
  const disconnectDialog = useRef<HTMLDialogElement>(null);
  const cancelDisconnect = useRef<HTMLButtonElement>(null);
  const disconnectInFlight = useRef(false);
  useEffect(() => {
    const dialog = disconnectDialog.current;
    if (disconnectAccount && !dialog?.open) {
      dialog?.showModal();
      cancelDisconnect.current?.focus();
    } else if (!disconnectAccount && dialog?.open) dialog.close();
  }, [disconnectAccount]);
  const refresh = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        request("/api/connections/google"),
        request("/api/actions"),
      ]);
      setData(connectionsSchema.parse(c));
      setActions(z.array(approvalSchema).parse(a));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load connections.");
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      request("/api/connections/google"),
      request("/api/actions"),
    ])
      .then(([c, a]) => {
        if (active) {
          setData(connectionsSchema.parse(c));
          setActions(z.array(approvalSchema).parse(a));
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load connections.",
          );
      });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  async function authorize(capabilities: Capability[], connectionId?: string) {
    setBusy(true);
    setError("");
    try {
      const r = z.object({ url: z.string().url() }).parse(
        await request("/api/connections/google/authorize", {
          capabilities,
          connectionId,
          platform: "web",
        }),
      );
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      setBusy(false);
    }
  }
  async function perform(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!disconnectAccount || disconnectInFlight.current) return;
    disconnectInFlight.current = true;
    setBusy(true);
    setDisconnectError("");
    setNotice("");
    try {
      const result = await request(
        "/api/connections/google",
        { connectionId: disconnectAccount.id },
        "DELETE",
      );
      setDisconnectAccount(undefined);
      setNotice(
        result.revocationConfirmed
          ? "Google account disconnected. Sahaay’s access and connection details have been removed."
          : "Disconnected from Sahaay. Google revocation could not be confirmed. Remove Sahaay in your Google account’s third-party access settings too.",
      );
      await refresh();
    } catch (e) {
      setDisconnectError(
        e instanceof Error
          ? e.message
          : "Could not disconnect. Please try again.",
      );
    } finally {
      disconnectInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="connections-stack">
      <p>
        Connect Google separately from your Sahaay login. Choose only the access
        you need. Relevant private email and event content is sent to our AI
        provider when you ask Sahaay to read or summarize it. We do not import
        your mailbox or automatically create memories.
      </p>
      <p>
        <a href="/privacy">Privacy and Google data use</a>
      </p>
      {notice && (
        <p className="connection-notice" role="status">
          {notice}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading connected accounts…</p>}
      {data && !data.configured && (
        <p>
          Google connections need server configuration before you can connect.
        </p>
      )}
      <section className="connection-card">
        <h2>Google</h2>
        <p>
          Choose which Gmail and Calendar permissions to allow on Google’s
          consent screen. You can decline permissions you do not need.
        </p>
        <button
          disabled={busy || !data?.configured}
          onClick={() => void authorize(allPermissions)}
        >
          {data?.connections.length
            ? "Add another Google account"
            : "Connect Google account"}
        </button>
      </section>
      {data?.connections.map((c) => (
        <section className="connection-card" key={c.id}>
          <h2 className="connection-identity">
            <span className="connection-avatar" aria-hidden="true">
              {Array.from(c.displayName.trim())[0] ?? "G"}
            </span>
            {c.displayName}
          </h2>
          <p>{c.email}</p>
          {c.status !== "connected" && (
            <p role="status">
              {c.status === "disconnected"
                ? "Google account disconnected"
                : "Reconnect Google to restore access"}
            </p>
          )}
          <div className="connection-services">
            {(["gmail_read", "calendar_read"] as Capability[]).map((cap) => {
              const connected =
                c.status === "connected" && c.capabilities.includes(cap);
              const service =
                cap === "gmail_read" ? "Gmail" : "Google Calendar";
              return (
                <div className="connection-service" key={cap}>
                  <div>
                    <h3>{service}</h3>
                    <p className={connected ? "connection-granted" : ""}>
                      {connected
                        ? "Connected · Read access"
                        : c.status !== "connected"
                          ? "Not connected"
                          : "Not connected · Permission needed"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="connection-access-list">
            <h3>Access you have granted</h3>
            <ul>
              {googlePermissions.map(({ capability, title }) => (
                <li key={capability}>
                  {title}:{" "}
                  <strong>
                    {c.capabilities.includes(capability)
                      ? "Granted"
                      : "Not granted"}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
          {c.status === "connected" && (
            <div className="connection-permissions">
              <button
                disabled={busy || !data?.configured}
                onClick={() => void authorize(allPermissions, c.id)}
              >
                Review permissions in Google
              </button>
              <p>
                You choose on Google’s consent screen. To remove previously
                granted access completely, disconnect and connect again.
              </p>
            </div>
          )}
          <p className="connection-last-used">
            Last successful use:{" "}
            {c.lastSuccessfulUseAt
              ? new Date(c.lastSuccessfulUseAt).toLocaleString()
              : "Not used yet"}
            . Access is checked when used.
          </p>
          <div className="connection-actions">
            {c.status !== "connected" && (
              <button
                disabled={busy || !data?.configured}
                onClick={() => void authorize(allPermissions, c.id)}
              >
                Reconnect Google account
              </button>
            )}
            {c.status !== "disconnected" && (
              <button
                disabled={busy}
                onClick={() => {
                  setDisconnectError("");
                  setDisconnectAccount(c);
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </section>
      ))}
      <dialog
        ref={disconnectDialog}
        className="connection-disconnect-dialog"
        role="alertdialog"
        aria-labelledby="disconnect-title"
        aria-describedby="disconnect-description disconnect-consequence"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const first = buttons[0],
            last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first && last) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            document.activeElement === last &&
            first
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          if (!disconnectInFlight.current) setDisconnectAccount(undefined);
        }}
      >
        <div className="disconnect-heading">
          <span className="disconnect-icon" aria-hidden="true">
            <Unplug size={24} />
          </span>
          <h2 id="disconnect-title">Disconnect Google account?</h2>
        </div>
        <p className="disconnect-account">{disconnectAccount?.email}</p>
        <p id="disconnect-description">
          Sahaay will lose access to Gmail and Google Calendar for this account.
        </p>
        <p id="disconnect-consequence" className="disconnect-consequence">
          Your connection details and credentials will be removed, and pending
          actions cancelled. Existing emails, drafts and calendar events stay in
          Google.
        </p>
        {disconnectError && <p role="alert">{disconnectError}</p>}
        <div className="disconnect-dialog-actions">
          <button
            ref={cancelDisconnect}
            disabled={busy}
            onClick={() => setDisconnectAccount(undefined)}
          >
            Cancel
          </button>
          <button
            className="disconnect-confirm"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </dialog>
      <section aria-label="Action approvals">
        <h2>Review actions</h2>
        <p>
          Confirm the exact account and details below. Invitations and email
          sends happen only after approval. Approvals expire after ten minutes.
        </p>
        {!actions.length && <p>No current actions to review.</p>}
        {actions.map((a) => (
          <article className="connection-card" key={a.id}>
            <h3>{actionTitle(a.proposal.kind)}</h3>
            <p>Account: {a.accountEmail}</p>
            <p>
              {actionStatus(a.status)} · Expires{" "}
              {new Date(a.expiresAt).toLocaleTimeString()}
            </p>
            <dl>
              {actionDetails(a.proposal, a.preview).map(([label, value]) => (
                <div key={label}>
                  <dt>
                    <strong>{label}</strong>
                  </dt>
                  <dd className="action-preview">{value}</dd>
                </div>
              ))}
            </dl>
            {a.proposal.kind.startsWith("calendar_") && (
              <p>
                Google will notify affected attendees. For recurring events,
                check the occurrence/series scope carefully.
              </p>
            )}
            {a.status === "succeeded" && (
              <p>{actionTitle(a.proposal.kind)} completed in Google.</p>
            )}
            {a.status === "pending" && (
              <div className="connection-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      request("/api/actions", {
                        id: a.id,
                        decision: "approve",
                      }),
                    )
                  }
                >
                  Approve this exact action
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      request("/api/actions", { id: a.id, decision: "cancel" }),
                    )
                  }
                >
                  Cancel
                </button>
              </div>
            )}
            {a.status === "unknown" && (
              <p>
                Google’s outcome is uncertain. Check Gmail or Calendar directly
                before doing anything again.
              </p>
            )}
          </article>
        ))}
      </section>
      <button disabled={busy} onClick={() => void refresh()}>
        Refresh status
      </button>
    </div>
  );
}
