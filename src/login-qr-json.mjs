// QR login driven over stdio JSON lines. Spawned by the dashboard (web/src/lib/ops.ts) to
// create or renew the session that GitHub Actions uses. The session string never touches
// the local .env: on success it is pushed straight into the GitHub secret TG_SESSION.
//   argv: --repo owner/name
//   stdout: {"type":"qr","url":"tg://login?token=..."} | {"type":"password","hint":"","error":null|"..."}
//           {"type":"done","id":"...","name":"...","username":...} | {"type":"error","message":"..."}
//   stdin:  {"type":"password","value":"..."} | {"type":"cancel"}
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { ghEnvFor } from "./gh.mjs";

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
const repoIdx = process.argv.indexOf("--repo");
const repo = repoIdx >= 0 ? process.argv[repoIdx + 1] : process.env.GH_REPO;
if (!apiId || !apiHash) {
  emit({ type: "error", message: "TG_API_ID / TG_API_HASH are missing in .env" });
  process.exit(1);
}
if (!repo) {
  emit({ type: "error", message: "no GitHub repo given (--repo owner/name)" });
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

async function rememberCiSession(info) {
  let db = { targets: [] };
  try {
    db = JSON.parse(await readFile("targets.local.json", "utf8"));
  } catch {}
  db.ciSession = { ...info, at: new Date().toISOString() };
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
  const session = client.session.save();
  execFileSync("gh", ["secret", "set", "TG_SESSION", "-R", repo], { input: session, stdio: ["pipe", "ignore", "pipe"], env: ghEnvFor(repo) });
  await rememberCiSession(info);
  emit({ type: "done", ...info });
} catch (e) {
  if (!fatal) emit({ type: "error", message: e?.errorMessage ?? e?.stderr?.toString?.() ?? e?.message ?? String(e) });
  process.exitCode = 1;
} finally {
  try {
    await client.disconnect();
  } catch {}
  process.exit();
}
