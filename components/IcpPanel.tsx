"use client";

import { Briefcase, Megaphone } from "lucide-react";
import type { Goal, ICP } from "@/lib/types";
import { Card, ChipInput, cx } from "./ui";

const GOALS: { id: Goal; label: string; hint: string; icon: typeof Briefcase }[] = [
  { id: "acquisition", label: "Acquisition", hint: "Find owner-run businesses that may be ready to sell", icon: Briefcase },
  { id: "sales", label: "Sales outreach", hint: "Find growing businesses likely to buy from you", icon: Megaphone },
];

export function IcpPanel({ icp, onChange }: { icp: ICP; onChange: (icp: ICP) => void }) {
  const goal = GOALS.find((g) => g.id === icp.goal)!;
  return (
    <Card title="2 · What's a great lead for you?">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-cold-soft p-1">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => onChange({ ...icp, goal: g.id })}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition",
              icp.goal === g.id ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <g.icon size={13} /> {g.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">{goal.hint}</p>

      <label className="mt-4 block text-xs font-semibold text-muted">Target industries</label>
      <div className="mt-1">
        <ChipInput values={icp.industries} onChange={(industries) => onChange({ ...icp, industries })} placeholder="hvac, plumbing… (Enter)" />
      </div>

      <label className="mt-3 block text-xs font-semibold text-muted">Target locations</label>
      <div className="mt-1">
        <ChipInput values={icp.locations} onChange={(locations) => onChange({ ...icp, locations })} placeholder="TX, Ohio, Phoenix… (Enter)" />
      </div>

      <label className="mt-3 flex items-center justify-between text-xs font-semibold text-muted">
        Min. years in business <span className="tabular-nums text-ink">{icp.minYearsInBusiness}+</span>
      </label>
      <input
        type="range"
        min={0}
        max={40}
        step={5}
        value={icp.minYearsInBusiness}
        onChange={(e) => onChange({ ...icp, minYearsInBusiness: +e.target.value })}
        className="mt-1 w-full accent-[var(--accent)]"
      />
      <p className="mt-2 text-[11px] leading-snug text-muted">Scores update instantly. Nothing is re-scraped.</p>
    </Card>
  );
}
