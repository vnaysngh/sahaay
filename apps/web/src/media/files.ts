import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { seal, unseal } from "./artifact-crypto";
import { RequestError } from "../core/validation";
export class MediaFiles {
  constructor(
    readonly root = resolve(
      /* turbopackIgnore: true */ process.env.SAHAAY_MEDIA_DIR ??
        ".local/media",
    ),
  ) {}
  path(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new RequestError(400, "id", "Invalid attachment.");
    return join(this.root, id);
  }
  async put(id: string, data: Buffer, owner?: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const bytes = owner
      ? Buffer.concat([
          Buffer.from("SAHAAY_IMAGE_V1\n"),
          await seal(data, owner, id, "temporary_preview"),
        ])
      : data;
    await writeFile(this.path(id), bytes, { flag: "wx", mode: 0o600 });
  }
  async read(id: string, owner?: string) {
    const bytes = await readFile(this.path(id)),
      header = Buffer.from("SAHAAY_IMAGE_V1\n");
    if (bytes.subarray(0, header.length).equals(header)) {
      if (!owner)
        throw new RequestError(403, "owner", "Image ownership is required.");
      return unseal(
        bytes.subarray(header.length),
        owner,
        id,
        "temporary_preview",
      );
    }
    return bytes;
  }
  async remove(id: string) {
    try {
      await unlink(this.path(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async cleanup(activeIds: Set<string>) {
    let files: string[];
    try {
      files = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const id of files) {
      if (/^work-[a-zA-Z0-9]{6}$/.test(id)) {
        const work = join(this.root, id);
        const info = await stat(work);
        if (Date.now() - info.mtimeMs > 60_000)
          await rm(work, { recursive: true, force: true });
        continue;
      }
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const info = await stat(this.path(id));
      // Grace period prevents racing file creation with the following database insert.
      if (!activeIds.has(id) && Date.now() - info.mtimeMs > 60_000)
        await this.remove(id);
    }
  }
}
