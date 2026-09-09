import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- surfaces */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-neutral-800/80 bg-neutral-900/30", className)}>{children}</div>;
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-h-13 flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800/60 px-4 py-3 sm:px-5", className)}>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

// One header shape for every section: icon, title, optional count, optional hint, actions on the right.
export function SectionHeader({
  icon,
  title,
  count,
  hint,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader>
      {icon ? <span className="text-neutral-500">{icon}</span> : null}
      <h2 className="text-sm font-semibold tracking-tight text-neutral-100">{title}</h2>
      {count !== undefined ? <Badge>{count}</Badge> : null}
      {hint ? <span className="hidden text-xs text-neutral-500 sm:block">{hint}</span> : null}
      {children ? <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div> : null}
    </CardHeader>
  );
}

/* ------------------------------------------------------------------ badges */

const BADGE_VARIANTS = {
  muted: "border-neutral-800 bg-neutral-900 text-neutral-400",
  online: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
} as const;

export function Badge({
  variant = "muted",
  className,
  children,
}: {
  variant?: keyof typeof BADGE_VARIANTS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular-nums",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- buttons */

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-45";

const BUTTON_VARIANTS = {
  default: "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-neutral-100",
  primary: "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:border-sky-400/50 hover:bg-sky-500/20 hover:text-sky-100",
  ghost: "border-transparent text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100",
  danger: "border-transparent text-neutral-600 hover:bg-red-500/10 hover:text-red-300",
} as const;

const BUTTON_SIZES = { sm: "h-7 px-2 text-xs", md: "h-9 px-3 text-sm" } as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({ className, variant = "default", size = "md", children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ className, variant = "default", size = "md", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], size === "sm" ? "h-7 w-7" : "h-9 w-9", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// Quiet inline action that reads as text, for rare things like "renew" or "cancel".
export function TextButton({ className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded text-xs text-neutral-500 underline-offset-4 outline-none transition-colors hover:text-neutral-200 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ inputs */

export const inputClass =
  "h-9 w-full rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15";

export function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: React.ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
            value === o.value ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full border transition-colors",
          checked ? "border-sky-500/50 bg-sky-500/25" : "border-neutral-700 bg-neutral-800",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-4 bg-sky-300" : "left-0.5 bg-neutral-500 group-hover:bg-neutral-400",
          )}
        />
      </span>
      <span className={cn("text-xs transition-colors", checked ? "text-neutral-300" : "text-neutral-500 group-hover:text-neutral-400")}>
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ pieces */

// A few soft tints so a list of people stays scannable without turning loud.
const AVATAR_TINTS = [
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-teal-500/15 text-teal-300",
];

function tintFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

const AVATAR_SIZES = { sm: "h-8 w-8 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" } as const;

export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof AVATAR_SIZES; className?: string }) {
  const clean = name.replace(/^@/, "").trim();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-white/5 font-semibold uppercase",
        AVATAR_SIZES[size],
        tintFor(clean || name),
        className,
      )}
    >
      {clean.slice(0, 1) || "?"}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("live-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400", className)} />;
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", className)} />;
}

// Middle dot used to separate bits of meta text.
export function Separator() {
  return <span className="text-neutral-700">·</span>;
}

export function Note({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-xs leading-relaxed text-neutral-600", className)}>{children}</p>;
}

const ALERT_VARIANTS = {
  warn: "border-amber-500/25 bg-amber-500/[0.07] text-amber-200/90",
  danger: "border-red-500/25 bg-red-500/[0.07] text-red-200/90",
} as const;

export function Alert({ variant = "warn", children }: { variant?: keyof typeof ALERT_VARIANTS; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", ALERT_VARIANTS[variant])}>{children}</div>;
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="text-sm font-medium text-neutral-300">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">{description}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export const ACCENT = "#38bdf8"; // sky-400 — online / primary series
export const ACCENT_ALT = "#a78bfa"; // violet-400 — secondary series
