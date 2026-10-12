"use client";

import { AlertTriangle, BadgeCheck, Ban, Loader2, Mail, Phone, UserRound } from "lucide-react";
import type { Lead, Scored } from "@/lib/types";
import { cx, ScoreRing, TierBadge } from "./ui";

export type Row = { lead: Lead; s: Scored };

const DECISION = /owner|founder|president|ceo|chief|principal|managing|partner|general manager/i;

function Status({ lead, working }: { lead: Lead; working: boolean }) {
  if (lead.status === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        {working ? <Loader2 size={12} className="animate-spin" /> : null}
        {working ? "Enriching" : "Queued"}
      </span>
    );
  if (lead.status === "blocked")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted" title={lead.error ?? ""}>
        <Ban size={12} /> Blocks bots
      </span>
    );
  if (lead.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warm" title={lead.error ?? ""}>
        <AlertTriangle size={12} /> Unreachable
      </span>
    );
  return null;
}

export function LeadTable({
  rows,
  selected,
  working,
  activeId,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  rows: Row[];
  selected: Set<string>;
  working: Set<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.lead.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="w-10 px-4 py-2.5">
              <input type="checkbox" checked={allChecked} onChange={onToggleAll} aria-label="Select all" className="accent-[var(--accent)]" />
            </th>
            <th className="w-24 py-2.5">Score</th>
            <th className="py-2.5">Company</th>
            <th className="py-2.5">Best contact</th>
            <th className="hidden py-2.5 lg:table-cell">Why it ranks here</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lead, s }) => {
            const e = lead.enrichment;
            const person = e?.people.find((p) => DECISION.test(p.title)) ?? e?.people[0];
            const email = e?.emails.find((x) => x.deliverable);
            const top = s.reasons.filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
            return (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead.id)}
                className={cx(
                  "cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-cold-soft/60",
                  activeId === lead.id && "bg-accent-soft/60",
                )}
              >
                <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => onToggle(lead.id)}
                    aria-label={`Select ${lead.name}`}
                    className="accent-[var(--accent)]"
                  />
                </td>
                <td className="py-3">
                  {lead.status === "done" ? (
                    <div className="flex items-center gap-2">
                      <ScoreRing score={s.score} tier={s.tier} size={36} />
                      <TierBadge tier={s.tier} />
                    </div>
                  ) : (
                    <Status lead={lead} working={working.has(lead.id)} />
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-muted">
                    {lead.domain ?? "no website"}
                    {(lead.inputIndustry || lead.inputLocation) && " · "}
                    {[lead.inputIndustry, lead.inputLocation].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  {e ? (
                    <div className="space-y-0.5 text-xs">
                      {person ? (
                        <div className="flex items-center gap-1 font-medium text-ink">
                          <UserRound size={12} className="text-muted" /> {person.name}
                          <span className="font-normal text-muted">· {person.title.length > 24 ? person.title.slice(0, 24) + "…" : person.title}</span>
                        </div>
                      ) : null}
                      {email ? (
                        <div className="flex items-center gap-1 text-muted">
                          <Mail size={12} /> {email.address}
                          <BadgeCheck size={12} className="text-accent" aria-label="Domain accepts mail" />
                        </div>
                      ) : null}
                      {e.phones[0] ? (
                        <div className="flex items-center gap-1 text-muted">
                          <Phone size={12} /> {e.phones[0]}
                        </div>
                      ) : null}
                      {!person && !email && !e.phones[0] && <span className="text-muted">No contact found</span>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </td>
                <td className="hidden max-w-sm py-3 pr-4 text-xs text-muted lg:table-cell">
                  {top[0] ? (
                    <>
                      <span className="text-ink">{top[0].label}</span>
                      {top.length > 1 && <span className="ml-1 text-muted">+{top.length - 1} more</span>}
                    </>
                  ) : (
                    lead.error ?? ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
