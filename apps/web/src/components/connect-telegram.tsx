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
    [statusError, setStatusError] = useState(""),
    [checking, setChecking] = useState(false),
    [refreshVersion, setRefreshVersion] = useState(0),
    [copied, setCopied] = useState(false),
    [connected, setConnected] = useState(linked);
  const token = url ? new URL(url).searchParams.get("start") : null;
  const appUrl = `tg://resolve?domain=${encodeURIComponent(username)}${token ? `&start=${encodeURIComponent(token)}` : ""}`;
  // Web K accepts a tg:// deep link via tgaddr; preserve the one-time start token.
  const webUrl = `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(appUrl)}`;
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      setChecking(true);
      try {
        const response = await fetch("/api/telegram/link", {
          cache: "no-store",
        });
        if (!response.ok) throw Error("Unable to check connection");
        const result = await response.json();
        if (active) {
          setConnected(Boolean(result.linked));
          setStatusError("");
          if (result.linked) {
            setUrl("");
            setCopied(false);
          }
        }
      } catch {
        if (active)
          setStatusError("Couldn’t refresh connection status. Try again.");
      } finally {
        inFlight = false;
        if (active) setChecking(false);
      }
    };
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const interval = url ? setInterval(() => void check(), 3000) : undefined;
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [url, refreshVersion]);
  useEffect(() => {
    if (!url) return;
    const expiry = setTimeout(() => {
      setUrl("");
      setCopied(false);
      setError(
        "This connection link expired. Create a fresh link to continue.",
      );
    }, 600000);
    return () => {
      clearTimeout(expiry);
    };
  }, [url]);
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
        <div className="telegram-connection-status">
          <p role="status">
            <strong>{connected ? "Connected" : "Not connected"}</strong>
            {connected
              ? " — your Telegram account is linked to this Sahaay account."
              : url
                ? " — waiting for you to press Start in Telegram."
                : " — connect your Telegram account below."}
          </p>
          <button
            type="button"
            disabled={checking || busy}
            onClick={() => setRefreshVersion((v) => v + 1)}
          >
            {checking ? "Checking…" : "Refresh status"}
          </button>
          {statusError && (
            <p role="alert" className="error">
              {statusError}
            </p>
          )}
        </div>
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
            <p>
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
              Press Start in Telegram, then return here. This page will confirm
              when linking succeeds.
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
            <p>
              No response from the bot? Its message receiver may be offline.
              Linking only completes after Sahaay replies with a confirmation.
            </p>
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
