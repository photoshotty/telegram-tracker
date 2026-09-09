// Manage the private list of tracked people (targets.local.json, gitignored).
//
//   npm run targets -- keygen                          # print a fresh TG_DATA_KEY
//   npm run targets -- add @username [--name X] [--note Y]
//   npm run targets -- add --id 123456789 [--name X] [--note Y]   # someone without a username (must be in your chats/contacts)
//   npm run targets -- remove @username | --id 123456789
//   npm run targets -- list
//   npm run targets -- sync                            # push the list + data key to GitHub secrets
//
// No Telegram login is needed here: the GitHub Action looks people up on its next run and
// publishes the encrypted name map the dashboard reads. Only HMAC tokens reach the repo.
import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateKey, tokenFor } from "../src/crypto.mjs";
import { ghEnvFor } from "../src/gh.mjs";

const FILE = path.resolve("targets.local.json");
const REPO = process.env.GH_REPO ?? "photoshotty/telegram-tracker";
const GH_ENV = ghEnvFor(REPO);

// A missing file means an empty list; an unreadable one must never be silently replaced.
async function load() {
  let text;
  try {
    text = await readFile(FILE, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return { targets: [] };
    throw e;
  }
  let db;
  try {
    db = JSON.parse(text);
  } catch {
    throw new Error("targets.local.json is not valid JSON; refusing to overwrite it (another write may be in progress, try again)");
  }
  if (!Array.isArray(db.targets)) db.targets = [];
  return db;
}

// Re-read right before writing so a concurrent writer is not clobbered; write atomically via rename.
async function mutate(fn) {
  const db = await load();
  const result = await fn(db);
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2) + "\n");
  await rename(tmp, FILE);
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

// What the collector receives: "@username" entries and "id:<n>" entries.
export const targetKey = (t) => (t.username ? t.username : t.id ? `id:${t.id}` : null);

// Secrets go to gh over stdin, never on the command line where other processes could read them.
function setSecret(name, value) {
  execFileSync("gh", ["secret", "set", name, "-R", REPO], { input: value, stdio: ["pipe", "inherit", "inherit"], env: GH_ENV });
}

const cmd = process.argv[2];
const key = process.env.TG_DATA_KEY?.trim();

try {
  if (cmd === "keygen") {
    console.log("Add this to .env (and keep it forever; changing it renames every data folder):\n");
    console.log("TG_DATA_KEY=" + generateKey());
  } else if (cmd === "add") {
    const id = arg("--id")?.trim();
    const username = id ? "" : norm(process.argv[3]);
    if (id && !/^\d{3,20}$/.test(id)) {
      console.error("--id must be a numeric Telegram user id");
      process.exit(1);
    }
    if (!id && !/^[a-z0-9_]{4,32}$/.test(username)) {
      console.error("usage: npm run targets -- add @username | --id <numeric id>  [--name ...] [--note ...]");
      process.exit(1);
    }
    const added = await mutate((db) => {
      if (db.targets.some((t) => (username && t.username === username) || (id && String(t.id) === id))) return false;
      db.targets.push({ ...(id ? { id } : { username }), name: arg("--name")?.trim() ?? "", note: arg("--note")?.trim() ?? "", addedAt: new Date().toISOString() });
      return true;
    });
    const label = id ? `id ${id}` : `@${username}`;
    console.log(added ? `added ${label}; the next GitHub poll looks them up` : `${label} is already in the list`);
  } else if (cmd === "remove") {
    const id = arg("--id")?.trim();
    const username = id ? "" : norm(process.argv[3]);
    const removed = await mutate((db) => {
      const before = db.targets.length;
      db.targets = db.targets.filter((t) => !((username && t.username === username) || (id && String(t.id) === id)));
      return before !== db.targets.length;
    });
    console.log(removed ? `removed ${id ? "id " + id : "@" + username}` : "not found");
  } else if (cmd === "list") {
    const db = await load();
    if (db.targets.length === 0) console.log("no targets yet; add one with: npm run targets -- add @username");
    for (const t of db.targets) {
      const token = t.id && key ? tokenFor(key, String(t.id)) : "(looked up by CI)";
      console.log(`${token}\t${targetKey(t) ?? "-"}\t${t.name || ""}${t.note ? `\t(${t.note})` : ""}`);
    }
  } else if (cmd === "self") {
    const on = process.argv[3] !== "off";
    await mutate((db) => {
      db.settings = { ...(db.settings ?? {}), trackSelf: on };
    });
    console.log(on ? "the polling account itself will be tracked" : "the polling account itself will not be tracked");
  } else if (cmd === "sync") {
    if (!key) {
      console.error("TG_DATA_KEY missing in .env; run `npm run targets -- keygen` first");
      process.exit(1);
    }
    const db = await load();
    const keys = db.targets.map(targetKey).filter(Boolean);
    if (db.settings?.trackSelf !== false) keys.push("me");
    setSecret("TG_TARGETS", JSON.stringify(keys));
    setSecret("TG_DATA_KEY", key);
    await mutate((db) => {
      db.lastSync = { at: new Date().toISOString(), usernames: keys };
    });
    console.log(`synced ${keys.length} target(s) and the data key to ${REPO}`);
  } else {
    console.log("commands: keygen | add @username | add --id N | remove @username | remove --id N | list | self on|off | sync");
    process.exit(1);
  }
} catch (e) {
  console.error(e?.errorMessage ?? e?.message ?? String(e));
  process.exit(1);
}
process.exit(0);
