"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CloudUpload, Trash2, UserPlus, Users } from "lucide-react";
import { addTarget, removeTarget, syncTargets } from "@/app/actions";
import { Badge, Button, Card, CardBody, CardHeader, cn } from "./ui";

export type PersonRow = {
  username: string;
  name: string; // what to show: your custom name, else the Telegram name, else @username
  telegramName: string | null;
  note?: string;
  id?: string;
  token: string | null;
  hasData: boolean;
  isMe: boolean;
  status: "tracked" | "pending" | "failed";
  failure?: string;
};

export function PeoplePanel({
  people,
  needsSync,
  lastSyncAt,
}: {
  people: PersonRow[];
  needsSync: boolean;
  lastSyncAt: string | null;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addTarget({ username, name, note });
      setMsg({ ok: r.ok, text: r.output });
      if (r.ok) {
        setUsername("");
        setName("");
        setNote("");
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">People</h2>
        <Badge>{people.length}</Badge>
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          {needsSync ? (
            <Badge variant="warn">not synced to GitHub</Badge>
          ) : lastSyncAt ? (
            <span>synced {new Date(lastSyncAt).toLocaleString()}</span>
          ) : null}
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await syncTargets();
                setMsg({ ok: r.ok, text: r.output });
              })
            }
            title="Push the username list and data key to the GitHub secrets"
          >
            <CloudUpload className="h-3.5 w-3.5" /> Sync
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            @username or t.me link
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@durov"
              required
              className="h-8 w-48 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Display name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="taken from their profile"
              className="h-8 w-48 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="friend, colleague…"
              className="h-8 w-48 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
          </label>
          <Button type="submit" disabled={pending || !username.trim()} title="Save and push to GitHub; the next poll looks them up">
            <UserPlus className="h-3.5 w-3.5" /> {pending ? "Working…" : "Add"}
          </Button>
        </form>

        {msg ? <div className={cn("text-xs", msg.ok ? "text-emerald-300" : "text-red-300")}>{msg.text}</div> : null}

        {people.length > 0 ? (
          <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-900">
            {people.map((p) => (
              <li key={p.username || p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-neutral-100">
                    {p.name}
                    {p.isMe ? <span className="ml-1.5 text-xs text-neutral-500">(me)</span> : null}
                    {p.telegramName && p.telegramName !== p.name ? <span className="ml-1.5 text-xs text-neutral-500">{p.telegramName}</span> : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {p.username ? `@${p.username}` : ""}
                    {p.id ? ` · id ${p.id}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.token ? ` · folder ${p.token}` : ""}
                  </div>
                </div>
                {p.status === "failed" ? (
                  <span className="text-xs text-red-300" title={p.failure}>
                    not found on Telegram
                  </span>
                ) : p.status === "pending" ? (
                  <span className="text-xs text-amber-300" title="GitHub looks new people up on its next poll (press Poll now to hurry)">
                    waiting for next poll
                  </span>
                ) : p.hasData && p.token ? (
                  <Link href={`/u/${p.token}`} className="text-xs text-sky-300 hover:underline">
                    open
                  </Link>
                ) : (
                  <span className="text-xs text-neutral-600">no data yet</span>
                )}
                {!p.isMe && p.username ? (
                  <button
                    type="button"
                    disabled={pending}
                    title="Stop tracking (existing data stays)"
                    className="text-neutral-600 hover:text-red-300"
                    onClick={() => {
                      if (!confirm(`Stop tracking @${p.username}?`)) return;
                      start(async () => {
                        const r = await removeTarget(p.username);
                        setMsg({ ok: r.ok, text: r.output });
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-neutral-600">
          Adding someone stores the username on this PC and in a GitHub secret. GitHub looks them up on its next poll and publishes an encrypted name map only your key can read; the public repo shows nothing but folder tokens.
        </p>
      </CardBody>
    </Card>
  );
}
