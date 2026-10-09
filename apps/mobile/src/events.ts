import * as Crypto from "expo-crypto";
import { api } from "./auth";
type Event = Parameters<typeof api.event>[0];
export function event(name: Event, id = Crypto.randomUUID()) {
  // Telemetry failure never blocks the user's work and is never retried with private content.
  void api.event(name, id).catch(() => {});
}
