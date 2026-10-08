import { resolveLocalTime, localDate } from "../core/followups";
import type { UnifiedRequest } from "../core/contracts";
import type { RecordServices } from "./record-tools";
// Deterministic browser fixtures still exercise the real owned SQL services.
export async function recordFixture(
  services: RecordServices,
  request: UnifiedRequest,
  text: string,
): Promise<{
  text: string;
  operations: string[];
  fail?: boolean;
  artifacts?: Array<{ id: string; title: string }>;
} | null> {
  const ctx = { request, actionId: "record-fixture" };
  if (services.artifacts) {
    const service = services.artifacts,
      base = text.split("\n[Image attachment")[0].trim(),
      approved = { ...ctx, reviewItemIntent: async () => true };
    if (base === "Keep my Aadhaar." || base === "Keep this invoice.") {
      const image = request.inputs.find((i) => i.type === "image");
      if (!image || image.type === "text")
        throw Error("fixture image required");
      const identity = base === "Keep my Aadhaar.";
      await service.create(approved, {
        attachmentId: image.attachmentId,
        title: identity ? "Aadhaar Card" : "Laptop Invoice",
        category: identity ? "identity_document" : "invoice",
        description: identity
          ? "Synthetic identity card"
          : "Synthetic laptop invoice",
        extractedText: identity
          ? "Address: 42 Synthetic Road, Pune. Aadhaar 0000 1111 2222."
          : "Laptop invoice amount 10000 INR",
        metadata: identity
          ? [
              { key: "document_type", value: "aadhaar" },
              { key: "address", value: "42 Synthetic Road, Pune" },
              { key: "last_four", value: "2222" },
            ]
          : [{ key: "amount", value: "10000 INR" }],
        relatedItemId: null,
      });
      return {
        text: identity
          ? "Kept your Aadhaar image in Documents."
          : "Kept your laptop invoice in Documents.",
        operations: ["artifact_create"],
      };
    }
    if (
      [
        "Send me my Aadhaar.",
        "What's the address on my Aadhaar?",
        "Delete my Aadhaar.",
        "What documents do you have for me?",
        "Send my invoice.",
      ].includes(base)
    ) {
      const rows = await service.search(
        request.userId,
        base.includes("invoice")
          ? "invoice"
          : base.startsWith("What documents")
            ? null
            : "aadhaar",
      );
      if (base.startsWith("What documents"))
        return {
          text: rows.map((r) => r.title).join(", ") || "No documents stored.",
          operations: [],
        };
      if (!rows.length)
        return { text: "I do not have that document stored.", operations: [] };
      if (rows.length > 1)
        return {
          text: "I found multiple matching documents. Which one do you mean?",
          operations: [],
        };
      const r = rows[0];
      if (base.startsWith("Delete")) {
        await service.delete(approved, r.id, r.version);
        return {
          text: "Deleted your Aadhaar original and extracted information.",
          operations: ["artifact_delete"],
        };
      }
      if (base.startsWith("Send")) {
        await service.requestOriginal(approved, r.id);
        return {
          text: "Here is your stored original image.",
          operations: [],
          artifacts: [{ id: r.id, title: r.title }],
        };
      }
      const record = await service.get(request.userId, r.id);
      return {
        text:
          record.metadata.find((m) => m.key === "address")?.value ??
          "Address unreadable.",
        operations: [],
      };
    }
  }

  if (services.followups) {
    const followups = services.followups;
    const approved = { ...ctx, reviewItemIntent: async () => true };
    if (text === "Remind me tomorrow at 10 AM to research flights for Japan.") {
      const zone = (await followups.context(request.userId)).timezone;
      if (!zone)
        return {
          text: "Please confirm your timezone in Inbox first.",
          operations: [],
        };
      const tomorrow = new Date(Date.now() + 86400000),
        localTime = localDate(tomorrow, zone).slice(0, 10) + "T10:00";
      const plan = (
        await services.items.find(request.userId, {
          query: "Japan",
          recordRole: "object",
        })
      )[0];
      await followups.create(approved, {
        reason: "Research flights for Japan",
        relatedItemId: plan?.id ?? null,
        localTime,
        timezone: zone,
        scheduledFor: resolveLocalTime(localTime, zone),
      });
      return {
        text: "Scheduled your Japan flight-research reminder for tomorrow at 10 AM.",
        operations: ["followup_create"],
      };
    }
    if (
      [
        "Actually make that noon.",
        "Cancel that reminder.",
        "I already did that.",
        "What follow-ups do I have?",
      ].includes(text)
    ) {
      const records = (await followups.list(request.userId)).filter((r) =>
        ["scheduled", "ready"].includes(r.status),
      );
      if (text === "What follow-ups do I have?")
        return {
          text:
            records
              .map((r) => r.reason + " · " + r.status + " · " + r.scheduledFor)
              .join("\n") || "No active follow-ups.",
          operations: [],
        };
      const record = records[0];
      if (!record) return { text: "No active reminder found.", operations: [] };
      const action =
        text === "Actually make that noon."
          ? "reschedule"
          : text === "I already did that."
            ? "done"
            : "cancel";
      const localTime =
        localDate(new Date(record.scheduledFor), record.timezone).slice(0, 10) +
        "T12:00";
      await followups.change(
        approved,
        record.id,
        record.version,
        action,
        action === "reschedule"
          ? {
              reason: record.reason,
              relatedItemId: record.relatedItemId,
              timezone: record.timezone,
              localTime,
              scheduledFor: resolveLocalTime(localTime, record.timezone),
            }
          : undefined,
      );
      return {
        text:
          action === "reschedule"
            ? "Rescheduled that reminder for noon."
            : action === "done"
              ? "Marked that reminder done."
              : "Cancelled that reminder.",
        operations: ["followup_" + action],
      };
    }
    if (text === "Can you monitor the price of this flight every day?") {
      await services.unsupportedAction?.("travel", "flight_price_monitoring");
      return {
        text: "Flight price monitoring is not supported. No monitor was started.",
        operations: [],
      };
    }
  }

  if (text === "Save these to my cart: Gym shoes, Swimming goggles, Dashcam.") {
    for (const [i, content] of [
      "Gym shoes",
      "Swimming goggles",
      "Dashcam",
    ].entries())
      await services.items.save(
        {
          ...ctx,
          actionId: `cart-fixture-${i}`,
          reviewItemIntent: async () => true,
        },
        {
          kind: "cart item",
          content,
          recordRole: "item",
          parentId: null,
          stateLabel: "to buy",
          url: null,
          structuredValue: null,
          listLabel: "cart",
          status: "saved",
        },
      );
    return { text: "Saved three items to your cart.", operations: ["save"] };
  }
  if (text === "I'm thinking about going to Japan in December.") {
    const old = (
      await services.items.find(request.userId, {
        query: "Japan",
        recordRole: "object",
      })
    )[0];
    if (!old)
      await services.items.save(
        { ...ctx, reviewItemIntent: async () => true },
        {
          recordRole: "object",
          parentId: null,
          stateLabel: "planning",
          kind: "trip",
          content: "Japan trip",
          url: null,
          structuredValue: { details: "December" },
          listLabel: null,
          status: "saved",
        },
      );
    return {
      text: "Kept your Japan trip in planning for December.",
      operations: old ? [] : ["save"],
    };
  }
  if (text === "Save this hotel for Japan: https://example.com/kyoto-hotel") {
    const parent = (
      await services.items.find(request.userId, {
        query: "Japan",
        recordRole: "object",
      })
    )[0];
    if (!parent) throw Error("missing fixture object");
    await services.items.save(
      { ...ctx, reviewItemIntent: async () => true },
      {
        recordRole: "item",
        parentId: parent.id,
        stateLabel: "considering",
        kind: "hotel",
        content: "Kyoto hotel",
        url: "https://example.com/kyoto-hotel",
        structuredValue: null,
        listLabel: null,
        status: "saved",
      },
    );
    return {
      text: "Saved Kyoto hotel for your Japan trip.",
      operations: ["save"],
    };
  }
  if (text === "What do I have planned for Japan?") {
    const parent = (
      await services.items.find(request.userId, {
        query: "Japan",
        recordRole: "object",
      })
    )[0];
    const children = parent
      ? await services.items.find(request.userId, {
          query: null,
          parentId: parent.id,
        })
      : [];
    return {
      text: parent
        ? `Japan trip: planning for December. ${children.map((c) => c.content).join(", ")}`
        : "No saved Japan trip.",
      operations: [],
    };
  }
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
