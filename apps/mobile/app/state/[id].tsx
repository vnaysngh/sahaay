import { event as record } from "../../src/events";
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, authClient } from "../../src/auth";
import { Screen, Card, Label, Button, Loading, Failure } from "../../src/ui";
export default function State() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    owner = authClient.useSession().data?.user.id;
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: [owner, "state", id, page],
    queryFn: () => api.state(page, id),
    enabled: !!owner,
  });
  useEffect(() => {
    if (owner) record("mobile_saved_item_opened");
  }, [owner, id]);
  return (
    <Screen title={q.data?.parent?.content ?? "Your plan"}>
      <Button secondary title="Back" onPress={() => router.back()} />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Failure error={q.error} />
      ) : (
        <>
          <Label muted>{q.data.parent?.stateLabel}</Label>
          {q.data.records.map((r) => (
            <Card key={r.id}>
              <Label>{r.content}</Label>
              <Label muted>{r.stateLabel ?? r.status}</Label>
              {r.structuredValue
                ? Object.entries(r.structuredValue).map(([key, value]) => (
                    <Label muted key={key}>
                      {key}: {String(value)}
                    </Label>
                  ))
                : null}
            </Card>
          ))}
          {page > 0 ? (
            <Button
              secondary
              title="Previous items"
              onPress={() => setPage(page - 1)}
            />
          ) : null}
          {q.data.hasNext ? (
            <Button
              secondary
              title="More related items"
              onPress={() => setPage(page + 1)}
            />
          ) : null}
          <Button
            title="Talk about this with Sahaay"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/chat",
                params: {
                  prefill: `What do you remember about ${q.data.parent?.content}?`,
                },
              })
            }
          />
        </>
      )}
    </Screen>
  );
}
