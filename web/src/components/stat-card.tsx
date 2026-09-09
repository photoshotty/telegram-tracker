import * as React from "react";
import { Card } from "./ui";

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        <span className="text-neutral-600">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-50">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-neutral-500" title={hint}>{hint}</div> : null}
    </Card>
  );
}
