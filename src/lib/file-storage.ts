import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const devKey = randomBytes(32).toString("hex");

export function privateDir() {
  const dir = process.env.PRIVATE_FILES_PATH || join(process.cwd(), ".data", "private");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function privatePath(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return join(/* turbopackIgnore: true */ privateDir(), key);
}

const magic: Record<string, { signature: number[]; mime: string }> = {
  pdf: { signature: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" },
  png: { signature: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  jpg: { signature: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  jpeg: { signature: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  zip: { signature: [0x50, 0x4b], mime: "application/zip" },
  docx: { signature: [0x50, 0x4b], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { signature: [0x50, 0x4b], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { signature: [0x50, 0x4b], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  doc: { signature: [0xd0, 0xcf, 0x11, 0xe0], mime: "application/msword" },
  xls: { signature: [0xd0, 0xcf, 0x11, 0xe0], mime: "application/vnd.ms-excel" },
  ppt: { signature: [0xd0, 0xcf, 0x11, 0xe0], mime: "application/vnd.ms-powerpoint" },
};

export function allowedMime(name: string, bytes: Uint8Array) {
  const extension = name.toLowerCase().split(".").pop() || "";
  const entry = magic[extension];
  if (!entry || bytes.length < entry.signature.length) return null;
  return entry.signature.every((n, i) => bytes[i] === n) ? entry.mime : null;
}

function signingKey() {
  const value = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? devKey : "");
  if (value.length < 32) throw new Error("SESSION_SECRET is required");
  return value;
}

export function signedDownload(id: string, userId: string) {
  const expires = Math.floor(Date.now() / 1000) + 5 * 60;
  const signature = createHmac("sha256", signingKey()).update(`${id}:${userId}:${expires}`).digest("hex");
  return `/api/files/${id}/download?expires=${expires}&signature=${signature}`;
}

export function verifyDownload(id: string, userId: string, expires: number, signature: string) {
  if (!Number.isInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 5 * 60 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", signingKey()).update(`${id}:${userId}:${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
