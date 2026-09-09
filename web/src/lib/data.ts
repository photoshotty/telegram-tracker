// Server-only helpers that read the collector's files from the repo root.
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import type { Sample, TargetMeta } from "./types";

// `npm run dev` runs with cwd = web/, the data lives one level up.
export const ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
const TARGETS_FILE = path.join(ROOT, "targets.local.json");
const MAP_FILE = path.join(DATA_DIR, "targets.map.enc");

// The root .env is the collector's; Next only auto-loads web/.env, so read it by hand.
export function rootEnv(name: string): string | null {
  try {
    const text = readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "") || null;
    }
  } catch {}
  return process.env[name] ?? null;
}

export const dataKey = (): string | null => rootEnv("TG_DATA_KEY");

// Folder name for a Telegram id: HMAC so the public repo never shows the id itself.
export function tokenFor(id: string): string | null {
  const key = dataKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`user:${id}`).digest("hex").slice(0, 16);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Same format as src/crypto.mjs: base64(iv[12] | tag[16] | ciphertext), AES-256-GCM, key = sha256(TG_DATA_KEY).
function decryptJson<T>(key: string, b64: string): T {
  const buf = Buffer.from(b64.trim(), "base64");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

export type MapEntry = { id: string; username: string | null; name: string; self: boolean; updatedAt: number };
export type NameMap = { byToken: Record<string, MapEntry>; failed: Record<string, { message: string; at: number }>; updatedAt?: number };

// Written by the GitHub Action, encrypted with the data key: who each token is.
export async function loadNameMap(): Promise<NameMap | null> {
  const key = dataKey();
  if (!key) return null;
  try {
    const m = decryptJson<NameMap>(key, await fs.readFile(MAP_FILE, "utf8"));
    return { byToken: m.byToken ?? {}, failed: m.failed ?? {}, updatedAt: m.updatedAt };
  } catch {
    return null;
  }
}

export type LocalTarget = { username: string; name?: string; note?: string; addedAt?: string; id?: string };
export type CiSession = { name: string; username: string | null; at: string };
export type LastSync = { at: string; usernames: string[] };

export type Targets = {
  list: LocalTarget[];
  byToken: Map<string, TargetMeta>;
  map: NameMap | null;
  timezone: string | null;
  meToken: string | null;
  hasKey: boolean;
  hasApiKeys: boolean;
  ciSession: CiSession | null;
  lastSync: LastSync | null;
  needsSync: boolean;
};

export async function loadTargets(): Promise<Targets> {
  const hasKey = !!dataKey();
  const hasApiKeys = !!rootEnv("TG_API_ID") && !!rootEnv("TG_API_HASH");
  let raw: {
    targets?: LocalTarget[];
    settings?: { timezone?: string | null };
    ciSession?: CiSession;
    lastSync?: LastSync;
  } = {};
  try {
    raw = JSON.parse(await fs.readFile(TARGETS_FILE, "utf8"));
  } catch {}
  const list: LocalTarget[] = (raw.targets ?? [])
    .map((t) => ({ ...t, username: String(t.username ?? "").toLowerCase(), id: t.id ? String(t.id) : undefined }))
    .filter((t) => t.username || t.id);

  const map = await loadNameMap();
  const byToken = new Map<string, TargetMeta>();
  let meToken: string | null = null;
  if (map) {
    for (const [token, e] of Object.entries(map.byToken)) {
      const local = list.find((t) => (t.id && t.id === e.id) || (e.username && t.username === e.username));
      byToken.set(token, {
        id: e.id,
        username: e.username ?? local?.username,
        name: local?.name?.trim() || e.name || (e.username ? `@${e.username}` : `User ${e.id}`),
        note: local?.note,
        addedAt: local?.addedAt,
      });
      if (e.self) meToken = token;
    }
  }
  // Names the user typed for people the Action has not looked up yet still get a token when the id is known.
  for (const t of list) {
    if (!t.id) continue;
    const token = tokenFor(t.id);
    if (token && !byToken.has(token)) byToken.set(token, { id: t.id, username: t.username || undefined, name: t.name || (t.username ? `@${t.username}` : `User ${t.id}`), note: t.note, addedAt: t.addedAt });
  }

  const wanted = list.map((t) => t.username).filter(Boolean).sort();
  const synced = [...(raw.lastSync?.usernames ?? [])].sort();
  return {
    list,
    byToken,
    map,
    timezone: raw.settings?.timezone ?? null,
    meToken,
    hasKey,
    hasApiKeys,
    ciSession: raw.ciSession ?? null,
    lastSync: raw.lastSync ?? null,
    needsSync: JSON.stringify(wanted) !== JSON.stringify(synced),
  };
}

export async function listTokens(): Promise<string[]> {
  try {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && /^[0-9a-f]{16}$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function loadSamples(token: string): Promise<Sample[]> {
  const dir = path.join(DATA_DIR, token);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  } catch {
    return [];
  }
  const out: Sample[] = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const s = JSON.parse(line) as Sample;
        if (typeof s.t === "number" && typeof s.s === "string") out.push(s);
      } catch {
        // skip a corrupt line rather than failing the page
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  const dedup: Sample[] = [];
  for (const s of out) {
    if (dedup.length && dedup[dedup.length - 1].t === s.t) continue;
    dedup.push(s);
  }
  return dedup;
}

// The dashboard runs on the user's own machine, so the server's zone is the user's zone.
export function serverTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function displayName(token: string, targets: Targets): string {
  const meta = targets.byToken.get(token);
  if (meta?.name) return meta.name;
  if (meta?.username) return `@${meta.username}`;
  return `Unknown ${token.slice(0, 6)}`;
}
