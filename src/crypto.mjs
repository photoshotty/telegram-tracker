// Everything that keeps Telegram ids out of the public repo.
//
// TG_DATA_KEY (a random secret, same value locally and in GitHub secrets):
//   - folder names are HMAC-SHA256(key, "user:<id>") truncated to 16 hex chars,
//     so the repo shows opaque tokens and only a key holder can tell who is who;
//   - the CI cache of access hashes is AES-256-GCM encrypted with the key.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export function requireKey() {
  const key = process.env.TG_DATA_KEY?.trim();
  if (!key || key.length < 16) {
    console.error("Missing TG_DATA_KEY. Generate one with `npm run targets -- keygen`, put it in .env and in the GitHub secret TG_DATA_KEY.");
    process.exit(1);
  }
  return key;
}

export const generateKey = () => randomBytes(32).toString("hex");

export function tokenFor(key, id) {
  return createHmac("sha256", key).update(`user:${id}`).digest("hex").slice(0, 16);
}

const aesKey = (key) => createHash("sha256").update(key).digest();

export function encryptJson(key, obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(key), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptJson(key, b64) {
  const buf = Buffer.from(b64.trim(), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", aesKey(key), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"));
}
