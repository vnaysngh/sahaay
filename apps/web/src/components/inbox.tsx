"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type { Followup } from "../core/followups";
import { localDate } from "../core/followups";
type Data = { timezone: string | null; recent: Followup[]; now: string };
export function Inbox() {
  const [data, setData] = useState<Data | null>(null),
    [zone, setZone] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [when, setWhen] = useState(""),
    [pendingStop, setPendingStop] = useState<{
      id: string;
      version: number;
      reason: string;
      action: "cancel" | "dismiss";
    } | null>(null);
  const generation = useRef(0),
    zoneEdited = useRef(false);
  async function refresh() {
    const sequence = ++generation.current;
    const r = await fetch("/api/inbox", { cache: "no-store" });
    if (!r.ok) throw Error("Inbox unavailable. Please try again.");
    const d: Data = await r.json();
    if (sequence !== generation.current) return;
    setData(d);
    setZone(d.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  useEffect(() => {
    let alive = true;
    const sequence = ++generation.current;
    const read = async () => {
      try {
        const r = await fetch("/api/inbox", { cache: "no-store" });
        if (!r.ok) throw Error("Inbox unavailable. Please try again.");
        const d: Data = await r.json();
        if (alive && sequence === generation.current) {
          setData(d);
          if (!zoneEdited.current)
            setZone(
              d.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            );
        }
      } catch (e) {
        if (alive && sequence === generation.current)
          setError((e as Error).message);
      }
    };
    void read();
    return () => {
      alive = false;
    };
  }, []);
  async function act(body: unknown) {
    ++generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const result = await r.json();
        throw Error(result.error);
      }
      setEditing(null);
      setPendingStop(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = new Date(),
    active =
      data?.recent.filter((r) => ["scheduled", "ready"].includes(r.status)) ??
      [],
    today = active.filter(
      (r) =>
        new Date(r.scheduledFor) <= current ||
        localDate(new Date(r.scheduledFor), data?.timezone ?? r.timezone).slice(
          0,
          10,
        ) === localDate(current, data?.timezone ?? r.timezone).slice(0, 10),
    ),
    upcoming = active.filter((r) => !today.includes(r)),
    closed = data?.recent.filter((r) => !active.includes(r)) ?? [];
  function row(r: Followup) {
    return (
      <article className="inbox-row" key={r.id}>
        <div>
          <h3>{r.relatedTitle ?? r.reason}</h3>
          {r.relatedTitle && <p>{r.reason}</p>}
          <p className="inbox-date">
            {new Intl.DateTimeFormat(undefined, {
              timeZone: r.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(r.scheduledFor))}{" "}
            · {r.timezone}
          </p>
          <small>
            {r.status === "scheduled"
              ? "Scheduled"
              : r.status !== "ready"
                ? r.status
                : r.deliveryStatus === "delivered"
                  ? "Delivered to Telegram"
                  : r.deliveryStatus === "unknown"
                    ? "Telegram delivery uncertain; not resent"
                    : r.deliveryStatus === "failed"
                      ? "Telegram delivery failed; still here"
                      : "Ready in your Inbox"}
          </small>
        </div>
        {active.includes(r) && (
          <div className="inbox-actions">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await act({ action: "open", id: r.id, version: r.version });
              }}
            >
              Details
            </button>
            {r.relatedObjectId && (
              <Link href={`/state?object=${r.relatedObjectId}`}>
                Related state
              </Link>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act({ action: "done", id: r.id, version: r.version })
              }
            >
              Mark done
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(r.id);
                setWhen(localDate(new Date(r.scheduledFor), r.timezone));
                setZone(r.timezone);
              }}
            >
              Reschedule
            </button>
            <details className="inbox-more">
              <summary>More</summary>
              <div className="inbox-more-menu">
                <button
                  type="button"
                  title="Close without marking the task complete; no further reminder"
                  disabled={busy}
                  onClick={() =>
                    setPendingStop({
                      action: "dismiss",
                      id: r.id,
                      version: r.version,
                      reason: r.reason,
                    })
                  }
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setPendingStop({
                      action: "cancel",
                      id: r.id,
                      version: r.version,
                      reason: r.reason,
                    })
                  }
                >
                  Cancel
                </button>
              </div>
            </details>
          </div>
        )}
        {!active.includes(r) && (
          <p className="inbox-date">
            {(
              {
                web_inbox: "Closed through Web Inbox",
                chat_web: "Closed through Web chat",
                chat_telegram: "Closed through Telegram chat",
                related_state: "Cancelled when related state was deleted",
                backup_restore: "Cancelled during backup recovery",
                legacy: "Historical change: initiating source was not recorded",
              } as Record<string, string>
            )[r.lifecycleSource ?? "legacy"] ?? "Lifecycle change recorded"}
            {r.lifecycleChangedAt
              ? ` · ${new Intl.DateTimeFormat(undefined, { timeZone: r.timezone, dateStyle: "medium", timeStyle: "medium" }).format(new Date(r.lifecycleChangedAt))}`
              : ""}
          </p>
        )}
        {r.openedAt && (
          <p className="inbox-date">
            Why this is here: you explicitly asked for this one-off reminder.
            Created {new Date(r.createdAt).toLocaleDateString()}.{" "}
            <Link href="/">Discuss with Sahaay</Link>
          </p>
        )}
        {editing === r.id && (
          <form
            className="inbox-reschedule"
            onSubmit={(e) => {
              e.preventDefault();
              void act({
                action: "reschedule",
                id: r.id,
                version: r.version,
                localTime: when,
                timezone: zone,
              });
            }}
          >
            <label>
              New date and time
              <input
                type="datetime-local"
                required
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <label>
              Reminder timezone
              <input
                required
                value={zone}
                onChange={(e) => {
                  zoneEdited.current = true;
                  setZone(e.target.value);
                }}
              />
            </label>
            <button disabled={busy} type="submit">
              Save time
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Keep current time
            </button>
          </form>
        )}
      </article>
    );
  }
  return (
    <div className="inbox">
      <form
        className="inbox-timezone"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "timezone", timezone: zone });
        }}
      >
        <label>
          Your timezone
          <input
            required
            aria-describedby="timezone-note"
            value={zone}
            onChange={(e) => {
              zoneEdited.current = true;
              setZone(e.target.value);
            }}
            placeholder="Asia/Kolkata"
          />
        </label>
        <button disabled={busy || !zone}>Confirm timezone</button>
        <p id="timezone-note">
          {data?.timezone
            ? `Confirmed: ${data.timezone}`
            : "Confirm your timezone before asking for reminders. The suggested timezone is not saved until you confirm it."}
        </p>
      </form>
      {pendingStop && (
        <section
          role="alertdialog"
          aria-label="Confirm stopping reminder"
          className="inbox-stop-confirmation"
        >
          <h2>
            {pendingStop.action === "cancel"
              ? "Cancel this reminder?"
              : "Dismiss this reminder?"}
          </h2>
          <p>{pendingStop.reason}</p>
          <p>Sahaay will stop reminding you about this.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act({
                action: pendingStop.action,
                id: pendingStop.id,
                version: pendingStop.version,
                confirmed: true,
              })
            }
          >
            {pendingStop.action === "cancel"
              ? "Cancel reminder"
              : "Dismiss reminder"}
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => setPendingStop(null)}
          >
            Keep reminder
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Loading your Inbox…</p>}
      {data && (
        <>
          <section>
            <h2>
              Today <span>{today.length}</span>
            </h2>
            {today.length ? (
              today.map(row)
            ) : (
              <p className="inbox-empty">Nothing needs your attention today.</p>
            )}
          </section>
          <section>
            <h2>
              Upcoming <span>{upcoming.length}</span>
            </h2>
            {upcoming.length ? (
              upcoming.map(row)
            ) : (
              <p className="inbox-empty">
                Ask Sahaay to remind you about something, with a date and time.
              </p>
            )}
          </section>
          {closed.length > 0 && (
            <details>
              <summary>Closed · {closed.length}</summary>
              {closed.map(row)}
            </details>
          )}
          <p className="state-footer">
            One-off reminders only. Delivery requires the Sahaay server to be
            running. <Link href="/connect/telegram">Connect Telegram</Link> to
            receive them there. <Link href="/">Talk to Sahaay →</Link>
          </p>
        </>
      )}
    </div>
  );
}
