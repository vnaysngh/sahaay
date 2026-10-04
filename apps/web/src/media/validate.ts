import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RequestError } from "../core/validation";
const exec = promisify(execFile);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 30;
export type ValidatedMedia = {
  kind: "image" | "audio";
  mime: string;
  data: Buffer;
  width?: number;
  height?: number;
  duration?: number;
};
function invalid(
  message = "Use a PNG, JPEG or WebP image, or a short audio recording.",
) {
  return new RequestError(415, "unsupported_media", message);
}
export function detectMedia(
  data: Buffer,
): { kind: "image" | "audio"; format: string } | null {
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { kind: "image", format: "png" };
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return { kind: "image", format: "jpeg" };
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return { kind: "image", format: "webp" };
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WAVE"
  )
    return { kind: "audio", format: "wav" };
  if (data.toString("ascii", 0, 4) === "OggS")
    return { kind: "audio", format: "ogg" };
  if (data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return { kind: "audio", format: "matroska" };
  if (data.toString("ascii", 4, 8) === "ftyp")
    return { kind: "audio", format: "mov" };
  if (
    data.toString("ascii", 0, 3) === "ID3" ||
    (data[0] === 255 && (data[1] & 224) === 224)
  )
    return { kind: "audio", format: "mp3" };
  return null;
}
export async function validateMedia(
  data: Buffer,
  tempRoot = resolve(
    /* turbopackIgnore: true */ process.env.SAHAAY_MEDIA_DIR ?? ".local/media",
  ),
): Promise<ValidatedMedia> {
  if (!data.length || data.length > MAX_UPLOAD_BYTES)
    throw new RequestError(413, "size", "Files must be smaller than 8 MB.");
  const detected = detectMedia(data);
  if (!detected)
    throw invalid(
      data.toString("ascii", 0, 4) === "%PDF"
        ? "Documents/PDFs are not supported yet. Send a screenshot instead."
        : undefined,
    );
  if (detected.kind === "image") {
    try {
      const source = sharp(data, {
        limitInputPixels: 20_000_000,
        animated: false,
      });
      const meta = await source.metadata();
      if (!meta.width || !meta.height || (meta.pages ?? 1) > 1)
        throw invalid("Use a still image, not an animation.");
      const { data: output, info } = await source
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
      return {
        kind: "image",
        mime: "image/jpeg",
        data: output,
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw invalid(
        "This image could not be read. Try a PNG, JPEG or WebP screenshot.",
      );
    }
  }
  await mkdir(tempRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(tempRoot, "work-"));
  const source = join(directory, "source");
  const target = join(directory, "audio.wav");
  try {
    await writeFile(source, data, { mode: 0o600 });
    const { stdout } = await exec(
      process.env.FFPROBE_BIN ?? "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        detected.format,
        "-i",
        source,
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
      ],
      { timeout: 10_000, maxBuffer: 64_000 },
    );
    const meta = JSON.parse(stdout);
    const duration = Number(meta.format?.duration);
    if (
      !Array.isArray(meta.streams) ||
      !meta.streams.some(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ) ||
      meta.streams.some((s: { codec_type: string }) => s.codec_type === "video")
    )
      throw invalid("Please upload audio only; videos are not supported.");
    if (Number.isFinite(duration) && duration > MAX_AUDIO_SECONDS)
      throw new RequestError(
        413,
        "duration",
        "Voice clips must be 30 seconds or shorter.",
      );
    await exec(
      process.env.FFMPEG_BIN ?? "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        detected.format,
        "-i",
        source,
        "-t",
        "31",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        target,
      ],
      { timeout: 15_000, maxBuffer: 64_000 },
    );
    const { stdout: normalized } = await exec(
      process.env.FFPROBE_BIN ?? "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        target,
      ],
      { timeout: 5000, maxBuffer: 64_000 },
    );
    const actual = Number(JSON.parse(normalized).format?.duration);
    if (!Number.isFinite(actual) || actual <= 0)
      throw invalid("This audio could not be read.");
    if (actual > MAX_AUDIO_SECONDS)
      throw new RequestError(
        413,
        "duration",
        "Voice clips must be 30 seconds or shorter.",
      );
    return {
      kind: "audio",
      mime: "audio/wav",
      data: await readFile(target),
      duration: actual,
    };
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw invalid(
      "This audio could not be read. Try MP3, WAV, M4A, OGG or a browser recording.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
