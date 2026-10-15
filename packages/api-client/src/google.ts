import { z } from "zod";
export const capability = z.enum([
  "gmail_read",
  "gmail_compose",
  "gmail_send",
  "calendar_read",
  "calendar_write",
]);
export type Capability = z.infer<typeof capability>;
export const googlePermissions: ReadonlyArray<{
  capability: Capability;
  title: string;
  description: string;
}> = [
  {
    capability: "gmail_read",
    title: "Read Gmail",
    description: "Search and read your emails and threads when you ask.",
  },
  {
    capability: "gmail_compose",
    title: "Create Gmail drafts",
    description:
      "Create and manage drafts. Google's permission also allows reading and sending email; Sahaay requires approval before writing or sending.",
  },
  {
    capability: "gmail_send",
    title: "Send Gmail",
    description:
      "Send email from your account after you approve the exact message.",
  },
  {
    capability: "calendar_read",
    title: "Read Calendar and availability",
    description:
      "List your calendars, read events and check when you are busy.",
  },
  {
    capability: "calendar_write",
    title: "Create, change and delete events",
    description:
      "View and change events on your calendars after approval. Google may notify attendees.",
  },
];
export const connectionSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  status: z.enum([
    "connected",
    "reauthorization_required",
    "disconnected",
    "temporarily_unavailable",
  ]),
  capabilities: z.array(capability),
  scopes: z.array(z.string()),
  lastSuccessfulUseAt: z.string().nullable(),
});
export const emailInput = z
  .object({
    to: z.array(z.string().email().max(254)).min(1).max(20),
    cc: z.array(z.string().email().max(254)).max(20).default([]),
    subject: z
      .string()
      .max(500)
      .refine((s) => !/[\r\n]/.test(s)),
    body: z.string().min(1).max(16000),
    replyMessageId: z.string().max(200).nullable().default(null),
  })
  .strict();
export const eventTime = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    localDateTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
      .nullable(),
    timeZone: z.string().min(1).max(100),
  })
  .strict()
  .refine(
    (v) => Boolean(v.date) !== Boolean(v.localDateTime),
    "Choose a date or local date/time.",
  );
export const eventInput = z
  .object({
    summary: z.string().min(1).max(500),
    description: z.string().max(8000),
    location: z.string().max(500),
    start: eventTime,
    end: eventTime,
    attendees: z.array(z.string().email().max(254)).max(20),
  })
  .strict();
const account = { connectionId: z.string().uuid() };
export const actionInput = z.discriminatedUnion("kind", [
  z
    .object({ ...account, kind: z.literal("gmail_draft"), message: emailInput })
    .strict(),
  z
    .object({ ...account, kind: z.literal("gmail_send"), message: emailInput })
    .strict(),
  z
    .object({
      ...account,
      kind: z.literal("calendar_create"),
      calendarId: z.string().min(1).max(300),
      event: eventInput,
    })
    .strict(),
  z
    .object({
      ...account,
      kind: z.literal("calendar_update"),
      calendarId: z.string().min(1).max(300),
      eventId: z.string().min(1).max(300),
      etag: z.string().min(1).max(300),
      recurrenceScope: z.enum(["occurrence", "series"]),
      event: eventInput,
    })
    .strict(),
  z
    .object({
      ...account,
      kind: z.literal("calendar_delete"),
      calendarId: z.string().min(1).max(300),
      eventId: z.string().min(1).max(300),
      etag: z.string().min(1).max(300),
      recurrenceScope: z.enum(["occurrence", "series"]),
    })
    .strict(),
]);
export type GoogleAction = z.infer<typeof actionInput>;
export function actionTitle(kind: GoogleAction["kind"]) {
  return {
    gmail_draft: "Draft email",
    gmail_send: "Send email",
    calendar_create: "Create Calendar event",
    calendar_update: "Update Calendar event",
    calendar_delete: "Delete Calendar event",
  }[kind];
}
export function actionStatus(status: string) {
  return (
    (
      {
        pending: "Needs your approval",
        executing: "In progress",
        succeeded: "Completed",
        failed: "Couldn’t complete",
        unknown: "Check Google",
        cancelled: "Cancelled",
      } as Record<string, string>
    )[status] ?? "Unavailable"
  );
}
export function actionDetails(
  proposal: GoogleAction,
  preview: {
    calendar: string;
    event: string | null;
    start: string | null;
    end: string | null;
  } | null,
) {
  if (proposal.kind === "gmail_draft" || proposal.kind === "gmail_send")
    return [
      ["To", proposal.message.to.join(", ")],
      ["Cc", proposal.message.cc.join(", ") || "None"],
      ["Subject", proposal.message.subject],
      ["Message", proposal.message.body],
      [
        "Reply",
        proposal.message.replyMessageId
          ? "Reply in the selected Gmail thread"
          : "New message",
      ],
    ];
  const fields = [["Calendar", preview?.calendar ?? "Selected calendar"]];
  if (preview?.event)
    fields.push(
      ["Current event", preview.event],
      ["Current start", preview.start ?? "Not available"],
      ["Current end", preview.end ?? "Not available"],
    );
  if (proposal.kind !== "calendar_create")
    fields.push([
      "Applies to",
      proposal.recurrenceScope === "series"
        ? "Entire recurring series"
        : "This occurrence only",
    ]);
  if ("event" in proposal) {
    const e = proposal.event;
    fields.push(
      ["Event", e.summary],
      [
        "Starts",
        `${e.start.date ?? e.start.localDateTime} · ${e.start.timeZone}`,
      ],
      [
        "Ends",
        `${e.end.date ?? e.end.localDateTime} · ${e.end.timeZone}${e.end.date ? " (exclusive all-day end)" : ""}`,
      ],
      ["Location", e.location || "None"],
      ["Description", e.description || "None"],
      ["Attendees", e.attendees.join(", ") || "None"],
    );
  }
  return fields;
}
export const approvalSchema = z.object({
  preview: z
    .object({
      calendar: z.string(),
      event: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
    })
    .nullable(),
  id: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  requestIds: z.array(z.string().uuid()).max(100).optional(),
  status: z.enum([
    "pending",
    "executing",
    "succeeded",
    "failed",
    "unknown",
    "cancelled",
  ]),
  expiresAt: z.string(),
  accountEmail: z.string(),
  proposal: actionInput,
  result: z
    .object({ id: z.string().optional(), outcome: z.string() })
    .nullable(),
});
export const connectionsSchema = z.object({
  configured: z.boolean(),
  mobileLinksConfigured: z.boolean(),
  connections: z.array(connectionSchema),
});
export const authorizeInput = z
  .object({
    capabilities: z.array(capability).max(5),
    platform: z.enum(["web", "mobile"]),
    connectionId: z.string().uuid().optional(),
  })
  .strict();
