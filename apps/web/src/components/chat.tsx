"use client";
import { LogoMark } from "./logo";
// import { PrivacyControls } from "./privacy-controls";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import { useMedia, MediaControls, AttachmentPreview } from "./media-controls";
import { authClient } from "../auth/client";
import type { StoredMessage } from "../db/conversations";
import type { ResponseEvent, ResearchSource } from "../core/contracts";
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
  const [stage, setStage] = useState("Sahaay is thinking");
  const media = useMedia(setError);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const generation = useRef(0);
  const transport = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const next = await fetchJson<Conversation[]>("/api/conversations");
    if (epoch === generation.current) setHistory(next);
  }, []);
  useEffect(() => {
    let alive = true;
    const epoch = generation.current;
    void fetchJson<Conversation[]>("/api/conversations")
      .then((value) => {
        if (alive && epoch === generation.current) setHistory(value);
      })
      .catch(() => {
        if (alive && epoch === generation.current)
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
    const epoch = generation.current;
    const timer = setInterval(() => {
      void fetchJson<StoredMessage[]>(`/api/conversations/${selected}`)
        .then((value) => {
          if (epoch === generation.current) setMessages(value);
        })
        .catch(() =>
          setError(
            "Couldn’t refresh the response. Your conversation is saved.",
          ),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, [selected, active, busy]);
  async function open(id: string) {
    if (busy || media.uploading || media.recording || media.permission) return;
    const epoch = ++generation.current;
    media.clear(true);
    setLoading(true);
    setError("");
    setDraft("");
    setSidebar(false);
    try {
      const next = await fetchJson<StoredMessage[]>(`/api/conversations/${id}`);
      if (epoch !== generation.current) return;
      setMessages(next);
      setSelected(id);
    } catch (e) {
      if (epoch === generation.current)
        setError(
          e instanceof Error ? e.message : "Couldn’t open conversation.",
        );
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }
  function newChat() {
    if (busy || media.uploading || media.recording || media.permission) return;
    generation.current++;
    setLoading(false);
    media.clear(true);
    setSelected(null);
    setMessages([]);
    setDraft("");
    setError("");
    setSidebar(false);
    composer.current?.focus();
  }
  async function send() {
    if (
      (!text.trim() && !media.pending.length) ||
      text.trim().length > 4000 ||
      sending.current ||
      active ||
      loading ||
      media.uploading ||
      media.recording ||
      media.permission
    )
      return;
    const epoch = generation.current;
    const controller = new AbortController();
    transport.current = controller;
    const submitted = text.trim();
    const attachments = [...media.pending];
    const attachmentIds = attachments.map((a) => a.id);
    sending.current = true;
    setBusy(true);
    setError("");
    setText("");
    setDraft("");
    setStage(
      attachments.some((a) => a.kind === "audio")
        ? "Transcribing your voice…"
        : attachments.length
          ? "Looking at your image…"
          : "Sahaay is thinking",
    );
    let id = selected;
    let finished = false;
    try {
      if (!id) {
        const conversation = await fetchJson<Conversation>(
          "/api/conversations",
          { method: "POST" },
        );
        if (epoch !== generation.current)
          throw new Error("Privacy action interrupted this request.");
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
          attachments,
        },
      ]);
      const response = await fetch("/api/chat", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          requestId,
          text: submitted,
          attachmentIds,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Couldn’t send your message.");
      }
      media.clear();
      if (response.status === 202) {
        finished = true;
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The connection was interrupted.");
      const decoder = new TextDecoder();
      let buffer = "";
      function receive(line: string) {
        if (epoch !== generation.current || !line.trim()) return;
        const event = JSON.parse(line) as ResponseEvent;
        if (event.type === "processing")
          setStage(
            event.stage === "researching"
              ? "Researching the web…"
              : event.stage === "transcribing"
                ? "Transcribing your voice…"
                : event.stage === "understanding"
                  ? "Looking at your image…"
                  : "Sahaay is thinking",
          );
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
      if (epoch !== generation.current) return;
      if (!finished) setText((current) => current || submitted);
      setError(e instanceof Error ? e.message : "Couldn’t connect. Try again.");
    } finally {
      if (epoch === generation.current) {
        if (id) {
          try {
            const next = await fetchJson<StoredMessage[]>(
              `/api/conversations/${id}`,
            );
            if (epoch === generation.current) setMessages(next);
          } catch {
            if (epoch === generation.current)
              setError(
                "Couldn’t load the saved response. Refresh before sending again.",
              );
          }
        }
        if (epoch === generation.current) {
          setDraft("");
          setBusy(false);
          sending.current = false;
          void refresh().catch(() => {});
          composer.current?.focus();
        }
      }
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
        <div className="chat-toolbar">
          <div>
            <button
              className="mobile-menu"
              aria-label="Open conversations"
              onClick={() => setSidebar(true)}
            >
              <Menu size={18} />
              <span>Conversations</span>
            </button>
          </div>
        </div>
        <div
          className={`conversation ${messages.length ? "has-messages" : ""}`}
        >
          {!messages.length && !loading ? (
            <section className="welcome">
              <span className="welcome-icon">
                <LogoMark />
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
                      <LogoMark />
                    </span>
                  )}
                  <div className="message-content">
                    {message.artifacts?.map((a) => (
                      <div className="message-artifact" key={a.id}>
                        <a href={`/api/documents/${a.id}/original?download=1`}>
                          <img
                            src={`/api/documents/${a.id}/original`}
                            alt={a.title}
                            loading="lazy"
                            style={{
                              maxWidth: 280,
                              maxHeight: 240,
                              objectFit: "contain",
                            }}
                          />
                          <span>{a.title} · Download original</span>
                        </a>
                      </div>
                    ))}
                    {Boolean(message.attachments?.length) && (
                      <div className="message-attachments">
                        {message.attachments?.map((attachment) => (
                          <AttachmentPreview
                            key={attachment.id}
                            attachment={attachment}
                          />
                        ))}
                      </div>
                    )}
                    {message.role === "assistant" ? (
                      <>
                        <Markdown
                          components={{
                            img: ({ alt }) => (
                              <span>
                                {alt ? `Image: ${alt}` : "Image link omitted"}
                              </span>
                            ),
                            a: ({ children, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {message.content}
                        </Markdown>
                        {message.sources?.length ? (
                          <ResearchSources sources={message.sources} />
                        ) : null}
                      </>
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
                    <LogoMark />
                  </span>
                  <div className="message-content">
                    <Markdown
                      components={{
                        img: ({ alt }) => (
                          <span>{alt || "Image link omitted"}</span>
                        ),
                      }}
                    >
                      {draft}
                    </Markdown>
                    <span className="stream-cursor" />
                  </div>
                </article>
              )}
              {working && (!draft || stage === "Researching the web…") && (
                <div className="thinking" role="status">
                  <LogoMark />
                  <span>{stage}</span>
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
            {media.pending.length > 0 && (
              <div className="pending-attachments">
                {media.pending.map((attachment) => (
                  <AttachmentPreview
                    key={attachment.id}
                    attachment={attachment}
                    remove={() => media.remove(attachment.id)}
                  />
                ))}
              </div>
            )}
            <textarea
              ref={composer}
              aria-label="Message Sahaay"
              placeholder="Tell Sahaay what’s on your mind…"
              value={text}
              maxLength={4000}
              rows={2}
              disabled={loading}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((file) =>
                  file.type.startsWith("image/"),
                );
                if (files.length) {
                  e.preventDefault();
                  if (!working) void media.upload(files);
                }
              }}
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
              <MediaControls media={media} disabled={working || loading} />
              <button
                className="send-button"
                aria-label="Send message"
                disabled={
                  working ||
                  loading ||
                  media.uploading ||
                  media.recording ||
                  media.permission ||
                  (!text.trim() && !media.pending.length)
                }
              >
                {working ? (
                  <span className="sending-dot" />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </div>
          </form>
          {/* <div className="composer-footer">
            <PrivacyControls
              conversationId={selected}
              onChanged={(deleted) => {
                generation.current++;
                transport.current?.abort();
                sending.current = false;
                setBusy(false);
                setLoading(false);
                setDraft("");
                setSelected(null);
                setMessages([]);
                setText("");
                setError("");
                media.clear(true);
                if (deleted) router.replace("/sign-in");
                else {
                  newChat();
                  void refresh().catch(() => {});
                }
              }}
            />
          </div> */}
        </footer>
      </main>
    </div>
  );
}

function ResearchSources({ sources }: { sources: ResearchSource[] }) {
  const cited = sources.filter((source) => source.kind === "cited");
  const consulted = sources.filter((source) => source.kind === "consulted");
  function links(items: ResearchSource[]) {
    return items.map((source) => (
      <a
        key={source.id}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="source-link"
      >
        <span>{source.id.slice(1)}</span>
        <div>
          {source.title}
          <small>{new URL(source.url).hostname}</small>
        </div>
        <span aria-hidden>↗</span>
      </a>
    ));
  }
  return (
    <section className="research-sources" aria-label="Research sources">
      <p>
        {cited.length ? "Cited sources" : "Research sources"}
        <small>
          Checked {new Date(sources[0].retrievedAt).toLocaleDateString()}
        </small>
      </p>
      {links(cited)}
      {consulted.length > 0 && (
        <details>
          <summary>Other pages consulted ({consulted.length})</summary>
          {links(consulted)}
        </details>
      )}
    </section>
  );
}
