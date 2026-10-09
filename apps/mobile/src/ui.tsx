import { createContext, useContext, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
} from "react-native";
import { useNetworkState } from "expo-network";
import { SafeAreaView } from "react-native-safe-area-context";
const light = {
  bg: "#faf9f6",
  card: "#ffffff",
  text: "#27332e",
  muted: "#6a776d",
  line: "#dce2d9",
  accent: "#355e4c",
  onAccent: "#ffffff",
};
const dark = {
  bg: "#141e19",
  card: "#202e25",
  text: "#e6ede7",
  muted: "#a8b7ac",
  line: "#35493c",
  accent: "#a4d0b3",
  onAccent: "#13251b",
};
const ThemeContext = createContext({
  mode: "system" as "system" | "light" | "dark",
  setMode: (() => {}) as (mode: "system" | "light" | "dark") => void,
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"system" | "light" | "dark">("system");
  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext),
    system = useColorScheme();
  const isDark = (context.mode === "system" ? system : context.mode) === "dark";
  return { ...context, colors: isDark ? dark : light, isDark };
}
export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  titleIcon,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  scroll?: boolean;
  titleIcon?: ReactNode;
}) {
  const { colors } = useTheme();
  const network = useNetworkState();
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {titleIcon}
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {subtitle}
        </Text>
      ) : null}
      {network.isInternetReachable === false ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          You’re offline. Shared drafts stay on this phone; sending needs a
          connection.
        </Text>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.screen}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{content}</View>
      )}
    </SafeAreaView>
  );
}
export function Label({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: muted ? colors.muted : colors.text,
        fontSize: 16,
        lineHeight: 24,
        fontFamily: "OpenSans_400Regular",
      }}
    >
      {children}
    </Text>
  );
}
export function Card({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      {children}
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: secondary ? colors.card : colors.accent,
          borderColor: colors.line,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.text : colors.onAccent,
          fontFamily: "OpenSans_600SemiBold",
          fontSize: 15,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Input(props: TextInputProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.line,
          backgroundColor: colors.card,
        },
        props.style,
      ]}
    />
  );
}
export function Loading() {
  const { colors } = useTheme();
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      color={colors.accent}
      style={{ margin: 24 }}
    />
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Card>
      <Label>
        {error instanceof Error
          ? error.message
          : "Could not load this. Please try again."}
      </Label>
      {retry ? <Button title="Try again" onPress={retry} secondary /> : null}
    </Card>
  );
}
export const styles = StyleSheet.create({
  screen: { padding: 22, gap: 16, paddingBottom: 32 },
  title: {
    fontFamily: "OpenSans_600SemiBold",
    fontSize: 30,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: "OpenSans_400Regular",
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 8,
  },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    justifyContent: "center",
  },
  input: {
    fontFamily: "OpenSans_400Regular",
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
  },
});
