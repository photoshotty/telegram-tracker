"use server";

import { revalidatePath } from "next/cache";
import * as ops from "@/lib/ops";

export async function pullLatest() {
  const r = await ops.pull();
  revalidatePath("/", "layout");
  return r;
}

export async function pollNow() {
  const r = await ops.pollNow();
  revalidatePath("/", "layout");
  return r;
}

export async function addTarget(input: { username?: string; id?: string; name?: string; note?: string }) {
  const id = input.id?.trim();
  if (id) {
    if (!/^\d{3,20}$/.test(id)) return { ok: false, output: "invalid Telegram id" };
    const r = await ops.addTarget({ id, name: input.name, note: input.note });
    revalidatePath("/", "layout");
    return r;
  }
  const username = (input.username ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "");
  if (!/^[a-z0-9_]{4,32}$/i.test(username)) return { ok: false, output: "enter a Telegram @username or t.me link (4-32 letters, digits or _), or pick a chat" };
  const r = await ops.addTarget({ username, name: input.name, note: input.note });
  revalidatePath("/", "layout");
  return r;
}

export async function removeTarget(target: { username?: string; id?: string }) {
  const r = await ops.removeTarget(target);
  revalidatePath("/", "layout");
  return r;
}

export async function setTrackSelf(on: boolean) {
  const r = await ops.setTrackSelf(on);
  revalidatePath("/", "layout");
  return r;
}

export async function syncTargets() {
  const r = await ops.syncTargets();
  revalidatePath("/", "layout");
  return r;
}

export async function startLogin() {
  return ops.startLogin();
}

export async function getLoginState() {
  return ops.loginState();
}

export async function submitLoginPassword(value: string) {
  return ops.submitLoginPassword(value);
}

export async function cancelLogin() {
  const s = ops.cancelLogin();
  revalidatePath("/", "layout");
  return s;
}

export async function finishLogin() {
  // called by the client once phase === "done" so server components re-read targets.local.json
  revalidatePath("/", "layout");
  return ops.cancelLogin();
}
