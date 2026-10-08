"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function ConnectTelegram({
  linked,
  username,
}: {
  linked: boolean;
  username: string;
}) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [connected, setConnected] = useState(linked);
  const token = url ? new URL(url).searchParams.get("start") : null;
  const appUrl = `tg://resolve?domain=${encodeURIComponent(username)}${token ? `&start=${encodeURIComponent(token)}` : ""}`;
  const webUrl = `https://web.telegram.org/k/#@${encodeURIComponent(username)}`;
  useEffect(() => {
    if (!url || connected) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/telegram/link", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (active && result.linked) {
          setConnected(true);
          setUrl("");
          setCopied(false);
        }
      } catch {
        /* A temporary connection failure does not invalidate the link. */
      }
    };
    const interval = setInterval(() => void check(), 3000);
    const expiry = setTimeout(() => {
      setUrl("");
      setCopied(false);
      setError(
        "This connection link expired. Create a fresh link to continue.",
      );
    }, 600000);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(expiry);
    };
  }, [url, connected]);
  async function act(disconnect = false) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/telegram/link", {
        method: disconnect ? "DELETE" : "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error ?? "Couldn’t connect Telegram.");
      if (disconnect) {
        setConnected(false);
        setUrl("");
      } else setUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t connect Telegram.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <h1>Sahaay on Telegram.</h1>
        <p>
          Link Telegram to this account once. Your memories and saved items are
          shared; Telegram conversations also appear in Web Chat.
        </p>
        <p>
          Telegram processes and retains its own chat copies. Sahaay’s deletion
          controls do not delete Telegram’s copies.
        </p>
        {connected ? (
          <>
            <p role="status">
              Your Telegram account is connected. Send a message to @{username}.
            </p>
            <p>
              <a href={appUrl}>Open Telegram app</a> ·{" "}
              <a href={webUrl} target="_blank" rel="noreferrer">
                Open Telegram Web
              </a>
            </p>
            <button
              className="primary auth-submit"
              disabled={busy}
              onClick={() => void act(true)}
            >
              Disconnect Telegram
            </button>
          </>
        ) : (
          <button
            className="primary auth-submit"
            disabled={busy}
            onClick={() => void act()}
          >
            {busy ? "Creating link…" : "Create Telegram link"}
          </button>
        )}
        {url && (
          <div>
            <p>
              <a href={appUrl}>Open Telegram app</a> ·{" "}
              <a href={webUrl} target="_blank" rel="noreferrer">
                Open Telegram Web
              </a>
            </p>
            <p>
              The app button requires Telegram to be installed. If your browser
              blocks opening it, use Telegram Web or Telegram on your phone.
              This page will confirm when linking succeeds.
            </p>
            <p>
              In Telegram Web or on your phone, search for @{username}, open the
              bot chat, and send this connection command. It is single-use,
              expires in ten minutes, and must not be shared:
            </p>
            <p style={{ overflowWrap: "anywhere" }}>
              <code>/start {token}</code>
            </p>
            <button
              className="primary auth-submit"
              onClick={() => {
                if (!navigator.clipboard) {
                  setError("Select and copy the command above manually.");
                  return;
                }
                void navigator.clipboard
                  .writeText(`/start ${token}`)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Select and copy the command above manually."),
                  );
              }}
            >
              {copied ? "Command copied" : "Copy connection command"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p>
          <Link href="/">Back to Web Chat</Link>
        </p>
      </section>
    </main>
  );
}
