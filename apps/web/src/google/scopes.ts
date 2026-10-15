import type { Capability } from "@sahaay/api-client";
export const identityScopes = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
export const scopes: Record<Capability, string[]> = {
  gmail_read: ["https://www.googleapis.com/auth/gmail.readonly"],
  gmail_compose: ["https://www.googleapis.com/auth/gmail.compose"],
  gmail_send: ["https://www.googleapis.com/auth/gmail.send"],
  calendar_read: [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.freebusy",
  ],
  calendar_write: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ],
};
export function capabilities(granted: string[]): Capability[] {
  return (Object.keys(scopes) as Capability[]).filter((c) =>
    scopes[c].every(
      (s) =>
        granted.includes(s) ||
        (s === scopes.calendar_read[0] &&
          granted.includes(scopes.calendar_write[0])) ||
        (s === scopes.gmail_send[0] &&
          granted.includes(scopes.gmail_compose[0])),
    ),
  );
}
export function canonicalScope(s: string) {
  return s === "email"
    ? identityScopes[1]
    : s === "profile"
      ? identityScopes[2]
      : s;
}
