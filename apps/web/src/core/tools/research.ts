import { isIP } from "node:net";
import type { ConversationMessage, ResearchSource } from "../contracts";
export function publicUrl(value: string): string | null {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      return null;
    if (!host.includes(".") && !isIP(host)) return null;
    if (/(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host))
      return null;
    if (isIP(host) === 4) {
      const [a, b] = host.split(".").map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && [0, 168].includes(b)) ||
        (a === 198 && [18, 19, 51].includes(b)) ||
        (a === 203 && b === 0)
      )
        return null;
    }
    if (isIP(host) === 6) return null; // No IP-literal IPv6 URLs in the public-page pilot.
    for (const name of url.searchParams.keys()) {
      if (
        /^(?:token|key|secret|password|signature|sig|auth|access_token|api_key|session|email|phone|jwt|code|x-amz-[^=]+)$/i.test(
          name,
        )
      )
        return null;
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
export function urlsIn(text: string) {
  return [
    ...new Set(
      (text.match(/https?:\/\/[^\s<>"\]]+/gi) ?? []).map((s) =>
        s.replace(/[),.;!?]+$/, ""),
      ),
    ),
  ];
}
export function researchTask(context: ConversationMessage[]): {
  task: string;
  limitation?: string;
} {
  const current =
    context
      .at(-1)
      ?.content.replace(/\[Voice transcript, attachment [^\]]+\]:\s*/g, "") ??
    "";
  const currentUrls = urlsIn(current);
  if (currentUrls.some((url) => !publicUrl(url)))
    return {
      task: "",
      limitation:
        "This message contains a private, signed or unsupported URL. Ask for a public link without credentials; do not search it.",
    };
  if (
    currentUrls.some((url) => /\.(pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i.test(url))
  )
    return {
      task: "",
      limitation:
        "PDF/document URLs are not supported yet. Ask for a screenshot or pasted text.",
    };
  if (
    current.length > 2500 ||
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|Bearer\s|api[_ -]?key|password|secret|otp\b)|(?:\+?\d[\d ()-]{8,}\d)|my (?:name|address|email|phone)|mera (?:naam|pata)|मेरा (?:नाम|पता)/i.test(
      current,
    )
  )
    return {
      task: "",
      limitation:
        "The current request may contain personal data or credentials. Answer using conversation context, or ask for a short public research question without those details. Do not send this request to web search.",
    };
  // Only explicitly referenced prior USER URLs may cross the public research boundary.
  const referring =
    /\b(other|both|these|those|previous|earlier|first|second|it|them|compare)\b|दूसर|दोनों|पहले|तुलना|iski|uski|dono/i.test(
      current,
    );
  const references = referring
    ? context
        .slice(0, -1)
        .filter((m) => m.role === "user")
        .flatMap((m) => urlsIn(m.content))
        .filter(
          (url) => publicUrl(url) && !/\.(pdf|docx?)(?:$|[?#])/i.test(url),
        )
        .slice(-3)
    : [];
  return {
    task: [
      current,
      references.length
        ? `Previously provided public URL references: ${references.map(publicUrl).join(" ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
export function formatResearchAnswer(text: string, sources: ResearchSource[]) {
  const byId = new Map(
    sources.filter((s) => s.kind === "cited").map((s) => [s.id, s]),
  );
  const used = new Set<string>();
  const verifiedLinks = text
    .replace(/<(https?:[^>]+)>/g, (_match, url: string) => `[source](${url})`)
    .replace(
      /\[([^\]]+)\]\((https?:[^\s)]+)\)/g,
      (_match, label: string, url: string) => {
        const source = sources.find(
          (s) => s.url === publicUrl(url) && s.kind === "cited",
        );
        if (!source) return `${label} [source unavailable]`;
        return `[${source.id}]`;
      },
    );
  const answer = verifiedLinks.replace(/\[(S\d+)\]/g, (_match, id: string) => {
    const source = byId.get(id);
    if (!source) return "[source unavailable]";
    used.add(id);
    return `[${id.slice(1)}](${source.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  });
  return {
    text: answer,
    sources: sources.map((s) => ({
      ...s,
      kind: used.has(s.id) ? ("cited" as const) : ("consulted" as const),
    })),
  };
}
