"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
export function PrivacyControls({
  conversationId,
  onChanged,
}: {
  conversationId: string | null;
  onChanged: (deletedAccount: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<
      "conversation" | "chats" | "account" | null
    >(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  async function show() {
    setOpen(true);
    setConfirm(null);
    setError("");
    try {
      const r = await fetch("/api/privacy");
      if (!r.ok) throw Error("Couldn’t load privacy controls.");
      setPaused((await r.json()).paused);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn’t load privacy controls.",
      );
    }
  }
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const v = await r.json();
        throw Error(v.error ?? "Privacy action failed. Please try again.");
      }
      setOpen(false);
      onChanged(confirm === "account");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t update privacy.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="text-control" onClick={() => void show()}>
        Privacy
      </button>
      <dialog
        ref={dialog}
        className="privacy-dialog"
        aria-labelledby="privacy-title"
        onCancel={() => setOpen(false)}
      >
        <h2 id="privacy-title">Your space, your data.</h2>
        <p>
          <Link href="/privacy">How Sahaay uses your data</Link>
          <br />
          <Link href="/connect/telegram">Connect or disconnect Telegram</Link>
        </p>
        {!confirm ? (
          <>
            <p>
              {paused
                ? "Your assistant is paused. History and deletion controls remain available."
                : "Pause processing or delete your data here. Memory, personal-state and saved-item changes work through chat."}
            </p>
            <button
              disabled={busy}
              onClick={() => void action({ target: "pause", paused: !paused })}
            >
              {paused ? "Resume assistant" : "Pause assistant"}
            </button>
            {conversationId && (
              <button
                disabled={busy}
                onClick={() => setConfirm("conversation")}
              >
                Delete this conversation
              </button>
            )}
            <button disabled={busy} onClick={() => setConfirm("chats")}>
              Delete all conversations
            </button>
            <button
              disabled={busy}
              className="danger"
              onClick={() => setConfirm("account")}
            >
              Delete account
            </button>
          </>
        ) : (
          <>
            <p>
              {confirm === "account"
                ? "This deletes your account, sessions, conversations, memories, saved items and uploaded media."
                : "This deletes conversation history and its media. Separately saved memories and items remain."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(
                  confirm === "account"
                    ? {
                        target: "account",
                        confirmation: String(f.get("confirmation")),
                        password: String(f.get("password")),
                      }
                    : confirm === "conversation"
                      ? { target: "conversation", id: conversationId }
                      : { target: "chats" },
                );
              }}
            >
              {confirm === "account" && (
                <>
                  <label>
                    Current password
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      maxLength={128}
                    />
                  </label>
                  <label>
                    Type DELETE to confirm
                    <input
                      name="confirmation"
                      required
                      pattern="DELETE"
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
              <button className="danger" disabled={busy}>
                {busy ? "Deleting…" : "Confirm deletion"}
              </button>
            </form>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} onClick={() => setOpen(false)}>
          Close privacy
        </button>
      </dialog>
    </>
  );
}
