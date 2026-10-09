import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, authClient } from "../../src/auth";
import { Screen, Card, Label, Button, Loading, Failure } from "../../src/ui";
export default function Inbox() {
  const owner = authClient.useSession().data?.user.id;
  const q = useQuery({
    queryKey: [owner, "inbox"],
    queryFn: () => api.inbox(),
    enabled: !!owner,
  });
  return (
    <Screen title="Inbox" subtitle="Things you asked Sahaay to bring back.">
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Failure error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          {(["ready", "scheduled", "closed"] as const).map((group) => (
            <Card key={group}>
              <Label>
                {group === "ready"
                  ? "Today"
                  : group === "scheduled"
                    ? "Upcoming"
                    : "Closed"}
              </Label>
              {q.data.recent
                .filter((f) =>
                  group === "closed"
                    ? !["ready", "scheduled"].includes(f.status)
                    : f.status === group,
                )
                .map((f) => (
                  <Card
                    key={f.id}
                    onPress={() =>
                      router.push({
                        pathname: "/inbox/[id]",
                        params: { id: f.id },
                      })
                    }
                  >
                    <Label>{f.reason}</Label>
                    <Label muted>
                      {new Date(f.scheduledFor).toLocaleString(undefined, {
                        timeZone: f.timezone,
                      })}{" "}
                      · {f.timezone}
                    </Label>
                    <Label muted>{f.status}</Label>
                  </Card>
                ))}
            </Card>
          ))}
          <Button
            secondary
            title="Ask for a reminder"
            onPress={() => router.push("/(tabs)/chat")}
          />
        </>
      )}
    </Screen>
  );
}
