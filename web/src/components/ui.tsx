import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-neutral-800 bg-neutral-900/60", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border-b border-neutral-800 px-5 py-3", className)}>{children}</div>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function Badge({
  variant = "muted",
  children,
}: {
  variant?: "muted" | "online" | "warn";
  children: React.ReactNode;
}) {
  const styles = {
    muted: "border-neutral-800 bg-neutral-900 text-neutral-400",
    online: "border-sky-500/50 bg-sky-500/10 text-sky-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  }[variant];
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums", styles)}>
      {children}
    </span>
  );
}

export function IconButton({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Button({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:text-neutral-50 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-neutral-200">{title}</div>
      {description ? <div className="mt-1 text-xs text-neutral-500">{description}</div> : null}
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("live-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400", className)} />;
}

export const ACCENT = "#38bdf8"; // sky-400, one color since there is one "platform"
