// Select complete turns rather than individual rows. This is a bounded view of
// owned, retention-filtered Postgres history, not another memory/session store.
export function boundedConversationRows<
  T extends {
    id: string;
    request_id: string;
    role: "user" | "assistant";
    content: string;
  },
>(rows: T[], currentMessageId: string): T[] {
  const turns = new Map<string, T[]>();
  for (const row of rows) {
    const turn = turns.get(row.request_id) ?? [];
    turn.push(row);
    turns.set(row.request_id, turn);
  }
  const selected: T[] = [];
  let size = 0;
  for (const turn of [...turns.values()].reverse()) {
    const current = turn.some((row) => row.id === currentMessageId);
    if (
      !current &&
      !(
        turn.some((row) => row.role === "user") &&
        turn.some((row) => row.role === "assistant")
      )
    )
      continue;
    const bounded = turn.map((row) => ({
      ...row,
      content:
        row.content.length > 6000 && !current
          ? row.content.slice(0, 6000) +
            "\n[Earlier message truncated; ask for retained history if more detail is needed.]"
          : row.content,
    }));
    const length = bounded.reduce((sum, row) => sum + row.content.length, 0);
    if (size + length > 16000 && !current) break;
    selected.unshift(...bounded);
    size += length;
  }
  return selected;
}
