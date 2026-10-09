import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { z } from "zod";
import { api } from "./auth";
const key = "sahaay_installation";
export async function installationId() {
  let id = await SecureStore.getItemAsync(key);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
  }
  return id;
}
export async function notificationStatus() {
  return api.json(
    "/api/mobile/devices?installationId=" + (await installationId()),
    z.object({ enabled: z.boolean(), configured: z.boolean() }),
  );
}
export async function enableNotifications() {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId)
    throw new Error(
      "Push notifications need an Expo project and device credentials first. Inbox works without them.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("followups", {
      name: "Sahaay follow-ups",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const p = await Notifications.requestPermissionsAsync();
  if (!p.granted)
    throw new Error(
      "Notification permission was not granted. You can still use Inbox.",
    );
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return register(token.data);
}
export async function register(token: string) {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return;
  return api.json("/api/mobile/devices", z.object({ enabled: z.boolean() }), {
    installationId: await installationId(),
    token,
    projectId,
    platform: Platform.OS,
    enabled: true,
  });
}
export async function disableNotifications() {
  await api.request("/api/mobile/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId: await installationId() }),
  });
}
export const notificationTarget = (data: unknown) =>
  z.object({ followupId: z.string().uuid() }).safeParse(data);
