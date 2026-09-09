// Poll the presence of every tracked Telegram user once and append one sample per user
// to <DATA_DIR>/<token>/YYYY-MM.jsonl, where <token> = HMAC(TG_DATA_KEY, user id).
// Read-only towards Telegram presence: never calls account.updateStatus.
//
// DATA_DIR defaults to data/ inside GitHub Actions and data-local/ (gitignored) elsewhere.
//
// TG_TARGETS (JSON array, GitHub secret) entries: "@username", "id:<numeric id>", or "me"
// (the polling account itself). Numeric ids are found through, in order:
//   1. the polling account's contacts and recent private chats;
//   2. forwarded messages in the polling account's inbox (inputUserFromMessage lookup);
//   3. contact cards shared into the inbox (contacts.importContacts by phone).
// So to track someone without a username, forward any message from them (or share their
// contact card) to the polling account, press Poll now, then pick them in the dashboard.
//
// Encrypted files for the local dashboard (only the key holder can read them):
//   targets.cache.enc  resolved access hashes (bound to this session) + failed lookups
//   targets.map.enc    token -> id, username, display name, self
//   dialogs.map.enc    candidates the dashboard can offer: contacts, chats, forwarded senders, contact cards
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import bigInt from "big-integer";
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { decryptJson, encryptJson, requireKey, tokenFor } from "./crypto.mjs";

const { TG_API_ID, TG_API_HASH, TG_SESSION } = process.env;
if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) {
  console.error("Missing TG_API_ID, TG_API_HASH or TG_SESSION (see .env.example)");
  process.exit(1);
}
const DATA_KEY = requireKey();

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? (process.env.GITHUB_ACTIONS ? "data" : "data-local"));
const CACHE_FILE = path.join(DATA_DIR, "targets.cache.enc");
const MAP_FILE = path.join(DATA_DIR, "targets.map.enc");
const DIALOGS_FILE = path.join(DATA_DIR, "dialogs.map.enc");
const RESOLVE_DELAY_MS = 1500;
const RETRY_FAILED_MS = 24 * 60 * 60 * 1000;
const SCAN_DIALOGS = 10; // most recent private chats whose history is scanned for forwards
const SCAN_MESSAGES = 50;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const sessionKey = sha(TG_SESSION).slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usernameKey = (u) => sha(u);
const idKey = (id) => sha(`id:${id}`);
const isFresh = (e) => e?.failed && Date.now() - e.at < RETRY_FAILED_MS;
const errMsg = (e) => e?.errorMessage ?? e?.message ?? String(e);

function parseTargets() {
  const raw = process.env.TG_TARGETS?.trim();
  const out = { usernames: [], ids: [], self: false };
  if (!raw) return out;
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    list = raw.split(/[\s,]+/);
  }
  for (const item of list) {
    const s = String(item).trim().toLowerCase();
    if (!s) continue;
    if (s === "me" || s === "self") out.self = true;
    else if (/^(?:id:)?\d{3,20}$/.test(s)) out.ids.push(s.replace(/^id:/, ""));
    else out.usernames.push(s.replace(/^@/, ""));
  }
  out.usernames = [...new Set(out.usernames)];
  out.ids = [...new Set(out.ids)];
  return out;
}

// s: online | offline | recently | week | month | empty
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

async function loadEncrypted(file, fallback) {
  try {
    return decryptJson(DATA_KEY, await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}
async function saveEncrypted(file, obj) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, encryptJson(DATA_KEY, obj) + "\n");
}
async function loadCache() {
  const c = await loadEncrypted(CACHE_FILE, null);
  if (c && c.session === sessionKey && c.entries) return c;
  if (c) console.log("targets cache belongs to another session; re-resolving");
  return { session: sessionKey, entries: {} };
}

const summarize = (u) => ({
  id: u.id.toString(),
  hash: u.accessHash && !u.min ? u.accessHash.toString() : null,
  name: [u.firstName, u.lastName].filter(Boolean).join(" "),
  username: u.username ? String(u.username).toLowerCase() : null,
});
const usable = (u) => u?.className === "User" && !u.self && !u.bot && !u.deleted && !u.support && u.id.toString() !== "777000";

// Everyone the polling account can currently reference, keyed by id:
//   contacts and recent chats (full users), forwarded senders (with the message they were seen in),
//   contact cards (with phone). Returns { candidates: Map, list: [...] } where list is what the dashboard shows.
async function discover(client) {
  const cands = new Map();
  const put = (id, patch) => cands.set(id, { ...(cands.get(id) ?? { id }), ...patch });
  const dialogPeers = [];

  try {
    const c = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
    for (const u of c.users ?? []) if (usable(u)) put(u.id.toString(), { ...summarize(u), source: "contact" });
  } catch (e) {
    console.error(`contacts.getContacts failed: ${errMsg(e)}`);
  }

  try {
    const d = await client.invoke(new Api.messages.GetDialogs({ offsetDate: 0, offsetId: 0, offsetPeer: new Api.InputPeerEmpty(), limit: 100, hash: bigInt(0) }));
    const byId = new Map((d.users ?? []).map((u) => [u.id.toString(), u]));
    for (const u of d.users ?? []) if (usable(u) && !u.min) put(u.id.toString(), { ...summarize(u), source: cands.get(u.id.toString())?.source ?? "chat" });
    for (const dlg of d.dialogs ?? []) {
      if (dlg.peer?.className !== "PeerUser") continue;
      const u = byId.get(dlg.peer.userId.toString());
      if (u?.self) dialogPeers.push(new Api.InputPeerSelf());
      else if (u?.accessHash && !u.min) dialogPeers.push(new Api.InputPeerUser({ userId: u.id, accessHash: u.accessHash }));
      if (dialogPeers.length >= SCAN_DIALOGS) break;
    }
  } catch (e) {
    console.error(`messages.getDialogs failed: ${errMsg(e)}`);
  }

  // Forwarded messages and contact cards in the most recent private chats (and Saved Messages).
  for (const peer of dialogPeers) {
    try {
      const h = await client.invoke(new Api.messages.GetHistory({ peer, offsetId: 0, offsetDate: 0, addOffset: 0, limit: SCAN_MESSAGES, maxId: 0, minId: 0, hash: bigInt(0) }));
      const byId = new Map((h.users ?? []).map((u) => [u.id.toString(), u]));
      for (const m of h.messages ?? []) {
        if (m.className !== "Message") continue;
        const from = m.fwdFrom?.fromId;
        if (from?.className === "PeerUser") {
          const id = from.userId.toString();
          const u = byId.get(id);
          if (u?.self) continue;
          const existing = cands.get(id);
          if (!existing?.hash) put(id, { name: u ? summarize(u).name : existing?.name ?? m.fwdFrom.fromName ?? "", username: u?.username?.toLowerCase() ?? existing?.username ?? null, source: existing?.source ?? "forward", via: existing?.via ?? { peer, msgId: m.id } });
        }
        const media = m.media;
        if (media?.className === "MessageMediaContact" && media.phoneNumber) {
          const id = media.userId ? media.userId.toString() : `phone:${media.phoneNumber}`;
          const existing = cands.get(id);
          if (!existing?.hash) put(id, { name: existing?.name || [media.firstName, media.lastName].filter(Boolean).join(" "), username: existing?.username ?? null, source: existing?.source ?? "card", phone: media.phoneNumber, ...(existing?.via ? { via: existing.via } : {}) });
        }
      }
      await sleep(300);
    } catch (e) {
      console.error(`messages.getHistory failed: ${errMsg(e)}`);
    }
  }

  const list = [...cands.values()].filter((c) => /^\d+$/.test(c.id)).map(({ id, name, username, source }) => ({ id, name, username, source }));
  return { cands, list };
}

// Turn a candidate without a full access hash into one, using the message it was seen in
// (inputUserFromMessage) or the phone from a contact card (contacts.importContacts).
async function fetchFullUser(client, cand) {
  if (cand.via) {
    try {
      const [u] = await client.invoke(new Api.users.GetUsers({ id: [new Api.InputUserFromMessage({ peer: cand.via.peer, msgId: cand.via.msgId, userId: bigInt(cand.id) })] }));
      if (u?.className === "User" && u.accessHash && !u.min) return u;
      console.error("forwarded sender is still a min user after users.getUsers");
    } catch (e) {
      console.error(`users.getUsers(fromMessage) failed: ${errMsg(e)}`);
    }
  }
  if (cand.phone) {
    try {
      const res = await client.invoke(new Api.contacts.ImportContacts({ contacts: [new Api.InputPhoneContact({ clientId: bigInt(0), phone: cand.phone, firstName: cand.name || "tracked", lastName: "" })] }));
      const u = (res.users ?? []).find((x) => x.className === "User" && (!cand.id.startsWith("phone:") ? x.id.toString() === cand.id : true));
      if (u?.accessHash) return u;
      console.error("contact card phone could not be imported (their privacy blocks phone lookup)");
    } catch (e) {
      console.error(`contacts.importContacts failed: ${errMsg(e)}`);
    }
  }
  return null;
}

async function resolveMissing(client, cache, { usernames, ids }) {
  let changed = false;
  const { cands, list } = await discover(client);
  await saveEncrypted(DIALOGS_FILE, { updatedAt: Math.floor(Date.now() / 1000), users: list });

  for (const id of ids) {
    const e = cache.entries[idKey(id)];
    if (e?.hash || isFresh(e)) continue;
    const cand = cands.get(id);
    let hash = cand?.hash ?? null;
    if (!hash && cand) {
      const u = await fetchFullUser(client, cand);
      if (u) hash = u.accessHash.toString();
    }
    if (hash) {
      cache.entries[idKey(id)] = { id, hash };
      console.log(`resolved an id target -> ${tokenFor(DATA_KEY, id)}`);
    } else {
      cache.entries[idKey(id)] = { failed: cand ? "seen but not reachable (their privacy hides forwards / phone)" : "not among contacts, chats, forwards or contact cards", at: Date.now() };
      console.error("an id target could not be resolved; will retry in 24h");
    }
    changed = true;
  }

  if (cache.floodUntil && Date.now() < cache.floodUntil) {
    console.log(`username resolution paused until ${new Date(cache.floodUntil).toISOString()} (flood wait)`);
  } else {
    for (let i = 0; i < usernames.length; i++) {
      const u = usernames[i];
      const key = usernameKey(u);
      const e = cache.entries[key];
      if (e?.hash || isFresh(e)) continue;
      try {
        const res = await client.invoke(new Api.contacts.ResolveUsername({ username: u }));
        const user = res.users.find((x) => x.className === "User");
        if (!user) throw new Error("not a user");
        cache.entries[key] = { id: user.id.toString(), hash: user.accessHash.toString() };
        changed = true;
        console.log(`resolved target #${i} -> ${tokenFor(DATA_KEY, user.id.toString())}`);
      } catch (err) {
        const msg = errMsg(err);
        if (msg.startsWith("FLOOD_WAIT")) {
          const secs = Number(err?.seconds) || Number(msg.split("_").pop()) || 3600;
          cache.floodUntil = Date.now() + secs * 1000;
          changed = true;
          console.error(`flood wait ${secs}s from Telegram; pausing username resolution`);
          break;
        }
        if (/USERNAME_NOT_OCCUPIED|USERNAME_INVALID|not a user/.test(msg)) {
          cache.entries[key] = { failed: msg, at: Date.now() };
          changed = true;
          console.error(`target #${i} cannot be resolved (${msg}); will retry in 24h`);
        } else {
          console.error(`target #${i}: ${msg}; will retry next run`);
        }
      }
      await sleep(RESOLVE_DELAY_MS);
    }
  }
  if (changed) await saveEncrypted(CACHE_FILE, cache);
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
}

async function updateMap(users, cache, { usernames, ids }, t) {
  const map = (await loadEncrypted(MAP_FILE, null)) ?? { byToken: {}, failed: {} };
  map.byToken ??= {};
  map.failed = {};
  for (const user of users) {
    if (user.className !== "User") continue;
    const { id, name, username } = summarize(user);
    map.byToken[tokenFor(DATA_KEY, id)] = { id, name, username, self: !!user.self, updatedAt: t };
  }
  for (const u of usernames) if (cache.entries[usernameKey(u)]?.failed) map.failed[usernameKey(u)] = { message: cache.entries[usernameKey(u)].failed, at: cache.entries[usernameKey(u)].at };
  for (const id of ids) if (cache.entries[idKey(id)]?.failed) map.failed[idKey(id)] = { message: cache.entries[idKey(id)].failed, at: cache.entries[idKey(id)].at };
  map.updatedAt = t;
  await saveEncrypted(MAP_FILE, map);
}

async function main() {
  const targets = parseTargets();
  const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, {
    connectionRetries: 3,
    deviceModel: "Desktop",
    systemVersion: "Windows 11",
    appVersion: "1.0.0",
  });
  client.setLogLevel("error");
  await client.connect();
  try {
    if (!(await client.isUserAuthorized())) throw new Error("Session is not authorized. Renew it from the dashboard (renew via QR).");

    const cache = await loadCache();
    await resolveMissing(client, cache, targets);

    const entries = [...targets.usernames.map((u) => cache.entries[usernameKey(u)]), ...targets.ids.map((id) => cache.entries[idKey(id)])];
    const inputs = entries.filter((e) => e?.hash).map((e) => new Api.InputUser({ userId: bigInt(e.id), accessHash: bigInt(e.hash) }));
    if (targets.self || inputs.length === 0) inputs.unshift(new Api.InputUserSelf());

    let users;
    try {
      users = await client.invoke(new Api.users.GetUsers({ id: inputs }));
    } catch (err) {
      console.error(`users.getUsers failed for the target list (${errMsg(err)}); polling self only this run`);
      users = await client.invoke(new Api.users.GetUsers({ id: [new Api.InputUserSelf()] }));
    }

    const t = Math.floor(Date.now() / 1000);
    let written = 0;
    for (const user of users) {
      if (user.className !== "User") continue;
      if (user.self && !targets.self && inputs.length > 1) continue; // self only polled as a keep-alive when nothing else resolves
      const token = tokenFor(DATA_KEY, user.id.toString());
      const sample = { t, ...normalize(user.status), src: "poll" };
      await writeSample(token, sample);
      written += 1;
      console.log(`[${new Date(t * 1000).toISOString()}] ${token} ${describe(sample)}`);
    }
    await updateMap(users, cache, targets, t);
    const pending = entries.filter((e) => !e?.hash).length;
    console.log(`polled ${written} user(s) into ${path.relative(process.cwd(), DATA_DIR) || "."}${pending ? `, ${pending} target(s) unresolved` : ""}`);
  } finally {
    await client.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(errMsg(e));
    process.exit(1);
  });
