import { it, expect } from "vitest";
import { boundedConversationRows } from "../../apps/web/src/core/conversation-context";
const row = (
  id: string,
  request_id: string,
  role: "user" | "assistant",
  content: string,
) => ({ id, request_id, role, content });
it("keeps the current request and recent complete turn even after a large answer", () => {
  const rows = [
    row("old-u", "old", "user", "old"),
    row("old-a", "old", "assistant", "x".repeat(24000)),
    row("u", "previous", "user", "Find boxing gyms"),
    row("a", "previous", "assistant", "Which city? " + "x".repeat(24000)),
    row("current", "current", "user", "Mumbai"),
  ];
  const selected = boundedConversationRows(rows, "current");
  expect(selected.at(-1)?.content).toBe("Mumbai");
  expect(selected.some((r) => r.content === "Find boxing gyms")).toBe(true);
  expect(selected.find((r) => r.id === "a")?.content).toContain("truncated");
  expect(
    selected.reduce((n, r) => n + r.content.length, 0),
  ).toBeLessThanOrEqual(16000);
});
it("does not include an orphan assistant or incomplete old user turn", () => {
  const rows = [
    row("orphan", "a", "assistant", "orphan"),
    row("incomplete", "b", "user", "incomplete"),
    row("u", "c", "user", "question"),
    row("a", "c", "assistant", "answer"),
    row("now", "d", "user", "follow up"),
  ];
  expect(boundedConversationRows(rows, "now").map((r) => r.id)).toEqual([
    "u",
    "a",
    "now",
  ]);
});
