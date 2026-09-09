// Server-side operations the dashboard buttons call: git pull, GitHub workflow dispatch,
// target management (via scripts/targets.mjs) and the QR login worker (src/login-qr-json.mjs).
// Everything runs as child processes from the repo root so the tested CLI code is reused.
import { spawn, type ChildProcess } from "node:child_process";
import QRCode from "qrcode";
import { ROOT } from "./data";

export type RunResult = { ok: boolean; code: number | null; stdout: string; stderr: string };

export function run(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      resolve({ ok: false, code: null, stdout, stderr: (e as Error).message });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, opts.timeoutMs ?? 90_000);
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: stderr + e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

export const runNode = (script: string, args: string[] = [], opts: { timeoutMs?: number } = {}) =>
  run(process.execPath, ["--env-file-if-exists=.env", script, ...args], opts);

// Strip the library's coloured INFO banner and blank lines, keep what a human wants to read.
export function tidy(r: RunResult): string {
  const text = (r.stdout + "\n" + r.stderr)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/Running teleproto version|\.env not found|^> /.test(l));
  return text.join(" · ");
}

// ---------- git / GitHub ----------

const g = globalThis as unknown as {
  __tgLastPull?: number;
  __tgLastPullError?: string | null;
  __tgRepo?: string;
  __tgLogin?: { state: LoginState; child: ChildProcess | null; lastStderr: string };
};

export async function repoSlug(): Promise<string> {
  if (g.__tgRepo) return g.__tgRepo;
  const r = await run("git", ["remote", "get-url", "origin"], { timeoutMs: 10_000 });
  const m = r.stdout.match(/github\.com[:/]([^/\s]+)\/([^/\s.]+)/);
  g.__tgRepo = m ? `${m[1]}/${m[2]}` : (process.env.GH_REPO ?? "photoshotty/telegram-tracker");
  return g.__tgRepo;
}

const UNMERGED = /^(DD|AU|UD|UA|DU|AA|UU) /m;

async function unmergedFiles(): Promise<string[]> {
  const st = await run("git", ["status", "--porcelain"], { timeoutMs: 15_000 });
  return st.stdout
    .split(/\r?\n/)
    .filter((l) => UNMERGED.test(l))
    .map((l) => l.slice(3).trim());
}

export async function pull(): Promise<{ ok: boolean; output: string }> {
  const r = await run("git", ["pull", "--rebase", "--autostash", "--quiet"], { timeoutMs: 60_000 });
  g.__tgLastPull = Date.now();
  const conflicted = /Applying autostash resulted in conflicts/.test(r.stderr) ? await unmergedFiles() : r.ok ? [] : await unmergedFiles();
  if (conflicted.length > 0) {
    const msg = `git pull left conflicts in ${conflicted.join(", ")}. Fix: git checkout --theirs -- ${conflicted.join(" ")} && git add ${conflicted.join(" ")} && git stash drop`;
    g.__tgLastPullError = msg;
    return { ok: false, output: msg };
  }
  const out = tidy(r);
  if (!r.ok) {
    g.__tgLastPullError = out || "git pull failed";
    return { ok: false, output: g.__tgLastPullError };
  }
  g.__tgLastPullError = null;
  return { ok: true, output: out || "up to date" };
}

export function lastPullError(): string | null {
  return g.__tgLastPullError ?? null;
}

// Called by pages: refresh from GitHub at most once a minute; failures are shown by the page.
export async function maybePull(minIntervalMs = 60_000): Promise<void> {
  const now = Date.now();
  if (g.__tgLastPull && now - g.__tgLastPull < minIntervalMs) return;
  g.__tgLastPull = now;
  await pull();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newestRun(slug: string): Promise<{ id: number; status: string; conclusion: string } | null> {
  const r = await run("gh", ["run", "list", "-R", slug, "-w", "poll.yml", "-L", "1", "--json", "databaseId,status,conclusion"], { timeoutMs: 30_000 });
  try {
    const arr = JSON.parse(r.stdout) as Array<{ databaseId: number; status: string; conclusion: string }>;
    return arr[0] ? { id: arr[0].databaseId, status: arr[0].status, conclusion: arr[0].conclusion } : null;
  } catch {
    return null;
  }
}

// Dispatch the workflow, wait for that run to finish, then pull its commit.
export async function pollNow(): Promise<{ ok: boolean; output: string }> {
  const slug = await repoSlug();
  const before = await newestRun(slug);
  const dispatch = await run("gh", ["workflow", "run", "poll.yml", "-R", slug], { timeoutMs: 30_000 });
  if (!dispatch.ok) return { ok: false, output: tidy(dispatch) || "could not start the workflow (is the GitHub CLI logged in?)" };
  const deadline = Date.now() + 150_000;
  let seen = false;
  while (Date.now() < deadline) {
    await sleep(5_000);
    const cur = await newestRun(slug);
    if (!cur || (before && cur.id === before.id)) continue;
    seen = true;
    if (cur.status === "completed") {
      const p = await pull();
      return { ok: cur.conclusion === "success" && p.ok, output: `run ${cur.conclusion} · ${p.output}` };
    }
  }
  return { ok: false, output: seen ? "run still in progress; press Pull latest in a minute" : "run did not start yet (GitHub queue); try Pull latest later" };
}

// ---------- targets ----------

export async function addTarget(input: { username: string; name?: string; note?: string }) {
  const args = ["add", input.username.trim()];
  if (input.name?.trim()) args.push("--name", input.name.trim());
  if (input.note?.trim()) args.push("--note", input.note.trim());
  const r = await runNode("scripts/targets.mjs", args, { timeoutMs: 60_000 });
  if (!r.ok) return { ok: false, output: tidy(r) || "add failed" };
  const s = await syncTargets();
  return { ok: s.ok, output: `${tidy(r)} · ${s.output}` };
}

export async function removeTarget(username: string) {
  const r = await runNode("scripts/targets.mjs", ["remove", username], { timeoutMs: 30_000 });
  if (!r.ok) return { ok: false, output: tidy(r) || "remove failed" };
  const s = await syncTargets();
  return { ok: s.ok, output: `${tidy(r)} · ${s.output}` };
}

export async function syncTargets() {
  const r = await runNode("scripts/targets.mjs", ["sync"], { timeoutMs: 60_000 });
  return { ok: r.ok, output: tidy(r) || (r.ok ? "synced" : "sync failed") };
}

// ---------- QR login worker ----------

export type LoginState = {
  phase: "idle" | "starting" | "qr" | "password" | "done" | "error";
  qrDataUrl?: string;
  qrUrl?: string;
  hint?: string;
  error?: string;
  name?: string;
  updatedAt: number;
};

type WorkerMessage = { type: string; url?: string; hint?: string; error?: string | null; message?: string; name?: string };

function mgr() {
  if (!g.__tgLogin) g.__tgLogin = { state: { phase: "idle", updatedAt: Date.now() }, child: null, lastStderr: "" };
  return g.__tgLogin;
}

export function loginState(): LoginState {
  return mgr().state;
}

export async function startLogin(): Promise<LoginState> {
  const m = mgr();
  if (m.child && ["starting", "qr", "password"].includes(m.state.phase)) return m.state;
  if (m.child) {
    // a previous worker is still winding down: detach it so its exit cannot touch the new state
    try {
      m.child.kill();
    } catch {}
    m.child = null;
  }
  m.state = { phase: "starting", updatedAt: Date.now() };
  m.lastStderr = "";
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, ["--env-file-if-exists=.env", "src/login-qr-json.mjs"], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (e) {
    m.state = { phase: "error", error: (e as Error).message, updatedAt: Date.now() };
    return m.state;
  }
  m.child = child;
  const mine = () => m.child === child;
  let buf = "";
  child.stdout?.on("data", (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      let msg: WorkerMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // library banner or other noise
      }
      if (mine()) void handleMessage(msg);
    }
  });
  child.stderr?.on("data", (d) => {
    if (mine()) m.lastStderr = String(d).replace(/\x1b\[[0-9;]*m/g, "").trim();
  });
  child.on("close", (code) => {
    if (!mine()) return;
    m.child = null;
    if (m.state.phase !== "done" && m.state.phase !== "idle" && m.state.phase !== "error") {
      m.state = { phase: "error", error: m.lastStderr || `login process exited (${code})`, updatedAt: Date.now() };
    }
  });

  async function handleMessage(msg: WorkerMessage) {
    if (msg.type === "qr" && msg.url) {
      const qrDataUrl = await QRCode.toDataURL(msg.url, { margin: 1, width: 280 });
      if (mine() && m.state.phase !== "password") m.state = { phase: "qr", qrDataUrl, qrUrl: msg.url, updatedAt: Date.now() };
    } else if (msg.type === "password") {
      m.state = { phase: "password", hint: msg.hint ?? "", error: msg.error ?? undefined, updatedAt: Date.now() };
    } else if (msg.type === "done") {
      m.state = { phase: "done", name: msg.name ?? "", updatedAt: Date.now() };
    } else if (msg.type === "error") {
      if (m.state.phase !== "error") m.state = { phase: "error", error: msg.message ?? "login failed", updatedAt: Date.now() };
    }
  }
  return m.state;
}

export function submitLoginPassword(value: string): LoginState {
  const m = mgr();
  if (!m.child || m.state.phase !== "password") return m.state;
  m.child.stdin?.write(JSON.stringify({ type: "password", value }) + "\n");
  m.state = { phase: "starting", updatedAt: Date.now() };
  return m.state;
}

export function cancelLogin(): LoginState {
  const m = mgr();
  if (m.child) {
    try {
      m.child.stdin?.write(JSON.stringify({ type: "cancel" }) + "\n");
      m.child.kill();
    } catch {}
  }
  m.child = null;
  m.state = { phase: "idle", updatedAt: Date.now() };
  return m.state;
}
