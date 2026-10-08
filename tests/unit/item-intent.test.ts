import { it, expect } from "vitest";
import type OpenAI from "openai";
import { itemIntentReviewer } from "../../apps/web/src/providers/item-intent";
function client(result: unknown) {
  return { responses: { create: async () => result } } as unknown as OpenAI;
}
it("private state writes fail closed on malformed, refused, incomplete or unavailable policy results", async () => {
  for (const result of [
    { status: "incomplete", output_text: '{"allowed":true}' },
    { status: "completed", output_text: '{"allowed":"true"}' },
    { status: "completed", output_text: '{"allowed":false}' },
    { status: "completed", output_text: "not JSON" },
  ]) {
    const review = itemIntentReviewer(
      client(result),
      "synthetic-model",
      [],
      new AbortController().signal,
    );
    expect(
      await review({ input: { content: "A plan" } }, "I am planning a project"),
    ).toBe(false);
  }
  const unavailable = {
    responses: {
      create: async () => {
        throw Error("provider unavailable");
      },
    },
  } as unknown as OpenAI;
  expect(
    await itemIntentReviewer(
      unavailable,
      "synthetic-model",
      [],
      new AbortController().signal,
    )({}, "Save this"),
  ).toBe(false);
});
it("policy bounds cost and uses current direct intent with no provider storage or tool execution", async () => {
  const payloads: Array<Record<string, unknown>> = [];
  const provider = {
    responses: {
      create: async (payload: Record<string, unknown>) => {
        payloads.push(payload);
        return { status: "completed", output_text: '{"allowed":true}' };
      },
    },
  } as unknown as OpenAI;
  const context = [
    { role: "user" as const, content: "I am planning Japan" },
    { role: "assistant" as const, content: "Kept the plan." },
  ];
  const review = itemIntentReviewer(
    provider,
    "synthetic-model",
    context,
    new AbortController().signal,
  );
  const proposal = {
    operation: "save",
    input: { content: "Kyoto hotel" },
    parent: { content: "Japan trip" },
  };
  expect(await review(proposal, "Save this hotel for that trip")).toBe(true);
  expect(payloads[0].store).toBe(false);
  expect(payloads[0]).not.toHaveProperty("tools");
  const input = JSON.parse(payloads[0].input as string);
  expect(input.directText).toBe("Save this hotel for that trip");
  expect(input.proposal.parent.content).toBe("Japan trip");
  expect(input.conversation).toEqual(context);
  await review({}, "another change");
  await review({}, "another change");
  await review({}, "another change");
  expect(await review({}, "another change")).toBe(false);
  expect(payloads).toHaveLength(4);
});
