import { event as record } from "../../src/events";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, authClient } from "../../src/auth";
import {
  Screen,
  Card,
  Label,
  Input,
  Button,
  Loading,
  Failure,
} from "../../src/ui";
export default function InboxDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    owner = authClient.useSession().data?.user.id,
    cache = useQueryClient();
  const q = useQuery({
      queryKey: [owner, "inbox"],
      queryFn: () => api.inbox(),
      enabled: !!owner,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [localTime, setLocalTime] = useState(""),
    [timezone, setTimezone] = useState("");
  const f = q.data?.recent.find((x) => x.id === id);
  async function act(action: string, confirmed = false) {
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      await api.inboxAction({
        action,
        id,
        version: f.version,
        confirmed,
        ...(action === "reschedule" ? { localTime, timezone } : {}),
      });
      if (action === "done") record("mobile_followup_completed");
      await cache.invalidateQueries({ queryKey: [owner, "inbox"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (owner) record("mobile_followup_opened");
  }, [owner, id]);
  return (
    <Screen title={f?.reason ?? "Follow-up"}>
      <Button title="Back" secondary onPress={() => router.back()} />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Failure error={q.error} />
      ) : !f ? (
        <Label>This follow-up is unavailable.</Label>
      ) : (
        <>
          <Label muted>
            {new Date(f.scheduledFor).toLocaleString(undefined, {
              timeZone: f.timezone,
            })}{" "}
            · {f.timezone}
          </Label>
          <Label muted>{f.status}</Label>
          {error ? <Label>{error}</Label> : null}
          {["ready", "scheduled"].includes(f.status) ? (
            <>
              <Button
                title="Mark done"
                disabled={busy}
                onPress={() => void act("done")}
              />
              {f.status === "ready" ? (
                <Button
                  title="Dismiss"
                  secondary
                  disabled={busy}
                  onPress={() => void act("dismiss")}
                />
              ) : null}
              <Card>
                <Label>Reschedule</Label>
                <Input
                  placeholder="2026-10-15T12:00"
                  value={localTime}
                  onChangeText={setLocalTime}
                />
                <Input
                  placeholder={f.timezone}
                  value={timezone}
                  onChangeText={setTimezone}
                />
                <Button
                  title="Confirm new time"
                  disabled={busy || !localTime || !timezone}
                  onPress={() => void act("reschedule")}
                />
              </Card>
              <Button
                title="Cancel reminder"
                secondary
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Cancel this reminder?",
                    "It will stop future delivery.",
                    [
                      { text: "Keep it", style: "cancel" },
                      {
                        text: "Cancel reminder",
                        style: "destructive",
                        onPress: () => void act("cancel", true),
                      },
                    ],
                  )
                }
              />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
