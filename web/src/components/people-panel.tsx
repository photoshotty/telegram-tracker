"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CloudUpload, Search, Trash2, UserPlus, Users } from "lucide-react";
import { addTarget, removeTarget, setTrackSelf, syncTargets } from "@/app/actions";
import type { ChatEntry } from "@/lib/data";
import { Badge, Button, Card, CardBody, CardHeader, cn } from "./ui";

export type PersonRow = {
  username: string;
  name: string;
  telegramName: string | null;
  note?: string;
  id?: string;
  token: string | null;
  hasData: boolean;
  isMe: boolean;
  status: "tracked" | "pending" | "failed";
  failure?: string;
};

const inputCls = "h-8 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-600";
const SOURCE_LABEL: Record<ChatEntry["source"], string> = { forward: "forwarded message", card: "contact card", contact: "contact", chat: "chat" };

export function PeoplePanel({
  people,
  found,
  foundUpdatedAt,
  trackSelf,
  needsSync,
  lastSyncAt,
}: {
  people: PersonRow[];
  found: ChatEntry[];
  foundUpdatedAt: number | null;
  trackSelf: boolean;
  needsSync: boolean;
  lastSyncAt: string | null;
}) {
  const [mode, setMode] = useState<"username" | "found">("username");
  const [username, setUsername] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const trackedIds = useMemo(() => new Set(people.map((p) => p.id).filter(Boolean)), [people]);
  const pickable = useMemo(() => {
    const order = { forward: 0, card: 1, contact: 2, chat: 3 };
    return found.filter((c) => !trackedIds.has(c.id)).sort((a, b) => order[a.source] - order[b.source] || a.name.localeCompare(b.name));
  }, [found, trackedIds]);
  const canSubmit = mode === "found" ? !!pickedId : !!username.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addTarget(mode === "found" ? { id: pickedId, name, note } : { username, name, note });
      setMsg({ ok: r.ok, text: r.output });
      if (r.ok) {
        setUsername("");
        setPickedId("");
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
        <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-neutral-500" title="Turn off when a separate account does the polling">
          <input
            type="checkbox"
            checked={trackSelf}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const r = await setTrackSelf(e.target.checked);
                setMsg({ ok: r.ok, text: r.output });
              })
            }
          />
          also track the polling account itself
        </label>
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          {needsSync ? <Badge variant="warn">not synced to GitHub</Badge> : lastSyncAt ? <span>synced {new Date(lastSyncAt).toLocaleString()}</span> : null}
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await syncTargets();
                setMsg({ ok: r.ok, text: r.output });
              })
            }
            title="Push the list and data key to the GitHub secrets"
          >
            <CloudUpload className="h-3.5 w-3.5" /> Sync
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 text-xs text-neutral-500">
            <span className="flex gap-3">
              <button type="button" onClick={() => setMode("username")} className={cn("hover:text-neutral-300", mode === "username" && "text-neutral-200 underline underline-offset-4")}>
                @username or t.me link
              </button>
              <button type="button" onClick={() => setMode("found")} className={cn("inline-flex items-center gap-1 hover:text-neutral-300", mode === "found" && "text-neutral-200 underline underline-offset-4")}>
                <Search className="h-3 w-3" /> no username: found by GitHub
              </button>
            </span>
            {mode === "found" ? (
              <select value={pickedId} onChange={(e) => setPickedId(e.target.value)} className={cn(inputCls, "w-72")}>
                <option value="">{pickable.length ? `choose (${pickable.length})…` : "nobody found yet"}</option>
                {pickable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || `User ${c.id}`}
                    {c.username ? ` (@${c.username})` : ""} · {SOURCE_LABEL[c.source]}
                  </option>
                ))}
              </select>
            ) : (
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@durov" className={cn(inputCls, "w-72")} />
            )}
          </div>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Display name (optional)
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="taken from their profile" className={cn(inputCls, "w-44")} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="friend, colleague…" className={cn(inputCls, "w-44")} />
          </label>
          <Button type="submit" disabled={pending || !canSubmit} title="Save and push to GitHub; the next poll looks them up">
            <UserPlus className="h-3.5 w-3.5" /> {pending ? "Working…" : "Add"}
          </Button>
        </form>
        {mode === "found" ? (
          <p className="-mt-2 text-xs text-neutral-600">
            From your main account, forward any message from the person (or share their contact card) to the polling account, press <span className="text-neutral-400">Poll now</span>, then pick them here. GitHub also lists the polling account&apos;s own contacts and chats
            {foundUpdatedAt ? ` (last scan ${new Date(foundUpdatedAt * 1000).toLocaleString()})` : ""}. If someone hides &quot;forwarded messages&quot; in their privacy, the forward shows no account and you need their @username or contact card instead.
          </p>
        ) : null}

        {msg ? <div className={cn("text-xs", msg.ok ? "text-emerald-300" : "text-red-300")}>{msg.text}</div> : null}

        {people.length > 0 ? (
          <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-900">
            {people.map((p) => (
              <li key={p.id ?? p.username} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-neutral-100">
                    {p.name}
                    {p.isMe ? <span className="ml-1.5 text-xs text-neutral-500">(polling account)</span> : null}
                    {p.telegramName && p.telegramName !== p.name ? <span className="ml-1.5 text-xs text-neutral-500">{p.telegramName}</span> : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {p.username ? `@${p.username}` : "no username"}
                    {p.id ? ` · id ${p.id}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.token ? ` · folder ${p.token}` : ""}
                  </div>
                </div>
                {p.status === "failed" ? (
                  <span className="text-xs text-red-300" title={p.failure}>
                    {p.failure ?? "not found"}
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
                {!p.isMe && (p.username || p.id) ? (
                  <button
                    type="button"
                    disabled={pending}
                    title="Stop tracking (existing data stays)"
                    className="text-neutral-600 hover:text-red-300"
                    onClick={() => {
                      if (!confirm(`Stop tracking ${p.name}?`)) return;
                      start(async () => {
                        const r = await removeTarget(p.username ? { username: p.username } : { id: p.id });
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
          Adding someone stores them on this PC and in a GitHub secret. GitHub looks them up on its next poll and publishes an encrypted name map only your key can read; the public repo shows nothing but folder tokens.
        </p>
      </CardBody>
    </Card>
  );
}
