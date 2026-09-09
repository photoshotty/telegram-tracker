"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AtSign, CloudUpload, Plus, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { addTarget, removeTarget, setTrackSelf, syncTargets } from "@/app/actions";
import type { ChatEntry } from "@/lib/data";
import { Avatar, Badge, Button, Card, CardBody, Field, Note, SectionHeader, Segmented, Toggle, cn, inputClass } from "./ui";

export type PersonRow = {
  username: string;
  name: string;
  telegramName: string | null;
  note?: string;
  id?: string;
  token: string | null;
  hasData: boolean;
  isMe: boolean;
  status: "tracked" | "pending" | "failed" | "untracked";
  failure?: string;
};

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
  const [open, setOpen] = useState(false);
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
        setOpen(false);
      }
    });
  };

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={<Users className="h-4 w-4" />} title="People" count={people.length}>
        {needsSync ? (
          <Badge variant="warn">not synced</Badge>
        ) : lastSyncAt ? (
          <span className="hidden text-xs text-neutral-600 sm:block">synced {new Date(lastSyncAt).toLocaleString()}</span>
        ) : null}
        <Button
          variant="ghost"
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
        <Button variant={open ? "default" : "primary"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {open ? "Close" : "Add person"}
        </Button>
      </SectionHeader>

      {open ? (
        <div className="panel-in border-b border-neutral-800/60 bg-neutral-950/40 px-4 py-4 sm:px-5">
          <form onSubmit={submit} className="space-y-4">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "username",
                  label: (
                    <>
                      <AtSign className="h-3 w-3" /> Username
                    </>
                  ),
                },
                {
                  value: "found",
                  label: (
                    <>
                      <Search className="h-3 w-3" /> Found by GitHub
                    </>
                  ),
                },
              ]}
            />

            <div className="flex flex-wrap items-end gap-3">
              <Field label={mode === "found" ? "Person" : "Username or t.me link"} className="w-full sm:w-72">
                {mode === "found" ? (
                  <select value={pickedId} onChange={(e) => setPickedId(e.target.value)} className={inputClass}>
                    <option value="">{pickable.length ? `choose (${pickable.length})…` : "nobody found yet"}</option>
                    {pickable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || `User ${c.id}`}
                        {c.username ? ` (@${c.username})` : ""} · {SOURCE_LABEL[c.source]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@durov" className={inputClass} autoFocus />
                )}
              </Field>
              <Field label="Display name" className="w-full sm:w-44">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="from their profile" className={inputClass} />
              </Field>
              <Field label="Note" className="w-full sm:w-44">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="friend, colleague…" className={inputClass} />
              </Field>
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !canSubmit}
                title="Save and push to GitHub; the next poll looks them up"
                className="w-full sm:w-auto"
              >
                <UserPlus className="h-3.5 w-3.5" /> {pending ? "Working…" : "Add"}
              </Button>
            </div>

            {mode === "found" ? (
              <Note>
                Forward any message from the person to the polling account (or share their contact card), press{" "}
                <span className="text-neutral-400">Poll now</span>, then pick them here. Contacts and chats of the polling account are listed too
                {foundUpdatedAt ? ` — last scan ${new Date(foundUpdatedAt * 1000).toLocaleString()}` : ""}.
              </Note>
            ) : null}
          </form>
        </div>
      ) : null}

      {msg ? (
        <div className={cn("border-b border-neutral-800/60 px-4 py-2 text-xs sm:px-5", msg.ok ? "text-emerald-300" : "text-red-300")}>{msg.text}</div>
      ) : null}

      {people.length > 0 ? (
        <ul className="divide-y divide-neutral-800/50">
          {people.map((p) => (
            <li key={p.id ?? p.username} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-800/20 sm:px-5">
              <Avatar name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-100">
                  {p.name}
                  {p.isMe ? <span className="ml-1.5 text-xs text-neutral-500">polling account</span> : null}
                  {p.telegramName && p.telegramName !== p.name ? <span className="ml-1.5 text-xs text-neutral-500">{p.telegramName}</span> : null}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {p.username ? `@${p.username}` : "no username"}
                  {p.id ? ` · id ${p.id}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </div>
              </div>

              {p.status === "failed" ? (
                <Badge variant="danger" className="max-w-56 truncate">
                  <span className="truncate" title={p.failure}>
                    {p.failure ?? "not found"}
                  </span>
                </Badge>
              ) : p.status === "pending" ? (
                <Badge variant="warn">
                  <span title="GitHub looks new people up on its next poll (press Poll now to hurry)">waiting for next poll</span>
                </Badge>
              ) : p.status === "untracked" ? (
                <Badge variant="warn">
                  <span title="Seen in earlier polls but no longer in your list: add them again to resume">not tracked · add again</span>
                </Badge>
              ) : p.hasData && p.token ? (
                <Link
                  href={`/u/${p.token}`}
                  className="rounded-md px-2 py-1 text-xs text-sky-300 transition-colors hover:bg-sky-500/10 hover:text-sky-200"
                >
                  Open
                </Link>
              ) : (
                <span className="text-xs text-neutral-600">no data yet</span>
              )}

              {!p.isMe && (p.username || p.id) ? (
                <button
                  type="button"
                  disabled={pending}
                  title="Stop tracking (existing data stays)"
                  aria-label={`Stop tracking ${p.name}`}
                  className="rounded-md p-1.5 text-neutral-700 opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => {
                    if (!confirm(`Stop tracking ${p.name}?`)) return;
                    start(async () => {
                      const r = await removeTarget(p.username ? { username: p.username } : { id: p.id });
                      setMsg({ ok: r.ok, text: r.output });
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="w-7.5" />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <CardBody className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-neutral-800/60">
        <Toggle
          checked={trackSelf}
          disabled={pending}
          title="Turn off when a separate account does the polling"
          label="Also track the polling account"
          onChange={(next) =>
            start(async () => {
              const r = await setTrackSelf(next);
              setMsg({ ok: r.ok, text: r.output });
            })
          }
        />
        <Note className="max-w-md text-right">
          Names live on this PC and in a GitHub secret. The public repo only ever shows folder tokens.
        </Note>
      </CardBody>
    </Card>
  );
}
