import { isIP } from "node:net";
import type { ResearchSource } from "../contracts";
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
