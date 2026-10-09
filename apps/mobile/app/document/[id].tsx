import { event as record } from "../../src/events";
import { useEffect, useState } from "react";
import { Alert, Image } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { usePreventScreenCapture } from "expo-screen-capture";
import { api, authClient } from "../../src/auth";
import { Screen, Label, Card, Button, Failure, Loading } from "../../src/ui";
export default function Document() {
  usePreventScreenCapture();
  const { id } = useLocalSearchParams<{ id: string }>(),
    owner = authClient.useSession().data?.user.id,
    cache = useQueryClient(),
    [uri, setUri] = useState(""),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: [owner, "document", id],
    queryFn: () => api.document(id),
    enabled: !!owner,
  });
  useEffect(() => {
    if (!owner || !q.data?.mime) return;
    const controller = new AbortController();
    let file: File | undefined;
    void api
      .original(id, controller.signal)
      .then(async (r) => {
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (controller.signal.aborted) return;
        file = new File(
          Paths.cache,
          `sahaay-${id}.${q.data?.mime === "image/png" ? "png" : q.data?.mime === "image/webp" ? "webp" : "jpg"}`,
        );
        file.create({ overwrite: true });
        file.write(bytes);
        setUri(file.uri);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not retrieve the original.");
      });
    return () => {
      controller.abort();
      if (file?.exists) file.delete();
    };
  }, [id, owner, q.data?.mime]);
  useEffect(() => {
    if (owner) record("mobile_artifact_opened");
  }, [owner, id]);
  return (
    <Screen title={q.data?.title ?? "Document"}>
      <Button title="Back" secondary onPress={() => router.back()} />
      {error ? <Label>{error}</Label> : null}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Failure error={q.error} />
      ) : (
        <>
          {uri.includes(`sahaay-${id}.`) ? (
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={{ height: 340, width: "100%" }}
            />
          ) : null}
          <Label muted>
            {q.data.category.replaceAll("_", " ")} · Added{" "}
            {new Date(q.data.createdAt).toLocaleDateString()}
          </Label>
          <Card>
            <Label>{q.data.description}</Label>
            {q.data.metadata.map((m) => (
              <Label key={m.key}>
                {m.key}: {m.value}
              </Label>
            ))}
          </Card>
          <Button
            title="Share original image"
            disabled={!uri.includes(`sahaay-${id}.`)}
            onPress={() => {
              void Sharing.shareAsync(uri, {
                mimeType: q.data.mime,
                dialogTitle: q.data.title,
              }).catch(() => setError("Could not share the image."));
            }}
          />
          <Button
            secondary
            title="Delete Document"
            onPress={() =>
              Alert.alert(
                "Delete this Document?",
                "The stored original and extracted information will be removed.",
                [
                  { text: "Keep it", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      void api
                        .deleteDocument(id, q.data.version)
                        .then(async () => {
                          await cache.invalidateQueries({ queryKey: [owner] });
                          cache.removeQueries({
                            queryKey: [owner, "document", id],
                          });
                          router.back();
                        })
                        .catch((e) =>
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to delete.",
                          ),
                        );
                    },
                  },
                ],
              )
            }
          />
        </>
      )}
    </Screen>
  );
}
