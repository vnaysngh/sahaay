"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Plane,
  Lightbulb,
  ShoppingBag,
  Package,
  Folder,
  Bookmark,
  Brain,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import {
  categoryFor,
  readableLabel,
  stateDetails,
  type StateRecord,
  type StateCategory,
} from "./state-categories";
const icons = {
  trip: Plane,
  idea: Lightbulb,
  shopping: ShoppingBag,
  purchase: Package,
  folder: Folder,
  saved: Bookmark,
};
export function PersonalState({
  records,
  memories,
  objectView = false,
}: {
  records: StateRecord[];
  memories: { id: string; content: string }[];
  objectView?: boolean;
}) {
  const [selected, setSelected] = useState("all");
  const groups = new Map<string, StateCategory & { records: StateRecord[] }>();
  for (const record of records) {
    const category = categoryFor(record);
    const group = groups.get(category.key) ?? { ...category, records: [] };
    group.records.push(record);
    groups.set(category.key, group);
  }
  const categories = [...groups.values()];
  const total = records.length + memories.length;
  const active =
    groups.has(selected) || (selected === "memories" && memories.length)
      ? selected
      : "all";
  return (
    <>
      {total > 0 && (
        <nav className="state-tabs" aria-label="State categories">
          <button
            type="button"
            aria-pressed={active === "all"}
            onClick={() => setSelected("all")}
          >
            All <span>{total}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={active === c.key}
              onClick={() => setSelected(c.key)}
            >
              {c.label} <span>{c.records.length}</span>
            </button>
          ))}
          {memories.length > 0 && (
            <button
              type="button"
              aria-pressed={active === "memories"}
              onClick={() => setSelected("memories")}
            >
              Memories <span>{memories.length}</span>
            </button>
          )}
        </nav>
      )}
      <div className="state-collections">
        {categories
          .filter((c) => active === "all" || active === c.key)
          .map((category) => {
            const Icon = icons[category.icon];
            return (
              <section
                className="state-collection"
                key={category.key}
                aria-label={category.label}
              >
                <header className="state-collection-header">
                  <span
                    className={`state-category-icon state-icon-${category.icon}`}
                  >
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <h2>{category.label}</h2>
                  <span className="state-count">{category.records.length}</span>
                </header>
                <div className="state-rows">
                  {category.records.map((record) => {
                    const details = stateDetails(record.structuredValue);
                    const label =
                      record.status === "archived"
                        ? "Archived"
                        : record.status === "done"
                          ? "Done"
                          : record.stateLabel
                            ? readableLabel(record.stateLabel)
                            : null;
                    return (
                      <article key={record.id} className="state-row">
                        <div className="state-row-main">
                          <h3>
                            {record.recordRole === "object" ? (
                              <Link
                                href={`/state?object=${record.id}`}
                                prefetch={false}
                              >
                                {record.content}
                              </Link>
                            ) : (
                              record.content
                            )}
                          </h3>
                          {details.length > 0 && (
                            <p className="state-row-details">
                              {details.map((d, i) => (
                                <span key={i}>{d}</span>
                              ))}
                            </p>
                          )}
                          <div className="state-row-meta">
                            {record.recordRole === "object" && (
                              <Link
                                href={`/state?object=${record.id}`}
                                prefetch={false}
                              >
                                {record.itemCount} related{" "}
                                {record.itemCount === 1 ? "item" : "items"}
                              </Link>
                            )}
                            {record.url && (
                              <a
                                href={record.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open saved link{" "}
                                <ArrowUpRight size={12} aria-hidden="true" />
                              </a>
                            )}
                            <time dateTime={record.updatedAt}>
                              Updated{" "}
                              {new Date(record.updatedAt).toLocaleDateString(
                                "en-IN",
                                {
                                  timeZone: "Asia/Kolkata",
                                  day: "numeric",
                                  month: "short",
                                },
                              )}
                            </time>
                          </div>
                        </div>
                        <div className="state-row-aside">
                          {label && (
                            <span
                              className={`state-badge ${record.status === "archived" ? "state-badge-muted" : ""}`}
                            >
                              {label}
                            </span>
                          )}
                          {record.recordRole === "object" && (
                            <Link
                              href={`/state?object=${record.id}`}
                              prefetch={false}
                              aria-label={`Open ${record.content}`}
                            >
                              <ChevronRight size={18} />
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        {memories.length > 0 && (active === "all" || active === "memories") && (
          <section className="state-collection" aria-label="Explicit memories">
            <header className="state-collection-header">
              <span className="state-category-icon">
                <Brain size={19} aria-hidden="true" />
              </span>
              <h2>Memories</h2>
              <span className="state-count">{memories.length}</span>
            </header>
            <p className="state-collection-note">
              Facts and preferences you asked Sahaay to remember. Up to eight
              recent memories.
            </p>
            <div className="state-rows">
              {memories.map((m) => (
                <article key={m.id} className="state-row">
                  <p className="state-memory-text">{m.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      {total === 0 && (
        <div className="state-empty">
          <Folder size={24} aria-hidden="true" />
          <h2>
            {objectView
              ? "Nothing added yet."
              : "Keep something worth coming back to."}
          </h2>
          <p>
            {objectView
              ? "Tell Sahaay to add something to this plan."
              : "Tell Sahaay about a plan, save an idea, or start a shopping list."}
          </p>
          <Link href="/">Talk to Sahaay →</Link>
        </div>
      )}
    </>
  );
}
