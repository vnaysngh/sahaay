import { it, expect } from "vitest";
import {
  inputFor,
  requestId,
  updateSchema,
} from "../../apps/web/src/channels/telegram/input";
import {
  splitAnswer,
  telegramAnswer,
  renderTelegram,
  telegramMessages,
} from "../../apps/web/src/channels/telegram/output";
import {
  TelegramApi,
  TelegramApiError,
} from "../../apps/web/src/channels/telegram/api";
import { persistencePermissions } from "../../apps/web/src/core/memory";
const message = {
  message_id: 1,
  date: 1,
  from: { id: 101, is_bot: false },
  chat: { id: 101, type: "private" },
  text: "Research https://example.com",
};
it("normalizes Telegram inputs without identities leaking into core user IDs", () => {
  expect(inputFor(message).text).toBe(message.text);
  expect(
    inputFor({
      ...message,
      text: undefined,
      caption: "What is this?",
      photo: [
        { file_id: "small", width: 10, height: 10 },
        { file_id: "large", width: 100, height: 100 },
      ],
    }).fileId,
  ).toBe("large");
  expect(() =>
    inputFor({
      ...message,
      text: undefined,
      document: { file_id: "pdf", mime_type: "application/pdf" },
    }),
  ).toThrow(/not supported/);
  expect(() =>
    inputFor({ ...message, voice: { file_id: "voice", duration: 31 } }),
  ).toThrow(/30 seconds/);
  expect(() =>
    inputFor({
      ...message,
      photo: [
        { file_id: "huge", width: 1, height: 1, file_size: 9 * 1024 * 1024 },
      ],
    }),
  ).toThrow(/8 MB/);
  expect(requestId("123", 1)).toBe(requestId("123", 1));
  expect(requestId("123", 1)).not.toBe(requestId("456", 1));
  expect(updateSchema.safeParse({ update_id: 1, message }).success).toBe(true);
});
it("forwarded text cannot authorize memory writes and forwarded voice is explicitly limited", () => {
  const text = inputFor({
    ...message,
    text: "Remember I prefer aisle seats on flights.",
    forward_origin: { type: "user" },
  }).text;
  expect(persistencePermissions(text).memoryWrite).toBe(false);
  expect(() =>
    inputFor({
      ...message,
      voice: { file_id: "voice", duration: 1 },
      forward_origin: { type: "user" },
    }),
  ).toThrow(/directly/);
});
it("renders verified sources as clickable links and splits only final output within Telegram limits", () => {
  const text = telegramAnswer("Answer [1](https://example.com)", [
    {
      id: "S1",
      title: "Evidence",
      url: "https://example.com",
      kind: "cited",
      retrievedAt: new Date().toISOString(),
      publishedAt: null,
    },
  ]);
  expect(renderTelegram(text).entities).toContainEqual(
    expect.objectContaining({ type: "text_link", url: "https://example.com" }),
  );
  const long = "😀".repeat(6000),
    parts = splitAnswer(long);
  expect(parts.join("")).toBe(long);
  expect(
    parts.every((p) => p.length <= 4000 && !/[\uD800-\uDBFF]$/.test(p)),
  ).toBe(true);
});
it("never exposes a bot token on API failure and never blindly retries a send", async () => {
  let calls = 0;
  const api = new TelegramApi("123:private-token", async () => {
    calls++;
    throw Error("https://api.telegram.org/bot123:private-token/sendMessage");
  });
  try {
    await api.send(101, "Private fixture");
    throw Error("Expected transport failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(String(error)).not.toContain("private-token");
  }
  expect(calls).toBe(1);
});
it("blocks path injection and oversized download bodies", async () => {
  const unsafe = new TelegramApi("123:fixture", async () =>
    Response.json({ ok: true, result: { file_path: "../secret" } }),
  );
  await expect(unsafe.download("file")).rejects.toThrow(/Unsupported/);
  let calls = 0;
  const large = new TelegramApi("123:fixture", async () =>
    ++calls === 1
      ? Response.json({ ok: true, result: { file_path: "photos/file.jpg" } })
      : new Response(new Uint8Array(8 * 1024 * 1024 + 1)),
  );
  await expect(large.download("file")).rejects.toThrow(/too large/);
});

it("treats editing an already identical message as success without masking other errors", async () => {
  const api = new TelegramApi("123:fixture", async () =>
    Response.json(
      {
        ok: false,
        error_code: 400,
        description: "Bad Request: message is not modified",
      },
      { status: 400 },
    ),
  );
  expect(await api.edit(101, 1, "Same answer")).toBe(true);
  const blocked = new TelegramApi("123:fixture", async () =>
    Response.json(
      { ok: false, error_code: 403, description: "Bot blocked" },
      { status: 403 },
    ),
  );
  await expect(blocked.edit(101, 1, "Answer")).rejects.toMatchObject({
    code: 403,
  });
});

it("renders Telegram bold, safe links and readable table rows without raw Markdown", () => {
  const answer = renderTelegram(`Here are **current prices**.

| Model | Price | Notes |
|---|---|---|
| **VIOFO A229** | **₹31,999** | [Seller](https://example.com/a?x=1&y=2) |
| A810 | ₹18,599 | Available |

**Use \`code\` safely** <b>literal HTML</b> [unsafe](javascript:alert)`);
  expect(answer.text).toContain("VIOFO A229\nPrice: ₹31,999\nNotes: Seller");
  expect(answer.text).not.toContain("**");
  expect(answer.text).not.toContain("|---");
  expect(answer.text).not.toContain("https://example.com");
  expect(answer.text).toContain("<b>literal HTML</b>");
  expect(answer.entities).toContainEqual(
    expect.objectContaining({
      type: "text_link",
      url: "https://example.com/a?x=1&y=2",
    }),
  );
  expect(answer.entities.filter((e) => e.type === "text_link")).toHaveLength(1);
  for (const code of answer.entities.filter((e) => e.type === "code")) {
    expect(
      answer.entities
        .filter((e) => e !== code)
        .every(
          (e) =>
            e.offset >= code.offset + code.length ||
            e.offset + e.length <= code.offset,
        ),
    ).toBe(true);
  }
});
it("splits long formatted output with valid UTF-16 entities and preserves code/table content", () => {
  const original = "😀".repeat(2200);
  const parts = telegramMessages(`**${original}**`);
  expect(parts.map((p) => p.text).join("")).toBe(original);
  for (const part of parts) {
    expect(part.text.length).toBeLessThanOrEqual(4000);
    expect(part.entities).toEqual([
      { type: "bold", offset: 0, length: part.text.length },
    ]);
    expect(part.text).not.toMatch(/[\uD800-\uDBFF]$/);
  }
  const code = renderTelegram("```txt\n| raw | pipes |\n``` ");
  expect(code.text).toBe("| raw | pipes |");
  expect(code.entities[0].type).toBe("pre");
  const many = telegramMessages(
    Array.from({ length: 150 }, (_, i) => `**item ${i}**`).join("\n"),
  );
  expect(many.every((p) => p.entities.length <= 100)).toBe(true);
});
it("sends and edits native entities, including emoji offsets, rather than raw Markdown", async () => {
  const bodies: Record<string, unknown>[] = [];
  const api = new TelegramApi("123:fixture", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
  await api.send(101, "😀 **Hello**");
  await api.edit(101, 1, "**Done**");
  expect(bodies[0]).toMatchObject({
    text: "😀 Hello",
    entities: [{ type: "bold", offset: 3, length: 5 }],
  });
  expect(bodies[1]).toMatchObject({
    text: "Done",
    entities: [{ type: "bold", offset: 0, length: 4 }],
  });
  expect(bodies.every((b) => !("parse_mode" in b))).toBe(true);
});
