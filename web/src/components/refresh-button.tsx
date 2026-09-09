"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { pullLatest } from "@/app/actions";
import { Button, cn } from "./ui";

export function RefreshButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg ? <span className="max-w-[16rem] truncate text-xs text-neutral-500" title={msg}>{msg}</span> : null}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await pullLatest();
            setMsg(r.ok ? r.output || "up to date" : `git pull failed: ${r.output}`);
          })
        }
      >
        <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
        {pending ? "Pulling…" : "Pull latest"}
      </Button>
    </div>
  );
}
