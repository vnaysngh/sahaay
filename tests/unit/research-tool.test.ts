import { it, expect, vi } from "vitest";
import OpenAI from "openai";
import {
  createResearchTool,
  publicQueryCheck,
  reviewResearchQuery,
} from "../../apps/web/src/providers/research-tool";
import type { ConversationMessage } from "../../apps/web/src/core/contracts";
const context: ConversationMessage[] = [
  { role: "user", content: "Find boxing gyms near me" },
  { role: "assistant", content: "Which city?" },
  { role: "user", content: "Mumbai" },
];
it("rejects malformed arguments and credential-bearing queries before the semantic check", async () => {
  const review = vi.fn(),
    execute = vi.fn();
  const { guardrail } = createResearchTool({ context, review, execute });
  expect(
    (
      await guardrail.run({ toolCall: { arguments: "{" } } as Parameters<
        typeof guardrail.run
      >[0])
    ).behavior.type,
  ).toBe("rejectContent");
  expect(
    (await call(guardrail, "Read https://example.com/?token=private")).behavior
      .type,
  ).toBe("rejectContent");
  expect(review).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
function call(
  guardrail: ReturnType<typeof createResearchTool>["guardrail"],
  query: string,
) {
  return guardrail.run({
    toolCall: { arguments: JSON.stringify({ query }) },
  } as Parameters<typeof guardrail.run>[0]);
}
it("allows public standalone questions in either language, rejects credentials/private URLs and unsupported documents", () => {
  for (const query of [
    "Find boxing gyms in Mumbai 400001",
    "मुंबई में बॉक्सिंग जिम खोजें",
    "Compare iPhone 16 and Pixel 9 battery life",
  ])
    expect(publicQueryCheck(query).allowed).toBe(true);
  for (const query of [
    "Search kavya@example.com",
    "Search password hidden123",
    "Search +919876543210",
    "Read https://example.com/?token=private",
    "Read http://localhost/private",
    "Read https://example.com/report.pdf",
  ])
    expect(publicQueryCheck(query).allowed).toBe(false);
});
it("uses an SDK tool input guardrail and passes only the standalone query to research execution", async () => {
  const execute = vi.fn().mockResolvedValue("grounded evidence"),
    review = vi.fn().mockResolvedValue({ allowed: true, reason: "allowed" });
  const { research, guardrail } = createResearchTool({
    context,
    review,
    execute,
  });
  expect(research.inputGuardrails).toHaveLength(1);
  expect(
    (await call(guardrail, "Find boxing gyms in Mumbai")).behavior.type,
  ).toBe("allow");
  expect(review).toHaveBeenCalledWith("Find boxing gyms in Mumbai", context);
  expect(execute).not.toHaveBeenCalled();
});
it("blocks semantic privacy/ambiguity failures, reviewer outages, and repeated checks before any search", async () => {
  const execute = vi.fn();
  for (const reason of ["private_data", "ambiguous", "unjustified"] as const) {
    const { guardrail } = createResearchTool({
      context,
      execute,
      review: async () => ({ allowed: false, reason }),
    });
    expect(
      (await call(guardrail, "A proposed public-looking query")).behavior.type,
    ).toBe("rejectContent");
  }
  const review = vi.fn().mockRejectedValue(Error("private-provider-error"));
  const { guardrail } = createResearchTool({ context, execute, review });
  const first = await call(guardrail, "Find boxing gyms in Mumbai");
  expect(JSON.stringify(first)).not.toContain("private-provider-error");
  expect(first.behavior.type).toBe("rejectContent");
  await call(guardrail, "Find boxing gyms in Mumbai");
  expect(
    (await call(guardrail, "Find boxing gyms in Mumbai")).behavior.type,
  ).toBe("rejectContent");
  expect(review).toHaveBeenCalledTimes(2);
  expect(execute).not.toHaveBeenCalled();
});
it("runs a bounded structured policy check on the existing provider without public-search tools or image payloads", async () => {
  const client = new OpenAI({ apiKey: "synthetic-only" });
  const create = vi.spyOn(client.responses, "create").mockResolvedValue({
    status: "completed",
    output_text: '{"allowed":true,"reason":"allowed"}',
  } as OpenAI.Responses.Response);
  expect(
    await reviewResearchQuery(
      client,
      "configured-model",
      "Find boxing gyms in Mumbai",
      context,
      AbortSignal.timeout(1000),
    ),
  ).toEqual({ allowed: true, reason: "allowed" });
  expect(create.mock.calls[0][0]).toMatchObject({
    store: false,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect(create.mock.calls[0][0]).not.toHaveProperty("tools");
  create.mockResolvedValue({
    status: "incomplete",
    output_text: "{}",
  } as OpenAI.Responses.Response);
  await expect(
    reviewResearchQuery(
      client,
      "model",
      "public",
      context,
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow("research_policy_unavailable");
});
