"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Plus, Square, X, LoaderCircle } from "lucide-react";
import type { Attachment } from "../media/attachments";
export function useMedia(onError: (error: string) => void) {
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [permission, setPermission] = useState(false);
  const alive = useRef(true);
  const uploadingRef = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(new WeakSet<MediaRecorder>());
  const starting = useRef(false);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    alive.current = true;
    const cancelledRecorders = cancelled.current;
    return () => {
      alive.current = false;
      if (recorder.current) cancelledRecorders.add(recorder.current);
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      microphone.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function upload(files: File[]) {
    if (uploadingRef.current) return;
    if (files.length + pendingRef.current.length > 4) {
      onError("Send up to 3 images and 1 voice clip at a time.");
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("Files must be smaller than 8 MB.");
        const response = await fetch("/api/attachments", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Couldn’t upload this file.");
        const attachment = result as Attachment;
        if (!alive.current) {
          void fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
          continue;
        }
        if (
          (attachment.kind === "audio" &&
            pendingRef.current.some((a) => a.kind === "audio")) ||
          (attachment.kind === "image" &&
            pendingRef.current.filter((a) => a.kind === "image").length >= 3)
        ) {
          void fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
          throw new Error("Send up to 3 images and 1 voice clip at a time.");
        }
        pendingRef.current = [...pendingRef.current, attachment];
        setPending(pendingRef.current);
      }
    } catch (error) {
      if (alive.current)
        onError(error instanceof Error ? error.message : "Couldn’t upload.");
    } finally {
      uploadingRef.current = false;
      if (alive.current) setUploading(false);
    }
  }
  function stop(cancel = false) {
    if (cancel && recorder.current) cancelled.current.add(recorder.current);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    microphone.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }
  async function start() {
    if (starting.current || recorder.current?.state === "recording") return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError(
        "Recording isn’t available here. Upload an audio file with + instead.",
      );
      return;
    }
    starting.current = true;
    setPermission(true);
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      microphone.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      let bytes = 0;
      instance.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
          if (bytes > 8 * 1024 * 1024) {
            stop(true);
            onError("This recording is too large. Try a shorter clip.");
          }
        }
      };
      instance.onerror = () => {
        stop(true);
        onError("Recording failed. Upload an audio file or try again.");
      };
      instance.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recorder.current === instance) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          if (alive.current) setRecording(false);
        }
        if (alive.current) {
          if (!cancelled.current.has(instance) && chunks.length) {
            const blob = new Blob(chunks, { type: instance.mimeType });
            void upload([
              new File([blob], "voice-recording.webm", { type: blob.type }),
            ]);
          }
        }
      };
      setSeconds(0);
      setRecording(true);
      instance.start(200);
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 28) stop();
      }, 250);
    } catch {
      microphone.current?.getTracks().forEach((t) => t.stop());
      onError(
        "Microphone access was denied or unavailable. You can upload audio with +.",
      );
    } finally {
      starting.current = false;
      if (alive.current) setPermission(false);
    }
  }
  function remove(id: string) {
    setPending((current) => current.filter((a) => a.id !== id));
    pendingRef.current = pendingRef.current.filter((a) => a.id !== id);
    void fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => {});
  }
  function clear(deleteFiles = false) {
    if (deleteFiles)
      for (const file of pendingRef.current)
        void fetch(`/api/attachments/${file.id}`, { method: "DELETE" }).catch(
          () => {},
        );
    setPending([]);
    pendingRef.current = [];
  }
  return {
    pending,
    uploading,
    recording,
    seconds,
    permission,
    upload,
    start,
    stop,
    remove,
    clear,
  };
}
export function MediaControls({
  media,
  disabled,
}: {
  media: ReturnType<typeof useMedia>;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,.m4a,.mp3,.wav,.ogg,.webm"
        aria-label="Upload images or audio"
        onChange={(event) => {
          void media.upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="media-controls">
        <button
          type="button"
          aria-label="Add image or audio"
          title="PNG/JPEG/WebP or audio up to 30 seconds · 8 MB"
          disabled={
            disabled || media.uploading || media.recording || media.permission
          }
          onClick={() => input.current?.click()}
        >
          <Plus size={18} />
        </button>
        {media.recording ? (
          <>
            <span className="recording-status" role="status">
              <i />
              Recording {media.seconds}s
            </span>
            <button
              type="button"
              aria-label="Stop recording"
              onClick={() => media.stop()}
            >
              <Square size={15} />
            </button>
            <button
              type="button"
              aria-label="Cancel recording"
              onClick={() => media.stop(true)}
            >
              <X size={15} />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Record voice"
            title="Record a voice note (up to 30 seconds)"
            disabled={
              disabled ||
              media.uploading ||
              media.permission ||
              media.pending.some((a) => a.kind === "audio")
            }
            onClick={() => void media.start()}
          >
            <Mic size={17} />
          </button>
        )}
        {media.uploading && (
          <span className="upload-status" role="status">
            <LoaderCircle size={13} />
            Preparing upload…
          </span>
        )}
        {media.permission && (
          <span className="upload-status" role="status">
            Waiting for microphone…
          </span>
        )}
      </div>
    </>
  );
}
export function AttachmentPreview({
  attachment,
  remove,
}: {
  attachment: Attachment;
  remove?: () => void;
}) {
  return (
    <div className={`attachment ${attachment.kind}`}>
      {attachment.kind === "image" ? (
        attachment.available !== false ? (
          <img
            src={`/api/attachments/${attachment.id}`}
            alt={attachment.filename || "Uploaded image"}
            width={attachment.width ?? 160}
            height={attachment.height ?? 120}
          />
        ) : (
          <span className="expired-media">
            Image expired · upload again to inspect it
          </span>
        )
      ) : (
        <div className="voice-preview">
          <span>
            <Mic size={13} />
            {attachment.filename} · {Math.round(attachment.duration ?? 0)}s
          </span>
          {attachment.available !== false ? (
            <audio
              controls
              preload="none"
              src={`/api/attachments/${attachment.id}`}
            />
          ) : (
            <small>Audio expired</small>
          )}
          {attachment.transcript && (
            <details>
              <summary>
                Transcript
                {attachment.metadata?.detectedLanguage
                  ? ` · ${attachment.metadata.detectedLanguage}`
                  : ""}
              </summary>
              <p>{attachment.transcript}</p>
            </details>
          )}
        </div>
      )}
      {remove && (
        <button
          type="button"
          className="remove-attachment"
          aria-label={`Remove ${attachment.filename}`}
          onClick={remove}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
