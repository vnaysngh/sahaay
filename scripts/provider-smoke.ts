import "./env";
import { createAgentProvider } from "../apps/web/src/providers/openai";
async function main() {
  if (process.env.SAHAAY_E2E === "1")
    throw new Error("Live provider check cannot use the test provider");
  let text = "";
  let chunks = 0;
  for await (const delta of createAgentProvider().stream(
    [
      {
        role: "user",
        content:
          "Briefly greet me in English. This is a consented connectivity test.",
      },
    ],
    { signal: AbortSignal.timeout(120000) },
  )) {
    if (typeof delta !== "string") continue;
    text += delta;
    chunks++;
  }
  if (!text.trim() || !chunks) throw new Error("No streamed reply");
  console.log(
    JSON.stringify({
      passed: true,
      streamedChunks: chunks,
      responseCharacters: text.length,
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini-2026-03-17",
      store: false,
      tracing: false,
    }),
  );
}
main().catch(() => {
  console.error(
    "Live OpenAI streaming check failed; no credentials or provider payload were logged.",
  );
  process.exitCode = 1;
});
