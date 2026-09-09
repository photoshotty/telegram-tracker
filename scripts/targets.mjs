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
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return { targets: [] };
  }
}
async function save(db) {
  await writeFile(FILE, JSON.stringify(db, null, 2) + "\n");
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const norm = (u) =>
  String(u ?? "")
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .toLowerCase();

async function resolve(username) {
  const { TG_API_ID, TG_API_HASH, TG_SESSION } = process.env;
  if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) throw new Error("Set TG_API_ID, TG_API_HASH and TG_SESSION in .env");
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

const cmd = process.argv[2];
const db = await load();
const key = process.env.TG_DATA_KEY?.trim();

if (cmd === "keygen") {
  console.log("Add this to .env (and keep it forever; changing it renames every data folder):\n");
  console.log("TG_DATA_KEY=" + generateKey());
} else if (cmd === "add") {
  const username = norm(process.argv[3]);
  if (!username) {
    console.error("usage: npm run targets -- add @username [--name ...] [--note ...]");
    process.exit(1);
  }
  if (db.targets.some((t) => t.username === username)) {
    console.log(`@${username} is already in the list`);
    process.exit(0);
  }
  const info = await resolve(username);
  const name = arg("--name") ?? ([info.firstName, info.lastName].filter(Boolean).join(" ") || username);
  db.targets.push({
    id: info.id,
    username: info.username,
    name,
    note: arg("--note") ?? "",
    addedAt: new Date().toISOString(),
  });
  await save(db);
  const privacyNote =
    info.status === "UserStatusOnline" || info.status === "UserStatusOffline"
      ? "exact timestamps visible"
      : `status is "${info.status}" -> this person hides last seen; only coarse data will be collected`;
  console.log(`added @${info.username} (${name}) id ${info.id}${key ? ` token ${tokenFor(key, info.id)}` : ""}; ${privacyNote}`);
  console.log("run `npm run targets -- sync` to push the list to GitHub");
} else if (cmd === "remove") {
  const username = norm(process.argv[3]);
  const before = db.targets.length;
  db.targets = db.targets.filter((t) => t.username !== username);
  await save(db);
  console.log(before === db.targets.length ? `@${username} not found` : `removed @${username}; run sync to apply`);
} else if (cmd === "list") {
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
  const usernames = db.targets.map((t) => t.username).filter(Boolean);
  execFileSync("gh", ["secret", "set", "TG_TARGETS", "-R", REPO, "--body", JSON.stringify(usernames)], { stdio: "inherit" });
  execFileSync("gh", ["secret", "set", "TG_DATA_KEY", "-R", REPO, "--body", key], { stdio: "inherit" });
  console.log(`synced ${usernames.length} username(s) and the data key to ${REPO}`);
} else {
  console.log("commands: keygen | add @username | remove @username | list | sync");
  process.exit(1);
}
process.exit(0);
