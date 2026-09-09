"use server";

import { execFile } from "node:child_process";
import { revalidatePath } from "next/cache";
import { ROOT } from "@/lib/data";

// Local-only convenience: fetch the newest samples the GitHub Action committed.
export async function pullLatest(): Promise<{ ok: boolean; output: string }> {
  const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
    execFile("git", ["pull", "--rebase", "--quiet"], { cwd: ROOT, timeout: 60_000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
      resolve({ ok: !err, output: err ? output || err.message : output });
    });
  });
  revalidatePath("/", "layout");
  return result;
}
