// Poll the presence of every tracked Telegram user once and append one sample per user
// to data/<token>/YYYY-MM.jsonl, where <token> = HMAC(TG_DATA_KEY, user id).
// Read-only: never calls account.updateStatus.
//
// Who gets polled:
//   - always the logged-in account itself (InputUserSelf)
//   - every username listed in TG_TARGETS (JSON array), which lives in a GitHub secret.
// Usernames are resolved once and cached in data/targets.cache.enc (AES-GCM, TG_DATA_KEY),
// keyed by SHA-256 of the username. Access hashes are bound to the login session, so the
// cache is discarded when TG_SESSION changes.
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { decryptJson, encryptJson, requireKey, tokenFor } from "./crypto.mjs";

const { TG_API_ID, TG_API_HASH, TG_SESSION } = process.env;
if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) {
  console.error("Missing TG_API_ID, TG_API_HASH or TG_SESSION (see .env.example)");
  process.exit(1);
}
const DATA_KEY = requireKey();

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const CACHE_FILE = path.join(DATA_DIR, "targets.cache.enc");
const RESOLVE_DELAY_MS = 1500; // be gentle with contacts.resolveUsername

const sha = (s) => createHash("sha256").update(s).digest("hex");
const sessionKey = sha(TG_SESSION).slice(0, 12);

function parseTargets() {
  const raw = process.env.TG_TARGETS?.trim();
  if (!raw) return [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    list = raw.split(/[\s,]+/);
  }
  return [...new Set(list.map((u) => String(u).trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
}

// s: online | offline | recently | week | month | empty
// wo: exact last-seen unix ts (offline only); ex: online-until unix ts (online only)
function normalize(status) {
  switch (status?.className) {
    case "UserStatusOnline":
      return { s: "online", wo: null, ex: status.expires };
    case "UserStatusOffline":
      return { s: "offline", wo: status.wasOnline, ex: null };
    case "UserStatusRecently":
      return { s: "recently", wo: null, ex: null };
    case "UserStatusLastWeek":
      return { s: "week", wo: null, ex: null };
    case "UserStatusLastMonth":
      return { s: "month", wo: null, ex: null };
    default:
      return { s: "empty", wo: null, ex: null };
  }
}

async function loadCache() {
  try {
    const c = decryptJson(DATA_KEY, await readFile(CACHE_FILE, "utf8"));
    if (c.session === sessionKey && c.entries) return c;
    console.log("targets cache belongs to another session; re-resolving");
  } catch {}
  return { session: sessionKey, entries: {} };
}

async function saveCache(cache) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CACHE_FILE, encryptJson(DATA_KEY, cache) + "\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveMissing(client, cache, usernames) {
  let changed = false;
  for (const u of usernames) {
    const key = sha(u);
    if (cache.entries[key]) continue;
    try {
      const res = await client.invoke(new Api.contacts.ResolveUsername({ username: u }));
      const user = res.users.find((x) => x.className === "User");
      if (!user) throw new Error("not a user");
      cache.entries[key] = { id: user.id.toString(), hash: user.accessHash.toString() };
      changed = true;
      console.log(`resolved a new target -> ${tokenFor(DATA_KEY, user.id.toString())}`);
    } catch (e) {
      const msg = e?.errorMessage ?? e?.message ?? String(e);
      console.error(`could not resolve a target (${msg}); will retry next run`);
      if (msg.startsWith("FLOOD_WAIT")) break;
    }
    await sleep(RESOLVE_DELAY_MS);
  }
  if (changed) await saveCache(cache);
}

function describe(sample) {
  const iso = (ts) => new Date(ts * 1000).toISOString();
  if (sample.s === "online") return `online until ${iso(sample.ex)}`;
  if (sample.s === "offline") return `offline, last seen ${iso(sample.wo)}`;
  return `${sample.s} (exact timestamps hidden by their privacy settings)`;
}

async function writeSample(token, sample) {
  const dir = path.join(DATA_DIR, token);
  await mkdir(dir, { recursive: true });
  const month = new Date(sample.t * 1000).toISOString().slice(0, 7);
  await appendFile(path.join(dir, `${month}.jsonl`), JSON.stringify(sample) + "\n");
  await writeFile(path.join(dir, "latest.json"), JSON.stringify(sample, null, 2) + "\n");
}

async function main() {
  const usernames = parseTargets();
  const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, {
    connectionRetries: 3,
    deviceModel: "Desktop",
    systemVersion: "Windows 11",
    appVersion: "1.0.0",
  });
  client.setLogLevel("error");
  await client.connect();
  try {
    if (!(await client.isUserAuthorized())) {
      throw new Error("Session is not authorized. Run `npm run login:qr` and update TG_SESSION.");
    }

    const cache = await loadCache();
    await resolveMissing(client, cache, usernames);

    const inputs = [new Api.InputUserSelf()];
    for (const u of usernames) {
      const e = cache.entries[sha(u)];
      if (e) inputs.push(new Api.InputUser({ userId: BigInt(e.id), accessHash: BigInt(e.hash) }));
    }

    const users = await client.invoke(new Api.users.GetUsers({ id: inputs }));
    const t = Math.floor(Date.now() / 1000);
    let written = 0;
    for (const user of users) {
      if (user.className !== "User") continue;
      const token = tokenFor(DATA_KEY, user.id.toString());
      const sample = { t, ...normalize(user.status), src: "poll" };
      await writeSample(token, sample);
      written += 1;
      console.log(`[${new Date(t * 1000).toISOString()}] ${user.self ? "me" : token} ${describe(sample)}`);
    }
    const pending = usernames.filter((u) => !cache.entries[sha(u)]).length;
    console.log(`polled ${written} user(s)${pending ? `, ${pending} target(s) still unresolved` : ""}`);
  } finally {
    await client.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.errorMessage ?? e?.message ?? e);
    process.exit(1);
  });
