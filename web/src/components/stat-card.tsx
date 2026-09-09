import * as React from "react";
import { Card, CardBody } from "./ui";

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
    <Card>
      <CardBody>
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-500">
          <span className="text-neutral-600">{icon}</span>
          {label}
        </div>
        <div className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-100">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-neutral-500">{hint}</div> : null}
      </CardBody>
    </Card>
  );
}
