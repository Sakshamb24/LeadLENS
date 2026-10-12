"use client";

import { X } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tier } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:brightness-110 shadow-sm",
        variant === "secondary" && "border border-line bg-panel text-ink hover:bg-cold-soft",
        variant === "ghost" && "text-muted hover:bg-cold-soft hover:text-ink",
        className,
      )}
    />
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-panel", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TIER_STYLE: Record<Tier, string> = {
  hot: "bg-hot-soft text-hot",
  warm: "bg-warm-soft text-warm",
  cold: "bg-cold-soft text-cold",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", TIER_STYLE[tier])}>
      {tier}
    </span>
  );
}

export function ScoreRing({ score, tier, size = 40 }: { score: number; tier: Tier; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = tier === "hot" ? "var(--hot)" : tier === "warm" ? "var(--warm)" : "var(--cold)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Score ${score}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold tabular-nums" style={{ fontSize: size / 3.3 }}>
        {score}
      </span>
    </div>
  );
}

// Type a value, press Enter or comma to add it as a chip.
export function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1 focus-within:border-accent">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
          {v}
          <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={values.length ? "" : placeholder}
        className="min-w-20 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted/70"
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cx(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
        checked ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-muted hover:text-ink",
      )}
      aria-pressed={checked}
    >
      {label}
    </button>
  );
}
