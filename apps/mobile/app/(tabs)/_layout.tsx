import { Tabs, Redirect } from "expo-router";
import { House, MessageCircle, Bookmark, Inbox } from "lucide-react-native";
import { authClient } from "../../src/auth";
import { Loading, useTheme } from "../../src/ui";
export default function TabLayout() {
  const { data: session, isPending, error } = authClient.useSession();
  const { colors } = useTheme();
  if (isPending) return <Loading />;
  if (!session || error) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontFamily: "OpenSans_600SemiBold", fontSize: 11 },
      }}
    >
      {(["index", "chat", "saved", "inbox"] as const).map((name, index) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: ["Home", "Chat", "Saved", "Inbox"][index],
            tabBarIcon: ({ color }) => {
              const Icon =
                [House, MessageCircle, Bookmark, Inbox][index] ?? House;
              return <Icon color={color} size={24} strokeWidth={1.8} />;
            },
          }}
        />
      ))}
    </Tabs>
  );
}
