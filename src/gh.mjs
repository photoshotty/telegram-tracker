// Run the GitHub CLI as the repo owner's account, whatever account is currently "active"
// in gh (this machine has several). Falls back to the ambient environment.
import { execFileSync } from "node:child_process";

export function ghEnvFor(repo) {
  const env = { ...process.env };
  if (env.GH_TOKEN) return env;
  const owner = String(repo ?? "").split("/")[0];
  if (!owner) return env;
  try {
    const token = execFileSync("gh", ["auth", "token", "--user", owner], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (token) env.GH_TOKEN = token;
  } catch {}
  return env;
}
