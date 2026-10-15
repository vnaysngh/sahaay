import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { Temporal } from "@js-temporal/polyfill";
import type { z } from "zod";
import { eventInput, eventTime } from "@sahaay/api-client";
import type { GoogleAction } from "@sahaay/api-client";
import { RequestError } from "../core/validation";
import { readOptions, writeOptions } from "./gmail";
export function calendarTime(value: z.infer<typeof eventTime>) {
  try {
    const v = eventTime.parse(value);
    // Temporal rejects DST gaps/overlaps rather than guessing an offset.
    Temporal.Now.zonedDateTimeISO(v.timeZone);
    if (v.date) return { date: Temporal.PlainDate.from(v.date).toString() };
    return {
      dateTime: Temporal.PlainDateTime.from(v.localDateTime!)
        .toZonedDateTime(v.timeZone, { disambiguation: "reject" })
        .toInstant()
        .toString(),
      timeZone: v.timeZone,
    };
  } catch (e) {
    if (e instanceof RequestError) throw e;
    throw new RequestError(
      400,
      "calendar_time",
      "Choose a valid date, time and IANA timezone. Ambiguous daylight-saving times need clarification.",
    );
  }
}
export function calendarEvent(value: z.infer<typeof eventInput>) {
  const input = eventInput.parse(value),
    start = calendarTime(input.start),
    end = calendarTime(input.end);
  if (Boolean(start.date) !== Boolean(end.date))
    throw new RequestError(
      400,
      "calendar_time",
      "Use matching all-day or timed boundaries.",
    );
  if ((start.date ?? start.dateTime!) >= (end.date ?? end.dateTime!))
    throw new RequestError(
      400,
      "calendar_time",
      "The event must end after it starts.",
    );
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start,
    end,
    attendees: input.attendees.map((email) => ({ email })),
  };
}
export function timeRange(start: string, end: string) {
  const a = Temporal.Instant.from(start),
    b = Temporal.Instant.from(end);
  if (
    Temporal.Instant.compare(a, b) >= 0 ||
    b.epochMilliseconds - a.epochMilliseconds > 32 * 86400000
  )
    throw new RequestError(
      400,
      "calendar_range",
      "Choose a calendar interval of at most 32 days.",
    );
  return { timeMin: a.toString(), timeMax: b.toString() };
}
export class CalendarService {
  private api;
  constructor(auth: OAuth2Client) {
    this.api = google.calendar({ version: "v3", auth });
  }
  async calendars(pageToken?: string) {
    const { data } = await this.api.calendarList.list(
      { maxResults: 20, pageToken },
      readOptions,
    );
    return {
      calendars: (data.items ?? []).map((c) => ({
        id: c.id,
        summary: c.summary,
        timeZone: c.timeZone,
        primary: c.primary ?? false,
        accessRole: c.accessRole,
      })),
      nextPageToken: data.nextPageToken ?? null,
    };
  }
  async approvalPreview(calendarId: string, eventId?: string, etag?: string) {
    const { data: calendar } = await this.api.calendarList.get(
      { calendarId },
      readOptions,
    );
    if (!["owner", "writer"].includes(calendar.accessRole ?? ""))
      throw new RequestError(
        403,
        "calendar_readonly",
        "You cannot edit this calendar.",
      );
    const event = eventId ? await this.get(calendarId, eventId) : null;
    if (event && event.etag !== etag)
      throw new RequestError(
        409,
        "google_stale",
        "The event changed. Fetch current details first.",
      );
    return {
      calendar: calendar.summary ?? calendarId,
      event: event?.summary ?? null,
      start: event?.start?.dateTime ?? event?.start?.date ?? null,
      end: event?.end?.dateTime ?? event?.end?.date ?? null,
    };
  }
  async list(
    calendarId: string,
    start: string,
    end: string,
    query?: string,
    pageToken?: string,
  ) {
    const { data } = await this.api.events.list(
      {
        calendarId,
        ...timeRange(start, end),
        q: query,
        pageToken,
        maxResults: 20,
        singleEvents: true,
        orderBy: "startTime",
      },
      readOptions,
    );
    return {
      events: (data.items ?? []).map(eventSummary),
      nextPageToken: data.nextPageToken ?? null,
      timeZone: data.timeZone,
    };
  }
  async get(calendarId: string, eventId: string) {
    return eventSummary(
      (await this.api.events.get({ calendarId, eventId }, readOptions)).data,
    );
  }
  async availability(
    calendarIds: string[],
    start: string,
    end: string,
    timeZone: string,
  ) {
    Temporal.Now.zonedDateTimeISO(timeZone);
    return (
      await this.api.freebusy.query(
        {
          requestBody: {
            ...timeRange(start, end),
            timeZone,
            calendarExpansionMax: 10,
            items: calendarIds.slice(0, 10).map((id) => ({ id })),
          },
        },
        writeOptions,
      )
    ).data;
  }
  async execute(
    action: Extract<
      GoogleAction,
      { kind: "calendar_create" | "calendar_update" | "calendar_delete" }
    >,
    operationId: string,
  ) {
    const calendar = (
      await this.api.calendarList.get(
        { calendarId: action.calendarId },
        readOptions,
      )
    ).data;
    if (!["owner", "writer"].includes(calendar.accessRole ?? ""))
      throw new RequestError(
        403,
        "calendar_readonly",
        "You cannot edit this calendar.",
      );
    if (action.kind !== "calendar_create") {
      const old = (
        await this.api.events.get(
          { calendarId: action.calendarId, eventId: action.eventId },
          readOptions,
        )
      ).data;
      if (
        action.kind === "calendar_update" &&
        (old.attendees?.length ?? 0) > 20
      )
        throw new RequestError(
          409,
          "calendar_attendees",
          "This event has too many attendees to safely update in Sahaay. Edit it in Google Calendar.",
        );
      if (old.etag !== action.etag)
        throw new RequestError(
          409,
          "google_stale",
          "The event changed. Review a fresh proposal.",
        );
      if (
        (old.recurrence?.length && action.recurrenceScope !== "series") ||
        (old.recurringEventId && action.recurrenceScope !== "occurrence")
      )
        throw new RequestError(
          409,
          "calendar_recurrence",
          "Select the exact occurrence or explicitly approve the entire series. Following occurrences are not supported.",
        );
    }
    const common = {
      calendarId: action.calendarId,
      sendUpdates: "all" as const,
    };
    if (action.kind === "calendar_delete") {
      await this.api.events.delete(
        { ...common, eventId: action.eventId },
        { ...writeOptions, headers: { "If-Match": action.etag } },
      );
      return { outcome: "event_deleted" };
    }
    const requestBody = calendarEvent(action.event);
    const { data } =
      action.kind === "calendar_create"
        ? await this.api.events.insert(
            {
              ...common,
              requestBody: {
                ...requestBody,
                id: operationId.replaceAll("-", ""),
              },
            },
            writeOptions,
          )
        : await this.api.events.patch(
            { ...common, eventId: action.eventId, requestBody },
            { ...writeOptions, headers: { "If-Match": action.etag } },
          );
    return {
      id: data.id ?? undefined,
      outcome:
        action.kind === "calendar_create" ? "event_created" : "event_updated",
    };
  }
}
function eventSummary(e: import("googleapis").calendar_v3.Schema$Event) {
  return {
    id: e.id,
    etag: e.etag,
    summary: (e.summary ?? "").slice(0, 500),
    description: (e.description ?? "").slice(0, 8000),
    location: (e.location ?? "").slice(0, 500),
    start: e.start,
    end: e.end,
    status: e.status,
    organizer: e.organizer,
    attendees: e.attendees
      ?.slice(0, 20)
      .map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
    recurringEventId: e.recurringEventId,
    recurrence: e.recurrence,
    originalStartTime: e.originalStartTime,
  };
}
