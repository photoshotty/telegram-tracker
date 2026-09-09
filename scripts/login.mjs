// One-time interactive login with a code sent to your Telegram app / SMS.
// If Telegram answers FLOOD_WAIT (too many code requests), use `npm run login:qr` instead.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const rl = readline.createInterface({ input, output });

const apiId = Number(process.env.TG_API_ID || (await rl.question("api_id: ")));
const apiHash = process.env.TG_API_HASH || (await rl.question("api_hash: "));

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
  deviceModel: "Desktop",
  systemVersion: "Windows 11",
  appVersion: "1.0.0",
});
client.setLogLevel("error");

try {
  await client.start({
    phoneNumber: () => rl.question("Phone number with country code (e.g. +12025550123): "),
    password: () => rl.question("2FA password (press Enter if none): "),
    phoneCode: () => rl.question("Login code (arrives in your Telegram app): "),
    onError: async (e) => {
      if (e?.errorMessage?.startsWith("FLOOD_WAIT")) {
        const hours = (e.seconds / 3600).toFixed(1);
        console.error(`\nTelegram is rate-limiting login codes for this number: wait ${hours} h, or run \`npm run login:qr\` now (QR login is not affected).`);
        return true; // stop
      }
      console.error("Login error:", e?.message ?? e);
      return false; // let it retry
    },
  });
} catch (e) {
  if (!String(e?.message).includes("AUTH_USER_CANCEL")) console.error("\nLogin failed:", e?.message ?? e);
  await client.disconnect();
  process.exit(1);
}

console.log("\nLogged in. If this session is for THIS PC, put the line in .env; if it is for CI, put it ONLY in the GitHub secret TG_SESSION. Never both:\n");
console.log("TG_SESSION=" + client.session.save());
console.log("\nNever use the same session from two places at the same time.");

await client.disconnect();
rl.close();
process.exit(0);
