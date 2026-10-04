"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import { authClient } from "../auth/client";
import type { StoredMessage } from "../db/conversations";
import type { ResponseEvent } from "../core/contracts";
type Conversation = { id: string; title: string; updatedAt: string };
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (response.status === 401) {
    throw new Error("Please sign in again.");
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Couldn’t connect to Sahaay.");
  return result;
}
export function Chat({ name }: { name: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const refresh = useCallback(
    async () =>
      setHistory(await fetchJson<Conversation[]>("/api/conversations")),
    [],
  );
  useEffect(() => {
    let alive = true;
    void fetchJson<Conversation[]>("/api/conversations")
      .then((value) => {
        if (alive) setHistory(value);
      })
      .catch(() => {
        if (alive)
          setError("Couldn’t load your conversations. Refresh to try again.");
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft, busy]);
  const active = messages.some((m) => m.status === "running");
  useEffect(() => {
    if (!selected || !active || busy) return;
    const timer = setInterval(() => {
      void fetchJson<StoredMessage[]>(`/api/conversations/${selected}`)
        .then(setMessages)
        .catch(() =>
          setError(
            "Couldn’t refresh the response. Your conversation is saved.",
          ),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, [selected, active, busy]);
  async function open(id: string) {
    if (busy) return;
    setLoading(true);
    setError("");
    setDraft("");
    setSidebar(false);
    try {
      setMessages(await fetchJson<StoredMessage[]>(`/api/conversations/${id}`));
      setSelected(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t open conversation.");
    } finally {
      setLoading(false);
    }
  }
  function newChat() {
    if (busy) return;
    setSelected(null);
    setMessages([]);
    setDraft("");
    setError("");
    setSidebar(false);
    composer.current?.focus();
  }
  async function send() {
    if (
      !text.trim() ||
      text.trim().length > 4000 ||
      sending.current ||
      active ||
      loading
    )
      return;
    const submitted = text.trim();
    sending.current = true;
    setBusy(true);
    setError("");
    setText("");
    setDraft("");
    let id = selected;
    let finished = false;
    try {
      if (!id) {
        const conversation = await fetchJson<Conversation>(
          "/api/conversations",
          { method: "POST" },
        );
        id = conversation.id;
        setSelected(id);
      }
      const requestId = crypto.randomUUID();
      setMessages((current) => [
        ...current,
        {
          id: requestId,
          requestId,
          role: "user",
          content: submitted,
          status: "running",
          createdAt: new Date().toISOString(),
        },
      ]);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          requestId,
          text: submitted,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Couldn’t send your message.");
      }
      if (response.status === 202) {
        finished = true;
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The connection was interrupted.");
      const decoder = new TextDecoder();
      let buffer = "";
      function receive(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as ResponseEvent;
        if (event.type === "delta") setDraft((current) => current + event.text);
        if (event.type === "complete") finished = true;
        if (event.type === "error") {
          finished = true;
          setError(event.message);
        }
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) {
            receive(buffer.slice(0, index));
            buffer = buffer.slice(index + 1);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) receive(buffer);
      } finally {
        reader.releaseLock();
      }
      if (!finished)
        throw new Error(
          "The connection was interrupted. Checking your saved response…",
        );
    } catch (e) {
      if (!finished) setText((current) => current || submitted);
      setError(e instanceof Error ? e.message : "Couldn’t connect. Try again.");
    } finally {
      if (id) {
        try {
          setMessages(
            await fetchJson<StoredMessage[]>(`/api/conversations/${id}`),
          );
        } catch {
          setError(
            "Couldn’t load the saved response. Refresh before sending again.",
          );
        }
      }
      setDraft("");
      setBusy(false);
      sending.current = false;
      void refresh().catch(() => {});
      composer.current?.focus();
    }
  }
  const working = busy || active;
  return (
    <div className="chat-app">
      {sidebar && (
        <button
          aria-label="Close conversation menu"
          className="sidebar-scrim"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <Link className="brand" href="/" aria-label="Sahaay home">
          <span className="brand-mark">
            <Sparkles size={19} />
          </span>
          Sahaay
        </Link>
        <button className="new-chat" onClick={newChat} disabled={busy}>
          <Plus size={17} />
          New conversation<span>↗</span>
        </button>
        <div className="history-label">YOUR CONVERSATIONS</div>
        <nav aria-label="Conversation history" className="history">
          {!history.length && (
            <p className="history-empty">
              Your conversations will
              <br />
              find a home here.
            </p>
          )}
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => void open(item.id)}
              className={selected === item.id ? "selected" : ""}
              disabled={busy}
            >
              <MessageSquare size={15} />
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">
            {name}
            <small>Personal space</small>
          </span>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() =>
              void authClient.signOut().then(() => router.replace("/sign-in"))
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="chat-main">
        <header className="chat-header">
          <div>
            <button
              className="mobile-menu"
              aria-label="Open conversations"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Your everyday companion</span>
          </div>
          <span className="preview-badge">
            <span />
            Text preview
          </span>
        </header>
        <div
          className={`conversation ${messages.length ? "has-messages" : ""}`}
        >
          {!messages.length && !loading ? (
            <section className="welcome">
              <span className="welcome-icon">
                <Sparkles size={28} strokeWidth={1.5} />
              </span>
              <span className="eyebrow">
                HELLO, {name.split(" ")[0].toUpperCase()}
              </span>
              <h1>
                A little help.
                <br />
                <span>A clearer day.</span>
              </h1>
              <p>
                Questions, half-formed thoughts, everyday things.
                <br />
                Let’s make sense of them together.
              </p>
              <div className="suggestions">
                {[
                  {
                    label: "Make something clearer",
                    text: "Explain a complex idea simply. Help me pick one to explore.",
                  },
                  {
                    label: "Think it through",
                    text: "Help me think through a decision. Ask me what I’m deciding.",
                  },
                  {
                    label: "Find the right words",
                    text: "Help me write a clear, thoughtful message. Ask me who it is for.",
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setText(item.text);
                      composer.current?.focus();
                    }}
                  >
                    {item.label}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="message-list" aria-label="Messages">
              {loading && <p className="muted">Opening your conversation…</p>}
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  {message.role === "assistant" && (
                    <span className="assistant-mark">
                      <Sparkles size={16} />
                    </span>
                  )}
                  <div className="message-content">
                    {message.role === "assistant" ? (
                      <Markdown>{message.content}</Markdown>
                    ) : (
                      <p>{message.content}</p>
                    )}
                    {["failed", "interrupted"].includes(message.status) && (
                      <small className="message-failed">
                        Response{" "}
                        {message.status === "interrupted"
                          ? "interrupted"
                          : "couldn’t finish"}
                        . Send again to retry.
                      </small>
                    )}
                  </div>
                </article>
              ))}
              {draft && (
                <article className="message assistant streaming">
                  <span className="assistant-mark">
                    <Sparkles size={16} />
                  </span>
                  <div className="message-content">
                    <Markdown>{draft}</Markdown>
                    <span className="stream-cursor" />
                  </div>
                </article>
              )}
              {working && !draft && (
                <div className="thinking" role="status">
                  <Sparkles size={16} />
                  <span>Sahaay is thinking</span>
                  <i />
                  <i />
                  <i />
                </div>
              )}
              <div ref={end} />
            </section>
          )}
        </div>
        <footer className="composer-area">
          {error && (
            <div className="chat-error" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <form
            className={`composer ${working ? "is-processing" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={composer}
              aria-label="Message Sahaay"
              placeholder="Tell Sahaay what’s on your mind…"
              value={text}
              maxLength={4000}
              rows={2}
              disabled={loading}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-bottom">
              <span className="composer-hint">
                Text today. Images & voice coming next.
              </span>
              <button
                className="send-button"
                aria-label="Send message"
                disabled={working || loading || !text.trim()}
              >
                {working ? (
                  <span className="sending-dot" />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </div>
          </form>
          <div className="composer-footer">
            <span>
              <Check size={12} /> Your conversation stays in your space
            </span>
            <span>Sahaay can make mistakes.</span>
          </div>
          <p className="retention-note">
            Conversations expire after 7 days. Replies are processed by OpenAI.
          </p>
        </footer>
      </main>
    </div>
  );
}
