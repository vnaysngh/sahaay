import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  validateMedia,
  MAX_UPLOAD_BYTES,
} from "../../apps/web/src/media/validate";
import { mediaNormalizer } from "../../apps/web/src/core/normalize";
import { imageFixture, audioFixture } from "../fixtures";
import type { Attachment } from "../../apps/web/src/media/attachments";
import type { ConversationMessage } from "../../apps/web/src/core/contracts";
const attachment: Attachment = {
  id: crypto.randomUUID(),
  kind: "image",
  filename: "test.png",
  mime: "image/jpeg",
  bytes: 100,
  width: 20,
  height: 20,
  duration: null,
  transcript: null,
  expiresAt: new Date().toISOString(),
  metadata: null,
  available: true,
};
describe("media validation and common normalization", () => {
  it("re-encodes supported pixels without retaining original metadata", async () => {
    const normalized = await validateMedia(await imageFixture());
    expect(normalized.kind).toBe("image");
    expect(normalized.mime).toBe("image/jpeg");
    const meta = await sharp(normalized.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(240);
  });
  it("rejects documents, spoofed files, oversized uploads and pixel bombs", async () => {
    await expect(validateMedia(Buffer.from("%PDF-1.7"))).rejects.toMatchObject({
      status: 415,
    });
    await expect(
      validateMedia(Buffer.from("<svg></svg>")),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      validateMedia(Buffer.alloc(MAX_UPLOAD_BYTES + 1)),
    ).rejects.toMatchObject({ status: 413 });
    const enormous = await sharp({
      create: { width: 5000, height: 5000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(validateMedia(enormous)).rejects.toMatchObject({
      status: 415,
    });
  });
  it("decodes audio, enforces duration and removes conversion temporaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "sahaay-test-"));
    try {
      const result = await validateMedia(audioFixture(), root);
      expect(result.mime).toBe("audio/wav");
      expect(result.duration).toBeCloseTo(1, 1);
      await expect(validateMedia(audioFixture(31), root)).rejects.toMatchObject(
        { status: 413, code: "duration" },
      );
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("normalizes voice and images together while preserving captions and metadata", async () => {
    const voice = {
      ...attachment,
      id: crypto.randomUUID(),
      kind: "audio" as const,
      mime: "audio/wav",
    };
    const media = {
      get: vi.fn(async (_user: string, id: string) =>
        id === voice.id ? voice : attachment,
      ),
      read: vi.fn(async () => ({ attachment, data: Buffer.from("image") })),
      saveTranscript: vi.fn(async () => {}),
    };
    const speech = {
      transcribe: vi.fn(async () => ({
        text: "मेरा नाम काव्या है",
        metadata: {
          provider: "test",
          model: "fixture",
          detectedLanguage: "hi-IN",
          languageProbability: 0.9,
          codeSwitching: null,
        },
      })),
    };
    const context: ConversationMessage[] = [
      {
        role: "user",
        content: "Explain this",
        attachments: [
          { id: attachment.id, kind: "image" },
          { id: voice.id, kind: "audio" },
        ],
      },
    ];
    const result = await mediaNormalizer(media, speech)(
      context,
      "owner",
      AbortSignal.timeout(1000),
    );
    expect(result[0].content).toContain("Explain this");
    expect(result[0].content).toContain("मेरा नाम");
    expect(result[0].images).toHaveLength(1);
    expect(media.get).toHaveBeenCalledWith("owner", voice.id);
    expect(media.saveTranscript).toHaveBeenCalledWith(
      "owner",
      voice.id,
      expect.objectContaining({
        metadata: expect.objectContaining({ detectedLanguage: "hi-IN" }),
      }),
    );
  });
  it("reuses cached transcripts and does not pretend to see expired image pixels", async () => {
    const media = {
      get: vi.fn(async () => ({ ...attachment, available: false })),
      read: vi.fn(),
      saveTranscript: vi.fn(),
    };
    const speech = { transcribe: vi.fn() };
    const result = await mediaNormalizer(media, speech)(
      [
        {
          role: "user",
          content: "what about this?",
          attachments: [{ id: attachment.id, kind: "image" }],
        },
      ],
      "owner",
      AbortSignal.timeout(1000),
    );
    expect(result[0].content).toContain("expired");
    expect(result[0].images).toBeUndefined();
    expect(media.read).not.toHaveBeenCalled();
    media.get.mockResolvedValue({
      ...attachment,
      kind: "audio",
      transcript: "cached words",
      available: false,
    });
    const voice = await mediaNormalizer(media, speech)(
      [
        {
          role: "user",
          content: "",
          attachments: [{ id: attachment.id, kind: "audio" }],
        },
      ],
      "owner",
      AbortSignal.timeout(1000),
    );
    expect(voice[0].content).toContain("cached words");
    expect(speech.transcribe).not.toHaveBeenCalled();
  });
  it("bounds context after adding cached transcripts while keeping the newest turn", async () => {
    const media = {
      get: vi.fn(async () => ({
        ...attachment,
        kind: "audio" as const,
        transcript: "a".repeat(12_000),
        available: true,
      })),
      read: vi.fn(),
      saveTranscript: vi.fn(),
    };
    const result = await mediaNormalizer(media, { transcribe: vi.fn() })(
      [
        {
          role: "user",
          content: "older voice",
          attachments: [{ id: attachment.id, kind: "audio" }],
        },
        { role: "assistant", content: "b".repeat(5000) },
        {
          role: "user",
          content: "recent voice",
          attachments: [{ id: attachment.id, kind: "audio" }],
        },
        { role: "assistant", content: "c".repeat(4000) },
        { role: "user", content: "d".repeat(4000) },
      ],
      "owner",
      AbortSignal.timeout(1000),
    );
    expect(
      result.reduce((length, message) => length + message.content.length, 0),
    ).toBeLessThanOrEqual(24_000);
    expect(result.at(-1)?.content).toBe("d".repeat(4000));
    expect(result[0].role).toBe("user");
    expect(result.map((message) => message.content).join("\n")).not.toContain(
      "older voice",
    );
    expect(media.read).not.toHaveBeenCalled();
  });
});
