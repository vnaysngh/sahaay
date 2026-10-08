import type { MutationContext, MutationResult } from "./memory";
import { z } from "zod";
import { RequestError } from "./validation";
export const followupInput = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    relatedItemId: z.string().uuid().nullable(),
    scheduledFor: z.string().datetime(),
    localTime: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/),
    timezone: z.string().max(80),
  })
  .strict();
export type FollowupInput = z.infer<typeof followupInput>;
export type Followup = {
  id: string;
  reason: string;
  relatedItemId: string | null;
  relatedTitle: string | null;
  relatedObjectId: string | null;
  scheduledFor: string;
  timezone: string;
  status: string;
  deliveryStatus: string;
  version: number;
  openedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  lifecycleSource?: string;
  lifecycleChangedAt?: string | null;
};
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export function localDate(date: Date, zone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => p.find((x) => x.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function validateSchedule(input: FollowupInput, now = new Date()) {
  if (!validTimezone(input.timezone))
    throw new RequestError(
      400,
      "timezone",
      "Choose a valid IANA timezone, e.g. Asia/Kolkata.",
    );
  const time = new Date(input.scheduledFor),
    delta = time.getTime() - now.getTime();
  if (delta <= 0 || delta > 2 * 366 * 86400000)
    throw new RequestError(
      400,
      "schedule",
      "Choose a future time within two years.",
    );
  if (
    time.getUTCSeconds() ||
    time.getUTCMilliseconds() ||
    localDate(time, input.timezone) !== input.localTime
  )
    throw new RequestError(
      400,
      "local_time",
      "The local time and UTC time do not agree. Recheck the timezone; do not guess.",
    );
  // Check offsets on either side of the date rather than assuming all clock
  // changes are exactly one hour (Lord Howe changes by 30 minutes, for example).
  const wall = Date.parse(input.localTime + ":00Z");
  for (const hours of [-36, 36]) {
    const sample = new Date(time.getTime() + hours * 3600000);
    const offset =
      Date.parse(localDate(sample, input.timezone) + ":00Z") - sample.getTime();
    const alternate = new Date(wall - offset);
    if (
      alternate.getTime() !== time.getTime() &&
      localDate(alternate, input.timezone) === input.localTime
    )
      throw new RequestError(
        400,
        "ambiguous_time",
        "This local time repeats during a clock change. Ask for an unambiguous time.",
      );
  }
  return time;
}
// Resolve a supplied wall-clock time in its explicitly selected timezone. Never
// use the server/browser timezone as an implicit default. DST gaps are rejected.
export function resolveLocalTime(
  localTime: string,
  timezone: string,
  now = new Date(),
) {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(localTime) ||
    !validTimezone(timezone)
  )
    throw new RequestError(
      400,
      "local_time",
      "Choose a valid date, time and timezone.",
    );
  const wall = Date.parse(localTime + ":00Z");
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== localTime
  )
    throw new RequestError(400, "local_time", "Choose a valid date.");
  let candidate = wall;
  for (let n = 0; n < 5; n++) {
    const actual = localDate(new Date(candidate), timezone);
    if (actual === localTime) {
      const scheduledFor = new Date(candidate).toISOString();
      validateSchedule(
        {
          reason: "time check",
          relatedItemId: null,
          scheduledFor,
          localTime,
          timezone,
        },
        now,
      );
      return scheduledFor;
    }
    candidate += wall - Date.parse(actual + ":00Z");
  }
  throw new RequestError(
    400,
    "local_time",
    "This time does not exist during a clock change. Choose another time.",
  );
}

export interface FollowupService {
  context(
    owner: string,
  ): Promise<{ timezone: string | null; now: string; recent: Followup[] }>;
  list(owner: string, relatedItemId?: string | null): Promise<Followup[]>;
  create(
    ctx: MutationContext,
    input: FollowupInput,
  ): Promise<MutationResult<Followup>>;
  change(
    ctx: MutationContext,
    id: string,
    version: number,
    action: "reschedule" | "done" | "cancel",
    input?: FollowupInput,
  ): Promise<MutationResult<Followup>>;
}
