import { useEffect, useRef, useState } from "react";
import * as ScreenCapture from "expo-screen-capture";
import { AppState, View, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  notificationTarget,
  register,
  notificationStatus,
} from "../src/notifications";
import { Stack, Redirect, useSegments, router } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { OpenSans_400Regular } from "@expo-google-fonts/open-sans/400Regular";
import { OpenSans_600SemiBold } from "@expo-google-fonts/open-sans/600SemiBold";
import { authClient } from "../src/auth";
import { event } from "../src/events";
import { shares } from "../src/shares";
import { clearPendingRun } from "../src/pending-run";
import { ThemeProvider, useTheme, Loading } from "../src/ui";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: false },
    mutations: { retry: false },
  },
});
function Layout() {
  const { colors } = useTheme();
  const session = authClient.useSession();
  const segments = useSegments();
  const owner = session.data?.user.id;
  const previous = useRef(owner);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    if (previous.current !== owner) {
      queryClient.clear();
      if (previous.current) void clearPendingRun();
      previous.current = owner;
    }
  }, [owner]);
  useEffect(() => {
    if (session.isPending) return;
    void shares.setOwner(owner ?? null).catch(() => {});
  }, [owner, session.isPending]);
  useEffect(() => {
    if (!owner) return;
    event("mobile_app_opened");
    let active = true;
    const route = (response: Notifications.NotificationResponse) => {
      const target = notificationTarget(
        response.notification.request.content.data,
      );
      if (target.success) {
        Notifications.clearLastNotificationResponse();
        router.push({
          pathname: "/inbox/[id]",
          params: { id: target.data.followupId },
        });
      }
    };
    const received =
      Notifications.addNotificationResponseReceivedListener(route);
    const last = Notifications.getLastNotificationResponse();
    if (last) route(last);
    const tokens = Notifications.addPushTokenListener(() => {
      void notificationStatus()
        .then((status) => {
          if (
            active &&
            status.enabled &&
            process.env.EXPO_PUBLIC_EAS_PROJECT_ID
          )
            return Notifications.getExpoPushTokenAsync({
              projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
            }).then((t) => (active ? register(t.data) : undefined));
        })
        .catch(() => {});
    });
    return () => {
      active = false;
      received.remove();
      tokens.remove();
    };
  }, [owner]);
  const [loaded, error] = useFonts({
    OpenSans_400Regular,
    OpenSans_600SemiBold,
  });
  useEffect(() => {
    if (Platform.OS === "ios")
      void ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
      setForeground(state === "active");
    });
    return () => {
      subscription.remove();
      if (Platform.OS === "ios")
        void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, []);
  if (!loaded && !error)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  if (session.isPending) return <Loading />;
  if (!owner && segments[0] !== "sign-in") return <Redirect href="/sign-in" />;
  return (
    <View style={{ flex: 1 }}>
      <Stack
        key={owner ?? "signed-out"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="share" options={{ presentation: "modal" }} />
        <Stack.Screen name="document/[id]" />
        <Stack.Screen name="state/[id]" />
        <Stack.Screen name="inbox/[id]" />
      </Stack>
      {!foreground ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.bg,
          }}
        />
      ) : null}
    </View>
  );
}
export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Layout />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
