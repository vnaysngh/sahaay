import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, authClient } from "../../src/auth";
import {
  Screen,
  Card,
  Label,
  Button,
  Input,
  Loading,
  Failure,
} from "../../src/ui";
export default function Saved() {
  const owner = authClient.useSession().data?.user.id,
    [tab, setTab] = useState<"state" | "documents">("state"),
    [page, setPage] = useState(0),
    [draft, setDraft] = useState(""),
    [search, setSearch] = useState("");
  const state = useQuery({
      queryKey: [owner, "state", page],
      queryFn: () => api.state(page),
      enabled: !!owner && tab === "state",
    }),
    docs = useQuery({
      queryKey: [owner, "documents", search],
      queryFn: () => api.documents(search),
      enabled: !!owner && tab === "documents",
    });
  return (
    <Screen title="Your space" subtitle="Plans, ideas and things you’ve kept.">
      <Button
        title={
          tab === "state" ? "View Documents" : "View plans and saved things"
        }
        secondary
        onPress={() => setTab(tab === "state" ? "documents" : "state")}
      />
      {tab === "state" ? (
        <>
          {state.isPending ? (
            <Loading />
          ) : state.error ? (
            <Failure error={state.error} retry={() => void state.refetch()} />
          ) : (
            <>
              {state.data.records.length === 0 ? (
                <Label muted>
                  Tell Sahaay about a plan or something you want to keep.
                </Label>
              ) : null}
              {state.data.records.map((r) => (
                <Card
                  key={r.id}
                  onPress={
                    r.recordRole === "object"
                      ? () =>
                          router.push({
                            pathname: "/state/[id]",
                            params: { id: r.id },
                          })
                      : undefined
                  }
                >
                  <Label>{r.content}</Label>
                  <Label muted>
                    {r.kind} · {r.stateLabel ?? r.status}
                  </Label>
                  {r.itemCount ? (
                    <Label muted>{r.itemCount} related items</Label>
                  ) : null}
                </Card>
              ))}
              {state.data.memories.length ? (
                <Card>
                  <Label>Preferences and memories</Label>
                  {state.data.memories.map((m) => (
                    <Label key={m.id} muted>
                      {m.content}
                    </Label>
                  ))}
                </Card>
              ) : null}
              <Button
                title="Ask Sahaay to find or change something"
                secondary
                onPress={() => router.push("/(tabs)/chat")}
              />
              {page > 0 ? (
                <Button
                  title="Previous"
                  secondary
                  onPress={() => setPage(page - 1)}
                />
              ) : null}
              {state.data.hasNext ? (
                <Button
                  title="More saved things"
                  secondary
                  onPress={() => setPage(page + 1)}
                />
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <Input
            placeholder="Search Documents"
            value={draft}
            onChangeText={setDraft}
            returnKeyType="search"
            onSubmitEditing={() => setSearch(draft)}
          />
          <Button secondary title="Search" onPress={() => setSearch(draft)} />
          {docs.isPending ? (
            <Loading />
          ) : docs.error ? (
            <Failure error={docs.error} retry={() => void docs.refetch()} />
          ) : docs.data.length ? (
            docs.data.map((d) => (
              <Card
                key={d.id}
                onPress={() =>
                  router.push({
                    pathname: "/document/[id]",
                    params: { id: d.id },
                  })
                }
              >
                <Label>{d.title}</Label>
                <Label muted>
                  {d.category.replaceAll("_", " ")} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString()}
                </Label>
              </Card>
            ))
          ) : (
            <Label muted>
              No Documents here yet. Send an image to Sahaay and ask it to keep
              it.
            </Label>
          )}
        </>
      )}
    </Screen>
  );
}
