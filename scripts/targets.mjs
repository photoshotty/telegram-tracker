// Manage the private list of tracked people (targets.local.json, gitignored).
//
//   npm run targets -- keygen                 # print a fresh TG_DATA_KEY
//   npm run targets -- add @username [--name "Display name"] [--note "text"]
//   npm run targets -- remove @username
//   npm run targets -- list
//   npm run targets -- sync                   # push usernames + data key to GitHub secrets
//
// `add` resolves the username with your LOCAL session to learn the numeric id and
// display name. The public repo only ever sees HMAC tokens of ids, never ids or names.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateKey, tokenFor } from "../src/crypto.mjs";

const FILE = path.resolve("targets.local.json");
const REPO = process.env.GH_REPO ?? "photoshotty/telegram-tracker";

async function load() {
  try {
    const db = JSON.parse(await readFile(FILE, "utf8"));
    if (!Array.isArray(db.targets)) db.targets = [];
    return db;
  } catch {
    return { targets: [] };
  }
}

// Re-read right before writing so a concurrent writer (the dashboard's login worker) is not clobbered.
async function mutate(fn) {
  const db = await load();
  const result = await fn(db);
  await writeFile(FILE, JSON.stringify(db, null, 2) + "\n");
  return result;
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const norm = (u) =>
  String(u ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();

async function resolve(username) {
  const { TG_API_ID, TG_API_HASH, TG_SESSION } = process.env;
  if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) throw new Error("No local Telegram login yet: press \"Show QR code\" in the dashboard (or run npm run login:qr)");
  const { Api, TelegramClient } = await import("teleproto");
  const { StringSession } = await import("teleproto/sessions/index.js");
  const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, {
    connectionRetries: 3,
    deviceModel: "Desktop",
    systemVersion: "Windows 11",
    appVersion: "1.0.0",
  });
  client.setLogLevel("error");
  await client.connect();
  try {
    const res = await client.invoke(new Api.contacts.ResolveUsername({ username }));
    const user = res.users.find((x) => x.className === "User");
    if (!user) throw new Error(`@${username} is a channel/group, not a user`);
    return {
      id: user.id.toString(),
      username: (user.username ?? username).toLowerCase(),
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      status: user.status?.className ?? "unknown",
    };
  } finally {
    await client.disconnect();
  }
}

// Secrets go to gh over stdin, never on the command line where other processes could read them.
function setSecret(name, value) {
  execFileSync("gh", ["secret", "set", name, "-R", REPO], { input: value, stdio: ["pipe", "inherit", "inherit"] });
}

const cmd = process.argv[2];
const key = process.env.TG_DATA_KEY?.trim();

try {
  if (cmd === "keygen") {
    console.log("Add this to .env (and keep it forever; changing it renames every data folder):\n");
    console.log("TG_DATA_KEY=" + generateKey());
  } else if (cmd === "add") {
    const username = norm(process.argv[3]);
    if (!username) {
      console.error("usage: npm run targets -- add @username [--name ...] [--note ...]");
      process.exit(1);
    }
    const existing = (await load()).targets.find((t) => t.username === username);
    if (existing) {
      console.log(`@${username} is already in the list`);
      process.exit(0);
    }
    const info = await resolve(username);
    const name = arg("--name")?.trim() || [info.firstName, info.lastName].filter(Boolean).join(" ") || username;
    await mutate((db) => {
      if (db.targets.some((t) => t.username === info.username || String(t.id) === info.id)) return;
      db.targets.push({ id: info.id, username: info.username, name, note: arg("--note") ?? "", addedAt: new Date().toISOString() });
    });
    const privacyNote =
      info.status === "UserStatusOnline" || info.status === "UserStatusOffline"
        ? "exact timestamps visible"
        : `status is "${info.status}" -> this person hides last seen; only coarse data will be collected`;
    console.log(`added @${info.username} (${name}) id ${info.id}${key ? ` token ${tokenFor(key, info.id)}` : ""}; ${privacyNote}`);
  } else if (cmd === "remove") {
    const username = norm(process.argv[3]);
    const removed = await mutate((db) => {
      const before = db.targets.length;
      db.targets = db.targets.filter((t) => t.username !== username);
      return before !== db.targets.length;
    });
    console.log(removed ? `removed @${username}` : `@${username} not found`);
  } else if (cmd === "list") {
    const db = await load();
    if (db.targets.length === 0) console.log("no targets yet; add one with: npm run targets -- add @username");
    for (const t of db.targets) {
      const token = key ? tokenFor(key, t.id) : "(no TG_DATA_KEY)";
      console.log(`${token}\t${t.id}\t${t.username ? "@" + t.username : "-"}\t${t.name}${t.note ? `\t(${t.note})` : ""}`);
    }
  } else if (cmd === "sync") {
    if (!key) {
      console.error("TG_DATA_KEY missing in .env; run `npm run targets -- keygen` first");
      process.exit(1);
    }
    const usernames = (await load()).targets.map((t) => t.username).filter(Boolean);
    setSecret("TG_TARGETS", JSON.stringify(usernames));
    setSecret("TG_DATA_KEY", key);
    await mutate((db) => {
      db.lastSync = { at: new Date().toISOString(), usernames };
    });
    console.log(`synced ${usernames.length} username(s) and the data key to ${REPO}`);
  } else {
    console.log("commands: keygen | add @username | remove @username | list | sync");
    process.exit(1);
  }
} catch (e) {
  console.error(e?.errorMessage ?? e?.message ?? String(e));
  process.exit(1);
}
process.exit(0);
