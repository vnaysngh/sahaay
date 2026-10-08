import { it, expect } from "vitest";
import { recordTools } from "../../apps/web/src/providers/record-tools";
import type { RecordServices } from "../../apps/web/src/providers/record-tools";
const change = async () => ({
  outcome: "committed" as const,
  record: null,
  targetId: crypto.randomUUID(),
});
const services: RecordServices = {
  memories: {
    recall: async () => [],
    remember: change,
    update: change,
    forget: change,
  },
  items: {
    inspect: async () => null,
    find: async () => [],
    save: change,
    update: change,
    remove: change,
  },
};
it("builds provider-compatible schemas without URI or dynamic object fields", () => {
  const tools = recordTools(
    services,
    {
      userId: "owner",
      conversationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      inputs: [{ type: "text", text: "Save this idea" }],
      receivedAt: new Date().toISOString(),
    },
    "Save this idea",
    () => {},
  );
  expect(tools).toHaveLength(11);
  for (const tool of tools) {
    const schema = JSON.stringify(tool.parameters);
    expect(schema).not.toContain('"format":"uri"');
    expect(schema).not.toMatch(/"additionalProperties":\{/);
  }
});
