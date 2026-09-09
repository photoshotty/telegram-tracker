"use client";

import { useState, useTransition } from "react";
import { Play, RefreshCw } from "lucide-react";
import { pollNow, pullLatest } from "@/app/actions";
import { Button, cn } from "./ui";

export function HeaderActions() {
  const [pulling, startPull] = useTransition();
  const [polling, startPoll] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const busy = pulling || polling;
  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span className="hidden max-w-[22rem] truncate text-xs text-neutral-500 sm:block" title={msg}>
          {msg}
        </span>
      ) : null}
      <Button
        disabled={busy}
        title="Trigger the GitHub Action now, wait for it, then pull the result"
        onClick={() =>
          startPoll(async () => {
            setMsg("starting a poll on GitHub…");
            const r = await pollNow();
            setMsg(r.output);
          })
        }
      >
        <Play className={cn("h-3.5 w-3.5", polling && "animate-pulse")} />
        {polling ? "Polling…" : "Poll now"}
      </Button>
      <Button
        disabled={busy}
        title="git pull the samples the GitHub Action committed"
        onClick={() =>
          startPull(async () => {
            const r = await pullLatest();
            setMsg(r.ok ? r.output : `git pull failed: ${r.output}`);
          })
        }
      >
        <RefreshCw className={cn("h-3.5 w-3.5", pulling && "animate-spin")} />
        {pulling ? "Pulling…" : "Pull latest"}
      </Button>
    </div>
  );
}
