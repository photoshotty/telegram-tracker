// Server-only helpers that read the collector's files from the repo root.
import { createHmac } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import type { Sample, TargetMeta } from "./types";

// `npm run dev` runs with cwd = web/, the data lives one level up.
export const ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
const TARGETS_FILE = path.join(ROOT, "targets.local.json");

// The root .env is the collector's; Next only auto-loads web/.env, so read it by hand.
function rootEnv(name: string): string | null {
  if (process.env[name]) return process.env[name]!;
  try {
    const text = readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return null;
}

export const dataKey = (): string | null => rootEnv("TG_DATA_KEY");

// Folder name for a Telegram id: HMAC so the public repo never shows the id itself.
export function tokenFor(id: string): string | null {
  const key = dataKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`user:${id}`).digest("hex").slice(0, 16);
}

export type Targets = {
  byToken: Map<string, TargetMeta>;
  timezone: string | null;
  meToken: string | null;
  hasKey: boolean;
};

export async function loadTargets(): Promise<Targets> {
  const hasKey = !!dataKey();
  try {
    const raw = JSON.parse(await fs.readFile(TARGETS_FILE, "utf8"));
    const byToken = new Map<string, TargetMeta>();
    for (const t of raw.targets ?? []) {
      const id = String(t.id);
      const token = tokenFor(id);
      if (token) byToken.set(token, { ...t, id });
    }
    const meToken = raw.me ? tokenFor(String(raw.me)) : null;
    return { byToken, timezone: raw.settings?.timezone ?? null, meToken, hasKey };
  } catch {
    return { byToken: new Map(), timezone: null, meToken: null, hasKey };
  }
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
