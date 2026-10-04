import type { UnifiedRequest } from "../core/contracts";
import type { RecordServices } from "./record-tools";
// Deterministic browser fixtures still exercise the real owned SQL services.
export async function recordFixture(
  services: RecordServices,
  request: UnifiedRequest,
  text: string,
): Promise<{ text: string; operations: string[]; fail?: boolean } | null> {
  const ctx = { request, actionId: "record-fixture" };
  if (text === "Remember I prefer aisle seats on flights.") {
    await services.memories.remember(ctx, {
      memoryKey: "flight_seat_preference",
      type: "semantic",
      category: "travel",
      content: "I prefer aisle seats on flights.",
      structuredValue: null,
      scope: "personal",
    });
    return {
      text: "Remembered your aisle seat preference.",
      operations: ["remember"],
    };
  }
  if (text === "Actually I prefer window seats on flights.") {
    const old = (
      await services.memories.recall(request.userId, {
        query: "flight_seat_preference",
      })
    )[0];
    if (!old) throw Error("missing fixture memory");
    await services.memories.update(ctx, old.id, old.version, {
      memoryKey: old.memoryKey,
      type: old.type,
      category: old.category,
      content: "I prefer window seats on flights.",
      structuredValue: null,
      scope: old.scope,
    });
    return {
      text: "Updated your preference to window seats.",
      operations: ["update_memory"],
    };
  }
  if (text === "Forget my flight seat preference.") {
    const old = (
      await services.memories.recall(request.userId, {
        query: "flight_seat_preference",
      })
    )[0];
    if (old) await services.memories.forget(ctx, old.id, old.version);
    return {
      text: "Forgotten your flight seat preference.",
      operations: old ? ["forget"] : [],
    };
  }
  if (text === "What is my preferred flight seat?") {
    const old = (
      await services.memories.recall(request.userId, {
        query: "flight_seat_preference",
      })
    )[0];
    return {
      text: old ? old.content : "I have no saved flight seat preference.",
      operations: [],
    };
  }
  if (text === "Why do you remember my flight seat preference?") {
    const old = (
      await services.memories.recall(request.userId, {
        query: "flight_seat_preference",
      })
    )[0];
    return {
      text: old
        ? `You explicitly asked me to remember it on ${old.createdAt}. Source message: ${old.sourceId}.`
        : "No saved memory found.",
      operations: [],
    };
  }
  if (text.startsWith("Save this video idea")) {
    await services.items.save(ctx, {
      kind: "idea",
      content: "A quiet city walk at dawn",
      url: null,
      structuredValue: null,
      listLabel: "videos",
      status: "saved",
    });
    return {
      text: "Saved your city walk video idea to videos.",
      operations: ["save"],
      fail: text.includes("simulate research failure"),
    };
  }
  if (text === "Show my saved video ideas.") {
    const records = await services.items.find(request.userId, {
      query: null,
      listLabel: "videos",
    });
    return {
      text: records.length
        ? records.map((r) => `${r.content} (${r.status})`).join("\n")
        : "No saved video ideas.",
      operations: [],
    };
  }
  if (
    text === "Mark the city walk video idea done." ||
    text === "Delete the saved city walk video idea."
  ) {
    const old = (
      await services.items.find(request.userId, { query: "city walk" })
    )[0];
    if (!old) throw Error("missing fixture item");
    if (text.startsWith("Mark")) {
      await services.items.update(ctx, old.id, old.version, {
        kind: old.kind,
        content: old.content,
        url: old.url,
        structuredValue: old.structuredValue,
        listLabel: old.listLabel,
        status: "done",
      });
      return {
        text: "Marked the city walk idea done.",
        operations: ["update_item"],
      };
    }
    await services.items.remove(ctx, old.id, old.version);
    return {
      text: "Removed the city walk video idea.",
      operations: ["remove_item"],
    };
  }
  return null;
}
