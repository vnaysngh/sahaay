import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { RootContent, TableCell } from "mdast";
import type { ResearchSource } from "../../core/contracts";

export type TelegramEntity = {
  type: "bold" | "italic" | "strikethrough" | "code" | "pre" | "text_link";
  offset: number;
  length: number;
  url?: string;
  language?: string;
};
export type TelegramMessage = { text: string; entities: TelegramEntity[] };
const parser = unified().use(remarkParse).use(remarkGfm);

export function telegramAnswer(text: string, sources: ResearchSource[] = []) {
  const links = sources
    .filter((s) => s.kind === "cited")
    .map((s) => {
      const title = s.title.replace(/[\\\[\]]/g, "\\$&").replace(/\s+/g, " ");
      return `- [${title}](${s.url})`;
    });
  return links.length ? `${text}\n\n**Sources**\n${links.join("\n")}` : text;
}

/** Native entities avoid MarkdownV2 escaping and HTML injection. Offsets are UTF-16. */
export function renderTelegram(markdown: string): TelegramMessage {
  let text = "";
  const entities: TelegramEntity[] = [];
  const mark = (
    type: TelegramEntity["type"],
    render: () => void,
    extra: Partial<TelegramEntity> = {},
  ) => {
    const offset = text.length;
    render();
    if (text.length > offset)
      entities.push({ type, offset, length: text.length - offset, ...extra });
  };
  const children = (nodes: RootContent[]) => nodes.forEach(render);
  const blocks = (nodes: RootContent[]) =>
    nodes.forEach((node, i) => {
      if (i) text += "\n\n";
      render(node);
    });
  const cell = (node: TableCell) => children(node.children);
  const plainCell = (node: TableCell): string =>
    node.children
      .map((n) =>
        "value" in n
          ? n.value
          : "children" in n
            ? plainCell({
                ...node,
                children: n.children as TableCell["children"],
              })
            : "",
      )
      .join("");
  const render = (node: RootContent): void => {
    switch (node.type) {
      case "text":
      case "html":
        text += node.value;
        break;
      case "paragraph":
        children(node.children);
        break;
      case "heading":
        mark("bold", () => children(node.children));
        break;
      case "strong":
        mark("bold", () => children(node.children));
        break;
      case "emphasis":
        mark("italic", () => children(node.children));
        break;
      case "delete":
        mark("strikethrough", () => children(node.children));
        break;
      case "inlineCode":
        mark("code", () => {
          text += node.value;
        });
        break;
      case "code":
        mark(
          "pre",
          () => {
            text += node.value;
          },
          node.lang ? { language: node.lang } : {},
        );
        break;
      case "link": {
        let safe = false;
        try {
          safe = ["http:", "https:"].includes(new URL(node.url).protocol);
        } catch {}
        if (safe)
          mark("text_link", () => children(node.children), { url: node.url });
        else children(node.children);
        break;
      }
      case "image":
        text += node.alt || "Image";
        break;
      case "break":
        text += "\n";
        break;
      case "thematicBreak":
        text += "—";
        break;
      case "blockquote":
        blocks(node.children);
        break;
      case "list":
        node.children.forEach((item, i) => {
          if (i) text += "\n";
          text += node.ordered ? `${(node.start ?? 1) + i}. ` : "• ";
          if (item.checked !== null && item.checked !== undefined)
            text += item.checked ? "☑ " : "☐ ";
          blocks(item.children);
        });
        break;
      case "table": {
        const [header, ...rows] = node.children;
        rows.forEach((row, index) => {
          if (index) text += "\n\n";
          row.children.forEach((value, column) => {
            if (column) text += "\n";
            if (column === 0)
              mark("bold", () => {
                text += plainCell(value);
              });
            else {
              text += `${plainCell(header.children[column] ?? { type: "tableCell", children: [] }) || `Detail ${column}`}: `;
              cell(value);
            }
          });
        });
        break;
      }
      default:
        if ("children" in node) children(node.children as RootContent[]);
    }
  };
  blocks(parser.parse(markdown).children);
  return {
    text,
    entities: entities
      .flatMap((entity) => {
        if (entity.type === "code" || entity.type === "pre") return [entity];
        // Telegram forbids code/pre spans inside other entities, even bold text.
        let spans = [entity];
        for (const code of entities.filter(
          (e) => e.type === "code" || e.type === "pre",
        )) {
          spans = spans.flatMap((span) => {
            const end = span.offset + span.length,
              codeEnd = code.offset + code.length;
            if (code.offset >= end || codeEnd <= span.offset) return [span];
            return [
              ...(code.offset > span.offset
                ? [{ ...span, length: code.offset - span.offset }]
                : []),
              ...(codeEnd < end
                ? [{ ...span, offset: codeEnd, length: end - codeEnd }]
                : []),
            ];
          });
        }
        return spans;
      })
      .sort((a, b) => a.offset - b.offset || b.length - a.length),
  };
}

function sliceMessage(
  message: TelegramMessage,
  start: number,
  end: number,
): TelegramMessage {
  return {
    text: message.text.slice(start, end),
    entities: message.entities.flatMap((entity) => {
      const from = Math.max(start, entity.offset),
        to = Math.min(end, entity.offset + entity.length);
      return to > from
        ? [{ ...entity, offset: from - start, length: to - from }]
        : [];
    }),
  };
}
export function truncateTelegramMessage(
  message: TelegramMessage,
  max: number,
  suffix: string,
): TelegramMessage {
  let end = Math.min(max, message.text.length);
  if (/[\uD800-\uDBFF]/.test(message.text[end - 1] ?? "")) end--;
  const result = sliceMessage(message, 0, end);
  result.text += suffix;
  return result;
}
export function telegramMessages(
  markdown: string,
  sources: ResearchSource[] = [],
): TelegramMessage[] {
  const message = renderTelegram(telegramAnswer(markdown, sources));
  const parts: TelegramMessage[] = [];
  let start = 0;
  while (start < message.text.length) {
    let end = Math.min(start + 4000, message.text.length);
    if (end < message.text.length) {
      const line = message.text.lastIndexOf("\n", end);
      if (line > start + 2000) end = line;
      if (/[\uD800-\uDBFF]/.test(message.text[end - 1] ?? "")) end--;
    }
    // Telegram accepts at most 100 entities per message; split before the next span.
    const candidate = sliceMessage(message, start, end);
    if (candidate.entities.length > 100) {
      const boundary = start + candidate.entities[100].offset;
      if (boundary > start) end = boundary;
    }
    const part = sliceMessage(message, start, end);
    parts.push({ ...part, entities: part.entities.slice(0, 100) });
    start = end;
  }
  return parts.length
    ? parts
    : [{ text: "No response available.", entities: [] }];
}

// Kept for recovery/status messages that need a plain-text length bound.
export function splitAnswer(text: string) {
  const parts: string[] = [];
  while (text.length > 4000) {
    let end = text.lastIndexOf("\n", 4000);
    if (end < 2000) end = 4000;
    if (/[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end--;
    parts.push(text.slice(0, end));
    text = text.slice(end).replace(/^\n/, "");
  }
  if (text) parts.push(text);
  return parts;
}
