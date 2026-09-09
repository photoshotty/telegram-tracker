// One-time login by scanning a QR code with the Telegram app.
// Uses auth.exportLoginToken, so it is not affected by FLOOD_WAIT on auth.sendCode.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import qrcode from "qrcode-terminal";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
if (!apiId || !apiHash) {
  console.error("Set TG_API_ID and TG_API_HASH in .env first (see .env.example)");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
  deviceModel: "Desktop",
  systemVersion: "Windows 11",
  appVersion: "1.0.0",
});
client.setLogLevel("error");
await client.connect();

let shown = 0;
let user;
try {
  user = await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token }) => {
        const url = `tg://login?token=${token.toString("base64url")}`;
        shown += 1;
        console.log(`\nQR code #${shown} (a fresh one appears every ~30 s until you scan).`);
        console.log("Phone: Telegram > Settings > Devices > Link Desktop Device > scan this:\n");
        qrcode.generate(url, { small: true });
        console.log(`\nIf the QR does not scan, this is its content: ${url}`);
      },
      password: async (hint) => rl.question(`2FA password${hint ? ` (hint: ${hint})` : ""}: `),
      onError: async (e) => {
        console.error("Login error:", e?.message ?? e);
        return true; // stop
      },
    },
  );
} catch (e) {
  console.error("\nQR login failed:", e?.message ?? e);
  await client.disconnect();
  process.exit(1);
}

console.log(`\nLogged in as ${[user.firstName, user.lastName].filter(Boolean).join(" ")} (id ${user.id}).`);
console.log("\nAdd this line to .env and to the GitHub secret TG_SESSION:\n");
console.log("TG_SESSION=" + client.session.save());
console.log("\nNever use the same session from two places at the same time.");

await client.disconnect();
rl.close();
process.exit(0);
