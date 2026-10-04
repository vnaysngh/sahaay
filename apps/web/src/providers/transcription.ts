import { z } from "zod";
export type Transcript = {
  text: string;
  metadata: {
    provider: string;
    model: string;
    detectedLanguage: string | null;
    languageProbability: number | null;
    codeSwitching: unknown | null;
  };
};
export interface TranscriptionProvider {
  transcribe(audio: Buffer, signal: AbortSignal): Promise<Transcript>;
}
const resultSchema = z.object({
  transcript: z.string().trim().min(1).max(12_000),
  language_code: z.string().nullable().optional(),
  language_probability: z.number().min(0).max(1).nullable().optional(),
  code_switching: z.unknown().optional(),
});
export function createTranscriptionProvider(): TranscriptionProvider {
  if (process.env.SAHAAY_E2E === "1") {
    if (process.env.NODE_ENV === "production")
      throw new Error("Test transcription cannot run in production");
    return {
      async transcribe() {
        return {
          text: "This is a test voice message. My name is Kavya.",
          metadata: {
            provider: "test",
            model: "fixture",
            detectedLanguage: "en-IN",
            languageProbability: null,
            codeSwitching: null,
          },
        };
      },
    };
  }
  return {
    async transcribe(audio, signal) {
      const key = process.env.SARVAM_API_KEY;
      if (!key) throw new Error("Transcription is not configured");
      const body = new FormData();
      body.set(
        "file",
        new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
        "voice.wav",
      );
      body.set("model", "saaras:v4");
      body.set("mode", "transcribe");
      body.set("language_code", "unknown");
      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: { "api-subscription-key": key },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
      });
      if (!response.ok) throw new Error("Transcription provider unavailable");
      const result = resultSchema.parse(await response.json());
      return {
        text: result.transcript,
        metadata: {
          provider: "sarvam",
          model: "saaras:v4",
          detectedLanguage: result.language_code ?? null,
          languageProbability: result.language_probability ?? null,
          codeSwitching: result.code_switching ?? null,
        },
      };
    },
  };
}
