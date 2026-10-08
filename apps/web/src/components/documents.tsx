"use client";
import { useState, useEffect } from "react";
import type { Artifact, ArtifactSummary } from "../core/artifacts";
export function Documents() {
  const [rows, setRows] = useState<ArtifactSummary[]>([]),
    [selected, setSelected] = useState<Artifact | null>(null),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/documents", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error("Documents unavailable.");
        const data = await r.json();
        if (active) {
          setRows(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError("Could not load Documents. Reload to try again.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function open(id: string) {
    setError("");
    setConfirm(false);
    try {
      const r = await fetch(`/api/documents/${id}`, { cache: "no-store" });
      if (!r.ok) throw Error();
      setSelected(await r.json());
    } catch {
      setError("Document unavailable. It may have been deleted.");
    }
  }
  async function remove() {
    if (!selected) return;
    try {
      const r = await fetch(`/api/documents/${selected.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selected.version }),
      });
      if (!r.ok) throw Error();
      setRows(rows.filter((a) => a.id !== selected.id));
      setSelected(null);
      setConfirm(false);
    } catch {
      setError("Could not delete this document. Reload and try again.");
    }
  }
  return (
    <section className="documents">
      {error && <p role="alert">{error}</p>}
      {!loaded && !error && <p>Loading Documents…</p>}
      {selected ? (
        <article>
          <button onClick={() => setSelected(null)}>← All documents</button>
          <h2>{selected.title}</h2>
          <p>
            {selected.category.replaceAll("_", " ")} · Added{" "}
            {new Date(selected.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <img
            className="document-original"
            src={`/api/documents/${selected.id}/original`}
            alt={selected.title}
          />
          <p>
            <a href={`/api/documents/${selected.id}/original?download=1`}>
              Download original
            </a>
          </p>
          <p>{selected.description}</p>
          <dl>
            {selected.metadata.map((m, i) => (
              <div key={i}>
                <dt>{m.key.replaceAll("_", " ")}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
          {selected.relatedItemId && (
            <p>
              Linked to your personal state. Ask Sahaay about its related plan
              or item.
            </p>
          )}
          {confirm ? (
            <p>
              Delete this original and its extracted information?{" "}
              <button onClick={() => void remove()}>Delete permanently</button>{" "}
              <button onClick={() => setConfirm(false)}>Keep document</button>
            </p>
          ) : (
            <button onClick={() => setConfirm(true)}>Delete document</button>
          )}
        </article>
      ) : (
        <>
          {loaded && !rows.length && (
            <p>No documents yet. Send an image and tell Sahaay “Keep this.”</p>
          )}
          <div className="document-list">
            {rows.map((r) => (
              <button
                key={r.id}
                className="document-row"
                onClick={() => void open(r.id)}
              >
                <strong>{r.title}</strong>
                <span>
                  {r.category.replaceAll("_", " ")} · Added{" "}
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span>Open →</span>
              </button>
            ))}
          </div>
          {rows.length === 20 && (
            <p>
              Showing up to 20 documents. Ask Sahaay for a specific document to
              find more.
            </p>
          )}
        </>
      )}
    </section>
  );
}
