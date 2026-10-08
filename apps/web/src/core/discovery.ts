import type { UnifiedRequest } from "./contracts";
import { persistencePermissions } from "./memory";
export function discovery(request: UnifiedRequest, transcript = "") {
  const text = [
    request.inputs
      .filter((i) => i.type === "text")
      .map((i) => (i.type === "text" ? i.text : ""))
      .join(" "),
    transcript,
  ].join(" ");
  const p = persistencePermissions(text),
    intents = new Set<string>(["ask"]),
    modalities = new Set<string>();
  for (const input of request.inputs)
    if (input.type === "text" && input.text) modalities.add("text");
    else if (input.type === "image") modalities.add("image");
    else if (input.type === "audio") modalities.add("voice");
  if (/https?:\/\//i.test(text)) modalities.add("url");
  if (
    modalities.has("image") ||
    modalities.has("voice") ||
    /explain|understand|समझा/i.test(text)
  )
    intents.add("understand");
  if (/research|search|latest|current|recommend|खोज|ताज़ा/i.test(text))
    intents.add("research");
  if (/compare|versus|\bvs\b|तुलना/i.test(text)) intents.add("compare");
  if (p.memoryWrite || p.memoryDelete) intents.add("remember");
  if (/recall|what.*remember|my.*preference|याद है/i.test(text))
    intents.add("recall");
  if (p.itemWrite || p.itemDelete || /saved|my.*list|सेव/i.test(text))
    intents.add("organize");
  const hindi = /[\u0900-\u097f]/.test(text),
    latin = /[a-zA-Z]/.test(text);
  const language = hindi
    ? latin
      ? "mixed"
      : "hi"
    : latin
      ? /\b(mera|meri|mujhe|karo|yaad|bhool|hai)\b/i.test(text)
        ? "mixed"
        : "en"
      : "unknown";
  let unsupported: string | null = null;
  if (
    /\b(book|reserve) (?:me |my |a |an |the )?(?:flight|hotel|ticket|trip)|बुक (?:कर|करो)/i.test(
      text,
    )
  )
    unsupported = "booking";
  else if (
    /\b(pay|transfer|send) .{0,50}(?:money|rupees|₹)|make (?:a )?payment|पैसे भेज/i.test(
      text,
    )
  )
    unsupported = "payment";
  else if (
    /send (?:an? |the |my )?email|email .{0,30} (?:for me|now)/i.test(text)
  )
    unsupported = "mail";
  else if (
    /(?:create|schedule|add) .{0,40}(?:meeting|calendar)/i.test(
      text,
    )
  )
    unsupported = "calendar";
  else if (
    /(?:monitor|track|watch) .{0,50}(?:price|background|every day)|autopilot/i.test(
      text,
    )
  )
    unsupported = "background";
  else if (/https?:\/\/\S+\.(?:pdf|docx?)(?:\s|$|\?)/i.test(text))
    unsupported = "document";
  else if (/shared location|my live location/i.test(text))
    unsupported = "location";
  return {
    intents: [...intents],
    modalities: [...modalities],
    language,
    unsupported,
  };
}
