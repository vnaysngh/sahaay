import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, authClient, baseURL } from "../src/auth";
import { Screen, Card, Label, Button, useTheme } from "../src/ui";
import type { Capability } from "@sahaay/api-client";
import {
  actionDetails,
  actionTitle,
  actionStatus,
  googlePermissions,
} from "@sahaay/api-client";
import {
  beginGoogleAuthorization,
  captureGoogleCompletion,
  completeGoogleAuthorization,
} from "../src/google-authorization";
const allPermissions = googlePermissions.map(
  (permission) => permission.capability,
);
export default function ConnectedAccounts() {
  const { colors } = useTheme();
  const owner = authClient.useSession().data?.user.id;
  const cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const connections = useQuery({
    queryKey: [owner, "google-connections"],
    queryFn: () => api.googleConnections(),
    enabled: !!owner,
  });
  const actions = useQuery({
    queryKey: [owner, "action-approvals"],
    queryFn: () => api.approvals(),
    enabled: !!owner,
  });
  async function perform(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this request.",
      );
    } finally {
      await cache.invalidateQueries({
        queryKey: [owner, "google-connections"],
      });
      await cache.invalidateQueries({ queryKey: [owner, "action-approvals"] });
      setBusy(false);
    }
  }
  function connect(capabilities: Capability[], connectionId?: string) {
    void perform(async () => {
      // Google returns to the backend HTTPS callback. No Google tokens enter this
      // browser result or app; foreground/refetch gets authoritative server state.
      const origin = new URL(baseURL);
      if (
        origin.protocol !== "https:" ||
        origin.hostname !== process.env.EXPO_PUBLIC_GOOGLE_LINK_HOST
      )
        throw new Error(
          "Configure and rebuild this app with the verified HTTPS connection hostname first.",
        );
      const { url, transactionId } = await api.authorizeGoogle({
        platform: "mobile",
        capabilities,
        connectionId,
      });
      if (!owner) throw new Error("Sign in before connecting Google.");
      await beginGoogleAuthorization(owner, transactionId);
      if (
        Platform.OS === "ios" &&
        Number.parseFloat(String(Platform.Version)) < 17.4
      ) {
        // Earlier iOS versions cannot use an HTTPS ASWebAuthenticationSession callback.
        await WebBrowser.openBrowserAsync(url);
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          origin.origin + "/connect/google/complete",
        );
        if (result.type === "success") {
          await captureGoogleCompletion(result.url);
          await completeGoogleAuthorization(owner);
        }
      }
    });
  }
  return (
    <Screen
      title="Connected Accounts"
      subtitle="Google access is separate from your Sahaay sign-in."
    >
      <Label muted>
        Relevant email and event content is sent to our AI provider when you ask
        Sahaay to read or summarize it. We do not import your mailbox or
        automatically save it as memory.
      </Label>
      {(error || connections.error || actions.error) && (
        <Label>
          {error || connections.error?.message || actions.error?.message}
        </Label>
      )}
      {connections.isPending && <Label>Loading accounts…</Label>}
      {connections.data && !connections.data.configured && (
        <Label>Google connections aren’t configured yet.</Label>
      )}
      {connections.data && !connections.data.mobileLinksConfigured && (
        <Label>
          Mobile connection setup needs verified app links. Connect on Web for
          now; the shared account appears here.
        </Label>
      )}
      <Card>
        <Label>
          {connections.data?.connections.length
            ? "Add another Google account"
            : "Connect Google account"}
        </Label>
        <Label muted>
          Choose which Gmail and Calendar permissions to allow on Google’s
          consent screen. You can decline access you do not need.
        </Label>
        <Button
          title="Continue to Google"
          disabled={
            busy ||
            !connections.data?.configured ||
            !connections.data.mobileLinksConfigured
          }
          onPress={() => connect(allPermissions)}
        />
      </Card>
      {connections.data?.connections.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              accessible={false}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Label>{Array.from(c.displayName.trim())[0] ?? "G"}</Label>
            </View>
            <Label>{c.displayName}</Label>
          </View>
          <Label>{c.email}</Label>
          {(["gmail_read", "calendar_read"] as Capability[]).map((cap) => (
            <Label key={cap}>
              {cap === "gmail_read" ? "Gmail" : "Google Calendar"}:{" "}
              {c.status === "connected" && c.capabilities.includes(cap)
                ? "Connected · Read access"
                : "Not connected"}
            </Label>
          ))}
          <Label muted>
            Last successful use:{" "}
            {c.lastSuccessfulUseAt
              ? new Date(c.lastSuccessfulUseAt).toLocaleString()
              : "Not used yet"}
            . Google access is checked when used.
          </Label>
          <Label>Access you have granted</Label>
          {googlePermissions.map(({ capability, title }) => (
            <Label key={capability} muted>
              {title}:{" "}
              {c.capabilities.includes(capability) ? "Granted" : "Not granted"}
            </Label>
          ))}
          {c.status === "connected" && (
            <>
              <Button
                secondary
                title="Review permissions in Google"
                disabled={busy || !connections.data?.mobileLinksConfigured}
                onPress={() => connect(allPermissions, c.id)}
              />
              <Label muted>
                Choose access in Google. To remove previously granted access
                completely, disconnect and connect again.
              </Label>
            </>
          )}
          {c.status !== "connected" && (
            <Button
              secondary
              disabled={busy || !connections.data?.mobileLinksConfigured}
              title="Reconnect Google account"
              onPress={() => connect(allPermissions, c.id)}
            />
          )}
          {c.status !== "disconnected" && (
            <Button
              secondary
              disabled={busy}
              title="Disconnect"
              onPress={() =>
                Alert.alert(
                  "Disconnect Google?",
                  `Remove Sahaay’s access to ${c.email}? Existing Google drafts/events remain.`,
                  [
                    { text: "Keep connected", style: "cancel" },
                    {
                      text: "Disconnect",
                      style: "destructive",
                      onPress: () =>
                        void perform(async () => {
                          const result = await api.disconnectGoogle(c.id);
                          if (!result.revocationConfirmed)
                            Alert.alert(
                              "Disconnected from Sahaay",
                              "Sahaay deleted its Google credentials. Google revocation could not be confirmed; remove Sahaay in your Google account’s third-party access settings too.",
                            );
                        }),
                    },
                  ],
                )
              }
            />
          )}
        </Card>
      ))}
      <Label>Review actions</Label>
      <Label muted>
        Confirm the final account, recipients or event details. Invitations will
        notify attendees. Approvals expire after ten minutes.
      </Label>
      {actions.data?.map((a) => (
        <Card key={a.id}>
          <Label>{actionTitle(a.proposal.kind)}</Label>
          <Label>Account: {a.accountEmail}</Label>
          <Label muted>{actionStatus(a.status)}</Label>
          {actionDetails(a.proposal, a.preview).map(([label, value]) => (
            <Label key={label}>
              {label}: {value}
            </Label>
          ))}
          {a.status === "succeeded" && (
            <Label>{actionTitle(a.proposal.kind)} completed in Google.</Label>
          )}
          {a.status === "pending" && (
            <>
              <Button
                disabled={busy}
                title="Approve this exact action"
                onPress={() =>
                  void perform(() => api.approveAction(a.id, "approve"))
                }
              />
              <Button
                disabled={busy}
                secondary
                title="Cancel"
                onPress={() =>
                  void perform(() => api.approveAction(a.id, "cancel"))
                }
              />
            </>
          )}
          {a.status === "unknown" && (
            <Label>
              Check Google directly. This action will not be retried
              automatically.
            </Label>
          )}
        </Card>
      ))}
      <Button
        secondary
        disabled={busy}
        title="Refresh status"
        onPress={() =>
          void perform(async () => {
            await connections.refetch();
            await actions.refetch();
          })
        }
      />
    </Screen>
  );
}
