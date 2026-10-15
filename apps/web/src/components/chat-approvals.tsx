"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  approvalSchema,
  actionDetails,
  actionStatus,
  actionTitle,
} from "@sahaay/api-client";
type Approval = z.infer<typeof approvalSchema>;
export function ChatApprovals({
  conversationId,
  revision,
  children,
  turns,
}: {
  turns: string[];
  conversationId: string;
  revision: string;
  children: (renderAction: (requestId: string) => ReactNode) => ReactNode;
}) {
  const [actions, setActions] = useState<Approval[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const readSequence = useRef(0);
  const path =
    "/api/actions?conversationId=" + encodeURIComponent(conversationId);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    async function load() {
      if (inFlight.current) return;
      const sequence = ++readSequence.current;
      try {
        const response = await fetch(path, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Could not load action approvals. Refresh to check before sending again.",
          );
        const rows = z.array(approvalSchema).parse(await response.json());
        if (!controller.signal.aborted && sequence === readSequence.current)
          setActions(rows);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load approvals.",
          );
      }
    }
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, revision, conversationId]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const future = actions
      .filter((a) => a.status === "pending")
      .map((a) => Date.parse(a.expiresAt))
      .filter((time) => time > Date.now());
    if (!future.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(...future) - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [actions, clock]);
  async function decide(id: string, decision: "approve" | "cancel") {
    if (inFlight.current) return;
    inFlight.current = true;
    readSequence.current++;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ??
            "Could not confirm the outcome. Check Google before trying again.",
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Outcome could not be confirmed. Check Google before trying again.",
      );
    } finally {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not refresh action status.");
        setActions(z.array(approvalSchema).parse(await response.json()));
      } catch {
        setActions((previous) =>
          previous.map((a) => (a.id === id ? { ...a, status: "unknown" } : a)),
        );
        setError(
          "Could not verify action status. Check Google before trying again.",
        );
      }
      inFlight.current = false;
      setBusy(false);
    }
  }
  function renderAction(requestId: string) {
    const matching = actions.filter(
      (a) =>
        (turns.includes(a.requestId ?? "")
          ? a.requestId
          : turns.find((id) => a.requestIds?.includes(id))) === requestId,
    );
    const linked = actions.some((a) => a.requestIds?.includes(requestId));
    if (!matching.length)
      return linked ? (
        <p className="chat-action-receipt">
          This action is already shown with its original request.
        </p>
      ) : null;
    return (
      <section
        className="chat-action-approvals"
        aria-label="Actions in this conversation"
      >
        {matching.map((a) => {
          const active =
            ["pending", "executing", "unknown"].includes(a.status) &&
            !(a.status === "pending" && Date.parse(a.expiresAt) <= clock);
          const status =
            a.status === "pending" && Date.parse(a.expiresAt) <= clock
              ? "Expired"
              : actionStatus(a.status);
          const content = (
            <>
              {active && <h3>{actionTitle(a.proposal.kind)}</h3>}
              <p>From account: {a.accountEmail}</p>
              {active && (
                <p role="status">
                  {status}
                  {a.status === "pending"
                    ? " · Approve before " +
                      new Date(a.expiresAt).toLocaleTimeString()
                    : ""}
                </p>
              )}
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
                  Google may notify attendees. Review the event and
                  recurring-event scope before approving.
                </p>
              )}
              {a.status === "pending" && (
                <div className="connection-actions">
                  <button
                    disabled={busy || Date.parse(a.expiresAt) <= clock}
                    onClick={() => void decide(a.id, "approve")}
                  >
                    {busy
                      ? "Checking action…"
                      : "Approve " + actionTitle(a.proposal.kind).toLowerCase()}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void decide(a.id, "cancel")}
                  >
                    Cancel action
                  </button>
                </div>
              )}
              {a.status === "unknown" && (
                <p>
                  Outcome uncertain. Check Gmail or Calendar before trying
                  again; Sahaay will not resend automatically.
                </p>
              )}
              <small>
                Approval expires after 10 minutes. This encrypted action record
                is retained for up to 7 days.
              </small>
            </>
          );
          return active ? (
            <article className="chat-action-card" key={a.id}>
              {content}
            </article>
          ) : (
            <div className="chat-action-receipt" key={a.id}>
              <strong>
                {actionTitle(a.proposal.kind)} · {status}
              </strong>
              {a.status === "succeeded" && (
                <details className="chat-action-sent">
                  <summary>View sent details</summary>
                  <div className="chat-action-detail-body">{content}</div>
                </details>
              )}
            </div>
          );
        })}
      </section>
    );
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {children(renderAction)}
    </>
  );
}
