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

export async function addTarget(input: { username: string; name?: string; note?: string }) {
  const username = input.username
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "");
  if (!/^[a-z0-9_]{4,32}$/i.test(username)) return { ok: false, output: "enter a Telegram @username or t.me link (4-32 letters, digits or _)" };
  const r = await ops.addTarget({ ...input, username });
  revalidatePath("/", "layout");
  return r;
}

export async function removeTarget(username: string) {
  const r = await ops.removeTarget(username);
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
  // called by the client once phase === "done" so server components re-read .env / targets
  revalidatePath("/", "layout");
  return ops.cancelLogin();
}
