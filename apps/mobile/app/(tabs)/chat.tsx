import { ChatApprovals } from "../../src/chat-approvals";
import { SafeAreaView } from "react-native-safe-area-context";
import { History, Plus, X } from "lucide-react-native";
import { MessageContent } from "../../src/message";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  AppState,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Linking,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  useAudioRecorderState,
} from "expo-audio";
import type { Message } from "@sahaay/api-client";
import { event as record } from "../../src/events";
import { api, authClient } from "../../src/auth";
import { Screen, Card, Label, Input, Button, useTheme } from "../../src/ui";
import { chooseImage, uploadMedia, type DraftMedia } from "../../src/media";
import {
  keepPendingRun,
  readPendingRun,
  clearPendingRun,
} from "../../src/pending-run";
export default function Chat() {
  const owner = authClient.useSession().data?.user.id,
    cache = useQueryClient(),
    params = useLocalSearchParams<{
      prefill?: string;
      conversationId?: string;
    }>(),
    { colors } = useTheme();
  const [conversationId, setConversationId] = useState(
      params.conversationId ?? "",
    ),
    [historyOpen, setHistoryOpen] = useState(false),
    [text, setText] = useState(params.prefill ?? ""),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [stage, setStage] = useState(""),
    [busy, setBusy] = useState(false),
    [unresolved, setUnresolved] = useState(false),
    [error, setError] = useState(""),
    [media, setMedia] = useState<DraftMedia[]>([]);
  const run = useRef<AbortController | null>(null),
    generation = useRef(0),
    activeOwner = useRef(owner),
    scroll = useRef<ScrollView>(null);
  useEffect(() => {
    activeOwner.current = owner;
  }, [owner]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
      if (status.hasError)
        setError("The recording was interrupted. Please record again.");
      else if (status.isFinished && status.url)
        setMedia([{ uri: status.url, filename: "voice.m4a", kind: "audio" }]);
    }),
    recording = useAudioRecorderState(recorder);
  const conversations = useQuery({
    queryKey: [owner, "conversations"],
    queryFn: () => api.conversations(),
    enabled: !!owner,
  });
  const load = useCallback(async (id: string) => {
    const epoch = generation.current;
    if (!id) return;
    try {
      const history = await api.history(id);
      if (epoch !== generation.current) return;
      setMessages(history);
      const currentOwner = activeOwner.current;
      const pending = currentOwner ? await readPendingRun(currentOwner) : null;
      if (epoch !== generation.current) return;
      if (pending?.conversationId === id) {
        const accepted = history.find(
          (m) => m.role === "user" && m.requestId === pending.requestId,
        );
        setUnresolved(!accepted || accepted.status === "running");
        if (accepted && accepted.status !== "running") {
          setStage("");
          setText("");
          setMedia([]);
          setDraft("");
          await clearPendingRun();
        }
      } else
        setUnresolved(
          history.some((m) => m.role === "user" && m.status === "running"),
        );
    } catch (e) {
      if (epoch === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to load conversation.",
        );
    }
  }, []);
  useEffect(() => {
    return () => {
      // Invalidate pending asynchronous work on component teardown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      run.current?.abort();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (params.prefill) setText(params.prefill);
      if (params.conversationId) {
        run.current?.abort();
        generation.current++;
        setConversationId(params.conversationId);
        void load(params.conversationId);
      }
    }, [params.prefill, params.conversationId, load]),
  );
  useFocusEffect(
    useCallback(() => {
      if (!owner) return;
      let active = true;
      void readPendingRun(owner).then((p) => {
        if (!active) return;
        if (p && !conversationId) {
          setConversationId(p.conversationId);
          void load(p.conversationId);
        } else if (conversationId && !run.current) void load(conversationId);
      });
      return () => {
        active = false;
      };
    }, [owner, conversationId, load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        run.current?.abort();
        if (recording.isRecording) void recorder.stop();
      } else if (conversationId && !run.current) void load(conversationId);
    });
    return () => sub.remove();
  }, [conversationId, load, recorder, recording.isRecording]);
  async function attach(camera = false) {
    try {
      if (media.length >= 3)
        throw new Error("Send at most three images at once.");
      const chosen = await chooseImage(camera);
      if (chosen) setMedia((m) => [...m, chosen]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open photos.");
    }
  }
  async function voice() {
    try {
      if (recording.isRecording) {
        await recorder.stop();
        if (recorder.uri)
          setMedia([
            { uri: recorder.uri, filename: "voice.m4a", kind: "audio" },
          ]);
        return;
      }
      if (!(await AudioModule.requestRecordingPermissionsAsync()).granted)
        throw new Error("Microphone permission is required.");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 30 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record.");
    }
  }
  async function send() {
    if (!owner || busy || unresolved || (!text.trim() && !media.length)) return;
    const epoch = generation.current,
      currentOwner = owner,
      controller = new AbortController();
    run.current = controller;
    setBusy(true);
    setError("");
    setDraft("");
    setStage("Uploading…");
    let id = conversationId;
    try {
      if (!id) {
        id = (await api.createConversation()).id;
        if (
          controller.signal.aborted ||
          epoch !== generation.current ||
          activeOwner.current !== currentOwner
        )
          return;
        setConversationId(id);
        record("mobile_chat_started");
      }
      const requestId = Crypto.randomUUID(),
        ids = [];
      for (const item of media)
        ids.push((await uploadMedia(item, controller.signal)).id);
      if (
        controller.signal.aborted ||
        epoch !== generation.current ||
        activeOwner.current !== currentOwner
      )
        return;
      await keepPendingRun(owner, id, requestId);
      record("mobile_message_sent", requestId);
      setUnresolved(true);
      setStage("Thinking…");
      for await (const event of api.chat(
        {
          conversationId: id,
          requestId,
          text: text.trim(),
          attachmentIds: ids,
        },
        controller.signal,
      )) {
        if (
          epoch !== generation.current ||
          activeOwner.current !== currentOwner
        )
          return;
        if (event.type === "processing")
          setStage(
            {
              thinking: "Thinking…",
              understanding: "Understanding your image…",
              transcribing: "Transcribing…",
              researching: "Researching the web…",
            }[event.stage],
          );
        if (event.type === "delta") setDraft((d) => d + event.text);
        if (event.type === "error") throw new Error(event.message);
      }
      if (epoch === generation.current) {
        setText("");
        setMedia([]);
        setDraft("");
        await load(id);
        await cache.invalidateQueries({ queryKey: [owner] });
      }
    } catch (e) {
      if (epoch === generation.current)
        setError(
          controller.signal.aborted
            ? "The connection paused. Check history for the result before sending again."
            : e instanceof Error
              ? e.message
              : "Unable to send. Check history before trying again.",
        );
    } finally {
      if (run.current === controller) run.current = null;
      if (epoch === generation.current) {
        setBusy(false);
        setStage("");
      }
    }
  }
  return (
    <Screen title="Talk to Sahaay" scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, gap: 12 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversation history"
            onPress={() => setHistoryOpen(true)}
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <History size={22} strokeWidth={1.8} color={colors.text} />
            <Label>Conversations</Label>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New conversation"
            accessibilityState={{ disabled: busy || recording.isRecording }}
            disabled={busy || recording.isRecording}
            onPress={() => {
              generation.current++;
              setConversationId("");
              setMessages([]);
              setDraft("");
              setUnresolved(false);
              setText("");
              setMedia([]);
              setError("");
              setStage("");
            }}
            style={{
              minWidth: 48,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Plus size={24} strokeWidth={1.8} color={colors.text} />
          </Pressable>
        </View>
        <Modal
          visible={historyOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setHistoryOpen(false)}
        >
          <SafeAreaView
            style={{ flex: 1, padding: 20, backgroundColor: colors.bg }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Label>Conversations</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close conversation history"
                onPress={() => setHistoryOpen(false)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={24} strokeWidth={1.8} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ gap: 12, paddingVertical: 16 }}
            >
              {conversations.isPending ? (
                <Label muted>Loading conversations…</Label>
              ) : null}
              {conversations.isError ? (
                <Button
                  secondary
                  title="Retry loading conversations"
                  onPress={() => void conversations.refetch()}
                />
              ) : null}
              {conversations.data?.length === 0 ? (
                <Label muted>Your conversations will appear here.</Label>
              ) : null}
              {conversations.data?.map((c) => (
                <Button
                  key={c.id}
                  secondary={c.id !== conversationId}
                  title={c.title || "Untitled conversation"}
                  disabled={busy || recording.isRecording}
                  onPress={() => {
                    generation.current++;
                    setConversationId(c.id);
                    setMessages([]);
                    setDraft("");
                    setError("");
                    setStage("");
                    setHistoryOpen(false);
                    void load(c.id);
                  }}
                />
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          ref={scroll}
          contentContainerStyle={{ gap: 14, paddingBottom: 14 }}
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: true })
          }
        >
          <ChatApprovals
            key={conversationId}
            conversationId={conversationId}
            revision={messages.map((m) => m.id + m.status).join(",")}
            turns={messages
              .filter((m) => m.role === "assistant")
              .map((m) => m.requestId)}
          >
            {(renderAction) =>
              messages.map((m) => (
                <Card key={m.id}>
                  <Label muted>{m.role === "user" ? "You" : "Sahaay"}</Label>
                  {m.role === "assistant" && renderAction(m.requestId) ? (
                    renderAction(m.requestId)
                  ) : (
                    <MessageContent text={m.content} />
                  )}
                  {m.attachments?.map((a) => (
                    <Label muted key={a.id}>
                      {a.filename}
                      {a.available ? "" : " (expired)"}
                    </Label>
                  ))}
                  {m.artifacts?.map((a) => (
                    <Button
                      key={a.id}
                      secondary
                      title={a.title}
                      onPress={() =>
                        router.push({
                          pathname: "/document/[id]",
                          params: { id: a.id },
                        })
                      }
                    />
                  ))}
                  {m.sources?.map((s) => (
                    <Button
                      key={s.id}
                      secondary
                      title={s.title}
                      onPress={() => {
                        if (/^https?:\/\//.test(s.url))
                          void Linking.openURL(s.url);
                      }}
                    />
                  ))}
                  {m.status === "running" ? (
                    <Button
                      title="Check for the completed response"
                      secondary
                      onPress={() => void load(conversationId)}
                    />
                  ) : null}
                </Card>
              ))
            }
          </ChatApprovals>
          {draft ? (
            <Card>
              <MessageContent text={draft} />
            </Card>
          ) : null}
          {stage ? <Label muted>{stage}</Label> : null}
          {unresolved && !busy ? (
            <Card>
              <Label muted>
                This message may still be processing. Check its result before
                sending another message.
              </Label>
              <Button
                secondary
                title="Check response"
                onPress={() => void load(conversationId)}
              />
            </Card>
          ) : null}
          {error ? (
            <Card>
              <Label>{error}</Label>
              {conversationId ? (
                <Button
                  title="Check history"
                  secondary
                  onPress={() => void load(conversationId)}
                />
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
        <View
          style={{ gap: 8, paddingTop: 8, paddingBottom: 12, flexShrink: 0 }}
        >
          {media.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            >
              {media.map((m, i) => (
                <View
                  key={m.uri}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    maxWidth: 300,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.card,
                  }}
                >
                  {m.kind === "image" ? (
                    <Image
                      source={{ uri: m.uri }}
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  ) : (
                    <Label>Voice recording</Label>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      m.kind === "image"
                        ? "Remove image attachment"
                        : "Remove voice recording"
                    }
                    disabled={busy}
                    accessibilityState={{ disabled: busy }}
                    onPress={() =>
                      setMedia((ms) => ms.filter((_, j) => j !== i))
                    }
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <X color={colors.muted} size={22} strokeWidth={1.8} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <Input
            accessibilityLabel="Message"
            placeholder="Tell Sahaay what’s on your mind…"
            multiline
            maxLength={4000}
            value={text}
            onChangeText={setText}
            style={{ maxHeight: 130 }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title="+"
              secondary
              disabled={busy}
              onPress={() =>
                Alert.alert("Add to your message", "", [
                  { text: "Photo library", onPress: () => void attach() },
                  { text: "Camera", onPress: () => void attach(true) },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            />
            <Button
              title={recording.isRecording ? "Stop" : "Voice"}
              secondary
              disabled={busy}
              onPress={() => void voice()}
            />
            <View style={{ flex: 1 }}>
              <Button
                title={busy ? "Sending…" : "Send"}
                disabled={
                  busy ||
                  unresolved ||
                  recording.isRecording ||
                  (!text.trim() && !media.length)
                }
                onPress={() => void send()}
              />
            </View>
          </View>
          <View style={{ borderColor: colors.line }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
