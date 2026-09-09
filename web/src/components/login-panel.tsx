"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, QrCode, X } from "lucide-react";
import { cancelLogin, finishLogin, getLoginState, startLogin, submitLoginPassword } from "@/app/actions";
import type { LoginState } from "@/lib/ops";
import { Button, Card, CardBody, CardHeader } from "./ui";

export function LoginPanel({
  loggedIn,
  session,
  hasApiKeys,
}: {
  loggedIn: boolean;
  session: { name: string; username: string | null; at: string } | null;
  hasApiKeys: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoginState | null>(null);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const active = !!state && ["starting", "qr", "password"].includes(state.phase);
  const phase = state?.phase;

  // Poll the server-side worker while a login is in flight.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      const s = await getLoginState();
      setState(s);
      if (s.phase === "done") {
        await finishLogin();
        router.refresh();
      }
    }, 1500);
    return () => clearInterval(id);
  }, [active, router]);

  // Once the server re-rendered with the new session, drop the local flow state.
  useEffect(() => {
    if (loggedIn && phase === "done") setState(null);
  }, [loggedIn, phase]);

  // A fresh password prompt (first or after a wrong attempt) starts with an empty field.
  useEffect(() => {
    if (phase === "password") setPassword("");
  }, [phase, state?.updatedAt]);

  const begin = () =>
    start(async () => {
      setPassword("");
      setState(await startLogin());
    });

  if (loggedIn && !state) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-xs text-neutral-500">
        <LogIn className="h-3.5 w-3.5 text-emerald-400" />
        <span>
          Local Telegram login: <span className="text-neutral-300">{session?.name || "ready"}</span>
          {session?.username ? <span className="text-neutral-500"> @{session.username}</span> : null}
          {session?.at ? <span> · since {new Date(session.at).toLocaleDateString()}</span> : null}
        </span>
        <button type="button" onClick={begin} className="ml-auto text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline">
          re-login
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Telegram login</h2>
        <span className="ml-1 text-xs text-neutral-500">needed once, only to look up people you add</span>
        {active ? (
          <button
            type="button"
            className="ml-auto text-neutral-500 hover:text-neutral-200"
            onClick={() => start(async () => setState(await cancelLogin()))}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </CardHeader>
      <CardBody>
        {!hasApiKeys ? (
          <div className="text-sm text-amber-200">
            TG_API_ID / TG_API_HASH are missing from the root <code>.env</code>. Get them at https://my.telegram.org/apps first.
          </div>
        ) : !state || state.phase === "idle" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-neutral-400">
              {loggedIn ? "Create a fresh session for this PC." : "This PC has no Telegram session yet. Scan a QR code with your phone to create one."}
            </p>
            <Button onClick={begin} disabled={pending} className="ml-auto">
              <QrCode className="h-3.5 w-3.5" /> Show QR code
            </Button>
          </div>
        ) : state.phase === "starting" ? (
          <div className="text-sm text-neutral-400">Talking to Telegram…</div>
        ) : state.phase === "qr" ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qrDataUrl} alt="Telegram login QR code" className="h-[280px] w-[280px] rounded-lg bg-white p-2" />
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
              <li>Open Telegram on your phone</li>
              <li>
                Settings → Devices → <span className="text-neutral-100">Link Desktop Device</span>
              </li>
              <li>Point the camera at this code</li>
              <li className="text-neutral-500">The code refreshes on its own every ~30 s.</li>
            </ol>
          </div>
        ) : state.phase === "password" ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => setState(await submitLoginPassword(password)));
            }}
          >
            <KeyRound className="h-4 w-4 text-neutral-500" />
            <span className="text-sm text-neutral-300">Two-step password{state.hint ? ` (hint: ${state.hint})` : ""}</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-8 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
            <Button type="submit" disabled={pending || !password}>
              Continue
            </Button>
            {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
          </form>
        ) : state.phase === "done" ? (
          <div className="text-sm text-emerald-300">Logged in{state.name ? ` as ${state.name}` : ""}. Refreshing…</div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-red-300">Login failed: {state.error}</span>
            <Button onClick={begin} className="ml-auto">
              Try again
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
