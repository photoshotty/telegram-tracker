"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, QrCode, ShieldCheck, X } from "lucide-react";
import { cancelLogin, finishLogin, getLoginState, startLogin, submitLoginPassword } from "@/app/actions";
import type { LoginState } from "@/lib/ops";
import { Button, Card, CardBody, Dot, SectionHeader, TextButton, inputClass } from "./ui";

// Creates or renews the Telegram session that GitHub Actions polls with. Nothing is stored on this PC.
export function LoginPanel({
  session,
  hasApiKeys,
}: {
  session: { name: string; username: string | null; at: string } | null;
  hasApiKeys: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoginState | null>(null);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const active = !!state && ["starting", "qr", "password"].includes(state.phase);
  const phase = state?.phase;

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

  // Once the server re-rendered with the new session info, collapse back to the status line.
  useEffect(() => {
    if (phase === "done" && session) setState(null);
  }, [phase, session]);

  useEffect(() => {
    if (phase === "password") setPassword("");
  }, [phase, state?.updatedAt]);

  const begin = () =>
    start(async () => {
      setPassword("");
      setState(await startLogin());
    });

  // Collapsed: a quiet one-line footer, since renewing is a once-in-a-while chore.
  if (!state) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-1 text-xs text-neutral-600">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/80" />
        <span>
          Telegram session for GitHub:{" "}
          {session ? (
            <>
              <span className="text-neutral-400">{session.name || "set"}</span>
              {session.username ? <span> @{session.username}</span> : null}
              <span> · renewed {new Date(session.at).toLocaleDateString()}</span>
            </>
          ) : (
            <span className="text-neutral-400">configured</span>
          )}
        </span>
        <TextButton
          onClick={begin}
          disabled={pending || !hasApiKeys}
          title="Only needed if Telegram ever revokes the session GitHub uses"
          className="ml-auto"
        >
          Renew via QR
        </TextButton>
      </div>
    );
  }

  return (
    <Card className="panel-in">
      <SectionHeader
        icon={<QrCode className="h-4 w-4" />}
        title="Renew GitHub session"
        hint="the new session goes straight into the GitHub secret; nothing is kept on this PC"
      >
        <button
          type="button"
          className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-200"
          onClick={active ? () => start(async () => setState(await cancelLogin())) : () => setState(null)}
          aria-label={active ? "Cancel" : "Close"}
        >
          <X className="h-4 w-4" />
        </button>
      </SectionHeader>
      <CardBody>
        {state.phase === "idle" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-neutral-400">Scan a QR code with your phone to create a fresh session for GitHub Actions.</p>
            <Button variant="primary" onClick={begin} disabled={pending} className="ml-auto">
              <QrCode className="h-3.5 w-3.5" /> Show QR code
            </Button>
          </div>
        ) : state.phase === "starting" ? (
          <div className="inline-flex items-center gap-2 text-sm text-neutral-400">
            <Dot className="animate-pulse bg-sky-400" /> Talking to Telegram…
          </div>
        ) : state.phase === "qr" ? (
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qrDataUrl} alt="Telegram login QR code" className="h-64 w-64 rounded-xl bg-white p-2.5" />
            <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300 marker:text-neutral-600">
              <li>Open Telegram on your phone</li>
              <li>
                Settings → Devices → <span className="text-neutral-100">Link Desktop Device</span>
              </li>
              <li>Point the camera at this code</li>
              <li className="text-neutral-500">The code refreshes on its own every ~30 s. The old GitHub session is replaced.</li>
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
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} w-56`} />
            <Button type="submit" variant="primary" disabled={pending || !password}>
              Continue
            </Button>
            {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
          </form>
        ) : state.phase === "done" ? (
          <div className="text-sm text-emerald-300">Session renewed{state.name ? ` for ${state.name}` : ""} and stored in GitHub. Refreshing…</div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-red-300">Failed: {state.error}</span>
            <Button onClick={begin} className="ml-auto">
              Try again
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
