import { useEffect, useRef, useState } from "react";
import { Alert, Image } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, Card, Label, Input, Button } from "../src/ui";
import { api, authClient } from "../src/auth";
import { event as record } from "../src/events";
import { shares, type ShareDraft } from "../src/shares";
import { uploadMedia } from "../src/media";
import { keepPendingRun } from "../src/pending-run";
export default function Share() {
  const session = authClient.useSession().data;
  const owner = session?.user.id,
    cache = useQueryClient(),
    [drafts, setDrafts] = useState<ShareDraft[]>([]),
    [instruction, setInstruction] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState("");
  const draft = drafts[0];
  const request = useRef<AbortController | null>(null);
  const visibleDraft = useRef("");
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const refresh = () => {
      void shares
        .list(owner)
        .then((items) => {
          if (!active) return;
          items.forEach((d) => record("mobile_share_received", d.id));
          setDrafts(items);
          if (visibleDraft.current !== (items[0]?.id ?? "")) {
            visibleDraft.current = items[0]?.id ?? "";
            setInstruction(items[0]?.instruction ?? "");
          }
          setSubmitted(items[0]?.conversationId ?? "");
        })
        .catch(() => {
          if (active) setError("Could not load pending shares.");
        });
    };
    refresh();
    const listener = shares.listen(refresh);
    return () => {
      active = false;
      listener.remove();
    };
  }, [owner]);
  async function send() {
    if (!owner || !draft || busy || submitted) return;
    const controller = new AbortController();
    request.current = controller;
    const checkActive = () => {
      if (controller.signal.aborted)
        throw new Error(
          "Submission paused. Check the conversation before sending again.",
        );
    };
    setBusy(true);
    setError("");
    try {
      await shares.claim(draft.id, owner);
      checkActive();
      const conversation = await api.createConversation();
      checkActive();
      const attachments = [];
      for (const f of draft.files)
        attachments.push(
          (
            await uploadMedia(
              {
                uri: f.uri,
                filename: f.filename,
                kind: "image",
              },
              controller.signal,
            )
          ).id,
        );
      checkActive();
      const text = [draft.text, instruction].filter(Boolean).join("\n\n");
      if (text.length > 4000)
        throw new Error("Shorten the instruction or shared text.");
      await shares.markSubmitted(draft.id, owner, conversation.id);
      checkActive();
      await keepPendingRun(owner, conversation.id, draft.id);
      checkActive();
      setSubmitted(conversation.id);
      for await (const event of api.chat(
        {
          conversationId: conversation.id,
          requestId: draft.id,
          text,
          attachmentIds: attachments,
        },
        controller.signal,
      )) {
        if (event.type === "error") throw new Error(event.message);
      }
      checkActive();
      record("mobile_share_completed", draft.id);
      await shares.remove(draft.id, owner);
      await cache.invalidateQueries({ queryKey: [owner] });
      router.replace({
        pathname: "/(tabs)/chat",
        params: { conversationId: conversation.id },
      });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Unable to submit. Check conversation history before retrying.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Screen
      title="Share to Sahaay"
      subtitle="Review what you’re sending. Nothing is permanently saved unless you ask."
    >
      {error ? <Label>{error}</Label> : null}
      {submitted ? (
        <Button
          title="Check the submitted conversation"
          onPress={() =>
            router.replace({
              pathname: "/(tabs)/chat",
              params: { conversationId: submitted },
            })
          }
        />
      ) : null}
      {draft ? (
        <>
          <Card>
            <Label>{draft.text}</Label>
            {draft.files.map((f) => (
              <Image
                key={f.uri}
                source={{ uri: f.uri }}
                style={{ height: 180, width: "100%" }}
                resizeMode="contain"
              />
            ))}
            <Label muted>{drafts.length} pending share(s)</Label>
          </Card>
          <Input
            multiline
            placeholder="What should Sahaay do with this?"
            value={instruction}
            onChangeText={setInstruction}
            maxLength={4000}
          />
          <Button
            title={busy ? "Sending…" : "Send to Sahaay"}
            disabled={busy || !!submitted}
            onPress={() =>
              Alert.alert(
                "Send to this account?",
                `This share will be sent as ${session?.user.name ?? "your signed-in account"}.`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Send", onPress: () => void send() },
                ],
              )
            }
          />
          <Button
            secondary
            title="Discard this share"
            disabled={busy}
            onPress={() => {
              if (owner)
                void shares
                  .remove(draft.id, owner)
                  .then(() => shares.list(owner))
                  .then((items) => {
                    setDrafts(items);
                    setInstruction(items[0]?.instruction ?? "");
                    setSubmitted(items[0]?.conversationId ?? "");
                  });
            }}
          />
        </>
      ) : (
        <Label muted>
          No pending shares. Share text, a link or an image from another app.
        </Label>
      )}
      <Button
        title="Back"
        secondary
        disabled={busy}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
