import os from "os";
import path from "path";

/** Shared upload directory — must be the same path in app and worker containers. */
export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(os.tmpdir(), "samayak-uploads");
}
