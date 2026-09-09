// QR login driven over stdio JSON lines. Spawned by the dashboard (web/src/lib/ops.ts).
//   stdout: {"type":"qr","url":"tg://login?token=..."} | {"type":"password","hint":"","error":null|"..."}
//           {"type":"done","id":"...","name":"...","username":...} | {"type":"error","message":"..."}
//   stdin:  {"type":"password","value":"..."} | {"type":"cancel"}
// On success it writes TG_SESSION into .env and localSession into targets.local.json (cwd = repo root).
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
if (!apiId || !apiHash) {
  emit({ type: "error", message: "TG_API_ID / TG_API_HASH are missing in .env" });
  process.exit(1);
}

let passwordResolve = null;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  try {
    const m = JSON.parse(line);
    if (m.type === "password" && passwordResolve) {
      passwordResolve(String(m.value ?? ""));
      passwordResolve = null;
    } else if (m.type === "cancel") {
      process.exit(2);
    }
  } catch {}
});

async function upsertEnv(key, value) {
  let text = "";
  try {
    text = await readFile(".env", "utf8");
  } catch {}
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(key + "="));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  await writeFile(".env", lines.join("\n").replace(/\n*$/, "\n"));
}

async function rememberLocalSession(info) {
  let db = { targets: [] };
  try {
    db = JSON.parse(await readFile("targets.local.json", "utf8"));
  } catch {}
  db.localSession = { ...info, at: new Date().toISOString() };
  if (!db.me) db.me = info.id;
  if (!Array.isArray(db.targets)) db.targets = [];
  if (!db.targets.some((t) => String(t.id) === info.id)) {
    db.targets.push({ id: info.id, username: info.username ?? "", name: info.name || "Me", note: "my own account", addedAt: new Date().toISOString() });
  }
  await writeFile("targets.local.json", JSON.stringify(db, null, 2) + "\n");
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
  deviceModel: "Desktop",
  systemVersion: "Windows 11",
  appVersion: "1.0.0",
});
client.setLogLevel("error");

let lastPasswordError = null;
let fatal = false;

try {
  await client.connect();
  const user = await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token }) => emit({ type: "qr", url: `tg://login?token=${token.toString("base64url")}` }),
      password: async (hint) => {
        emit({ type: "password", hint: hint ?? "", error: lastPasswordError });
        lastPasswordError = null;
        return new Promise((resolve) => {
          passwordResolve = resolve;
        });
      },
      onError: async (e) => {
        const msg = e?.errorMessage ?? e?.message ?? String(e);
        if (msg === "PASSWORD_HASH_INVALID" || /password is empty/i.test(msg)) {
          lastPasswordError = "Wrong password, try again";
          return false; // let the library ask for the password again
        }
        fatal = true;
        emit({ type: "error", message: msg });
        return true;
      },
    },
  );
  const info = {
    id: user.id.toString(),
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    username: user.username ? String(user.username).toLowerCase() : null,
  };
  await upsertEnv("TG_SESSION", client.session.save());
  await rememberLocalSession(info);
  emit({ type: "done", ...info });
} catch (e) {
  if (!fatal) emit({ type: "error", message: e?.errorMessage ?? e?.message ?? String(e) });
  process.exitCode = 1;
} finally {
  try {
    await client.disconnect();
  } catch {}
  process.exit();
}
