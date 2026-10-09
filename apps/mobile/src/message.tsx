import { useMemo, type ReactNode } from "react";
import { Text, View, Linking } from "react-native";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { RootContent, PhrasingContent } from "mdast";
import { useTheme } from "./ui";
// CommonMark/GFM parsing is shared with the web ecosystem. Rendering is native,
// never HTML/WebView; untrusted images and URL schemes are not executed.
export function MessageContent({ text }: { text: string }) {
  const { colors } = useTheme();
  const tree = useMemo(
    () =>
      fromMarkdown(text.slice(0, 32000), {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
      }),
    [text],
  );
  const base = {
    fontFamily: "OpenSans_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  };
  function inline(nodes: PhrasingContent[], depth = 0): ReactNode {
    if (depth > 24) return null;
    return nodes.map((n, i) => {
      if (n.type === "text") return n.value;
      if (n.type === "break") return "\n";
      if (n.type === "inlineCode")
        return (
          <Text
            key={i}
            style={{ fontFamily: "monospace", backgroundColor: colors.bg }}
          >
            {n.value}
          </Text>
        );
      if (n.type === "image") return n.alt ?? "[image]";
      if (n.type === "html") return n.value;
      if (n.type === "link")
        return (
          <Text
            key={i}
            accessibilityRole="link"
            style={{ color: colors.accent, textDecorationLine: "underline" }}
            onPress={() => {
              if (/^https?:\/\//i.test(n.url))
                void Linking.openURL(n.url).catch(() => {});
            }}
          >
            {inline(n.children, depth + 1)}
          </Text>
        );
      if ("children" in n)
        return (
          <Text
            key={i}
            style={
              n.type === "strong"
                ? { fontFamily: "OpenSans_600SemiBold" }
                : n.type === "emphasis"
                  ? { fontStyle: "italic" }
                  : n.type === "delete"
                    ? { textDecorationLine: "line-through" }
                    : undefined
            }
          >
            {inline(n.children, depth + 1)}
          </Text>
        );
      return null;
    });
  }
  function block(n: RootContent, i: number, depth = 0): ReactNode {
    if (depth > 24) return null;
    if (n.type === "paragraph" || n.type === "heading")
      return (
        <Text
          key={i}
          selectable
          style={[
            base,
            n.type === "heading"
              ? { fontFamily: "OpenSans_600SemiBold", fontSize: 20 }
              : {},
          ]}
        >
          {inline(n.children)}
        </Text>
      );
    if (n.type === "code")
      return (
        <Text
          key={i}
          selectable
          style={[
            base,
            {
              fontFamily: "monospace",
              backgroundColor: colors.bg,
              padding: 10,
            },
          ]}
        >
          {n.value}
        </Text>
      );
    if (n.type === "html")
      return (
        <Text key={i} selectable style={base}>
          {n.value}
        </Text>
      );
    if (n.type === "thematicBreak")
      return (
        <View
          key={i}
          style={{ borderBottomWidth: 1, borderColor: colors.line }}
        />
      );
    if (n.type === "list")
      return (
        <View key={i} style={{ gap: 8 }}>
          {n.children.map((item, j) => (
            <View key={j} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={base}>
                {item.checked != null
                  ? item.checked
                    ? "☑"
                    : "☐"
                  : n.ordered
                    ? `${(n.start ?? 1) + j}.`
                    : "•"}
              </Text>
              <View style={{ flex: 1, gap: 6 }}>
                {item.children.map((child, k) => block(child, k, depth + 1))}
              </View>
            </View>
          ))}
        </View>
      );
    if (n.type === "blockquote")
      return (
        <View
          key={i}
          style={{
            borderLeftWidth: 3,
            borderColor: colors.line,
            paddingLeft: 12,
            gap: 8,
          }}
        >
          {n.children.map((child, j) => block(child, j, depth + 1))}
        </View>
      );
    // Tables become labelled vertical rows so comparisons fit a phone without pipes.
    if (n.type === "table")
      return (
        <View key={i} style={{ gap: 12 }}>
          {n.children.slice(1).map((row, j) => (
            <View
              key={j}
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 10,
                padding: 12,
                gap: 6,
              }}
            >
              {row.children.map((cell, k) => (
                <Text key={k} selectable style={base}>
                  <Text style={{ fontFamily: "OpenSans_600SemiBold" }}>
                    {inline(n.children[0]?.children[k]?.children ?? [])}:{" "}
                  </Text>
                  {inline(cell.children)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    return null;
  }
  return (
    <View style={{ gap: 12 }}>{tree.children.map((n, i) => block(n, i))}</View>
  );
}
