import blackLogo from "../../assets/logo-black.png";
import whiteLogo from "../../assets/logo-white.png";
import { useEffect, useState } from "react";
import {
  enableNotifications,
  disableNotifications,
  notificationStatus,
} from "../../src/notifications";
import { shares } from "../../src/shares";
import { Alert, Image, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, authClient } from "../../src/auth";
import { Screen, Card, Label, Button, useTheme } from "../../src/ui";
export default function Home() {
  const { data: session } = authClient.useSession(),
    { colors, isDark, mode, setMode } = useTheme(),
    cache = useQueryClient();
  const owner = session?.user.id;
  const [pending, setPending] = useState(0);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const notifications = useQuery({
    queryKey: [owner, "notification-status"],
    queryFn: notificationStatus,
    enabled: !!owner,
  });
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const refresh = (event?: { error?: string }) => {
      if (event?.error && active) Alert.alert("Share to Sahaay", event.error);
      void shares
        .list(owner)
        .then((d) => {
          if (active) setPending(d.length);
        })
        .catch(() => {});
    };
    refresh();
    const listener = shares.listen(refresh);
    return () => {
      active = false;
      listener.remove();
    };
  }, [owner]);
  const state = useQuery({
    queryKey: [owner, "state"],
    queryFn: () => api.state(),
    enabled: !!owner,
  });
  const inbox = useQuery({
    queryKey: [owner, "inbox"],
    queryFn: () => api.inbox(),
    enabled: !!owner,
  });
  return (
    <Screen
      title="Sahaay"
      titleIcon={
        <Image
          source={isDark ? whiteLogo : blackLogo}
          style={{ height: 36, width: 48 }}
          resizeMode="contain"
          accessible={false}
        />
      }
      subtitle={`Hello, ${session?.user.name?.split(" ")[0] ?? "there"}. What’s on your mind?`}
    >
      <Button
        title="Talk to Sahaay"
        onPress={() => router.push("/(tabs)/chat")}
      />
      <Card onPress={() => router.push("/(tabs)/saved")}>
        <Label>Your space</Label>
        <Label muted>
          {state.data
            ? `${state.data.records.length} plans and saved things`
            : "Plans, ideas and things you’re keeping"}
        </Label>
      </Card>
      <Card onPress={() => router.push("/(tabs)/inbox")}>
        <Label>Follow-ups</Label>
        <Label muted>
          {inbox.data
            ? `${inbox.data.recent.filter((x) => x.status === "ready").length} ready for your attention`
            : "Things you asked Sahaay to bring back"}
        </Label>
      </Card>
      {pending > 0 ? (
        <Button
          title={`Review ${pending} pending share(s)`}
          onPress={() => router.push("/share")}
        />
      ) : null}
      <Label muted>
        Share text, a link or an image from another app. Sahaay appears in your
        phone’s share sheet.
      </Label>
      <View style={{ gap: 10 }}>
        <Button
          secondary
          title={`Appearance: ${mode}`}
          onPress={() =>
            setMode(
              mode === "system"
                ? "light"
                : mode === "light"
                  ? "dark"
                  : "system",
            )
          }
        />
        <Button
          secondary
          title={
            notificationBusy
              ? "Updating…"
              : notifications.isError
                ? "Check notification status"
                : notifications.isPending
                  ? "Checking notifications…"
                  : !notifications.data?.configured
                    ? "Reminder alerts aren’t available yet"
                    : notifications.data.enabled
                      ? "Turn off reminder alerts"
                      : "Turn on reminder alerts"
          }
          disabled={
            notificationBusy ||
            notifications.isPending ||
            (!notifications.isError && !notifications.data?.configured)
          }
          onPress={() => {
            if (notifications.isError) {
              void notifications.refetch();
              return;
            }
            setNotificationBusy(true);
            const enabled = notifications.data?.enabled;
            void (enabled ? disableNotifications() : enableNotifications())
              .then(() => notifications.refetch())
              .catch((e) =>
                Alert.alert(
                  "Reminder alerts",
                  e instanceof Error
                    ? e.message
                    : "Please try again while online.",
                ),
              )
              .finally(() => setNotificationBusy(false));
          }}
        />
        <Label muted>
          {notifications.data?.configured
            ? "Alerts for reminders you requested, on this phone only. Your Inbox stays available when alerts are off."
            : "You can still view your reminders in Inbox. Phone alerts need push notification setup first."}
        </Label>
        <Button
          secondary
          title="Sign out"
          onPress={() => {
            void disableNotifications()
              .then(async () => {
                if (owner) {
                  const drafts = await shares.list(owner);
                  for (const draft of drafts)
                    if (draft.owner === owner)
                      await shares.remove(draft.id, owner);
                }
                return authClient.signOut();
              })
              .then(() => {
                cache.clear();
                router.replace("/sign-in");
              })
              .catch(() =>
                Alert.alert(
                  "Could not sign out safely",
                  "Please try again while online so this device’s notification registration can be removed.",
                ),
              );
          }}
        />
      </View>
      <Label muted>
        Your account is shared with Web and connected Telegram.
      </Label>
      <View style={{ borderBottomColor: colors.line }} />
    </Screen>
  );
}
