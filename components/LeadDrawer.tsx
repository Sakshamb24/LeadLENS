"use client";

import { Check, Copy, ExternalLink, Globe, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ICP, Lead, ScoreReason, Scored } from "@/lib/types";
import { Button, cx, ScoreRing, TierBadge } from "./ui";

const GROUPS: { id: ScoreReason["group"]; label: string; hint: string }[] = [
  { id: "reach", label: "Reachability", hint: "Can you get a decision maker on the phone?" },
  { id: "fit", label: "Fit", hint: "Does it match your target profile?" },
  { id: "signal", label: "Timing signals", hint: "Why reach out now?" },
  { id: "quality", label: "Data quality", hint: "How much do we know?" },
];

const DECISION = /owner|founder|president|ceo|chief|principal|managing|partner|general manager/i;
const THIS_YEAR = new Date().getFullYear();

// Template opener built from the facts we found. No LLM needed, and every claim is verifiable.
function opener(lead: Lead, icp: ICP): string {
  const e = lead.enrichment!;
  const person = e.people.find((p) => DECISION.test(p.title));
  const hi = person ? `Hi ${person.name.split(" ")[0]},` : "Hi there,";
  const since = e.foundedYear ? ` since ${e.foundedYear}` : "";
  const where = lead.inputLocation ? ` in ${lead.inputLocation.split(",")[0]}` : "";
  if (icp.goal === "acquisition") {
    const years = e.foundedYear ? `${THIS_YEAR - e.foundedYear} years` : "years";
    return `${hi}\n\nI came across ${lead.name} and was impressed that you've been serving customers${where}${since}. Building something that lasts ${years} is rare.\n\nI work with a small group of long-term operators who partner with owners thinking about the next chapter (succession, growth capital, or simply taking some chips off the table) while keeping the team and name intact.\n\nWould you be open to a confidential 15-minute call in the next couple of weeks?`;
  }
  const hook = e.signals.hasCareersPage
    ? "noticed you're hiring, which usually means things are busy"
    : "took a look at your website";
  return `${hi}\n\nI ${hook} at ${lead.name}${where}. We help teams like yours [your value prop in one line].\n\nWorth a quick 15-minute chat this week?`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="text-muted hover:text-ink"
      aria-label="Copy"
    >
      {done ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
    </button>
  );
}

export function LeadDrawer({
  lead,
  s,
  icp,
  busy,
  onClose,
  onReenrich,
  onDelete,
}: {
  lead: Lead;
  s: Scored;
  icp: ICP;
  busy: boolean;
  onClose: () => void;
  onReenrich: () => void;
  onDelete: () => void;
}) {
  const e = lead.enrichment;
  return (
    <aside className="animate-slide-in fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl">
      <header className="flex items-start gap-3 px-5 py-4">
        {e ? <ScoreRing score={s.score} tier={s.tier} size={52} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{lead.name}</h2>
            {e && <TierBadge tier={s.tier} />}
          </div>
          {lead.domain && (
            <a
              href={e?.finalUrl ?? `https://${lead.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Globe size={13} /> {lead.domain} <ExternalLink size={11} />
            </a>
          )}
          <p className="text-xs text-muted">{[lead.inputIndustry, lead.inputLocation].filter(Boolean).join(" · ")}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-cold-soft hover:text-ink" aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!e && (
          <Section title="Status">
            <p className="text-sm text-muted">
              {lead.status === "pending" ? "Waiting to be enriched…" : lead.error ?? "Could not enrich this lead."}
            </p>
          </Section>
        )}

        {e && (
          <>
            <Section title="Why this score">
              <div className="space-y-3">
                {GROUPS.map((g) => {
                  const rs = s.reasons.filter((r) => r.group === g.id);
                  if (!rs.length) return null;
                  const pts = rs.reduce((a, r) => a + r.points, 0);
                  return (
                    <div key={g.id}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium" title={g.hint}>{g.label}</span>
                        <span className="text-xs font-semibold tabular-nums text-muted">{pts > 0 ? "+" : ""}{pts}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {rs.map((r) => (
                          <li key={r.label} className="flex gap-2 text-xs">
                            <span className={cx("w-7 shrink-0 text-right font-semibold tabular-nums", r.points > 0 ? "text-accent" : r.points < 0 ? "text-hot" : "text-muted")}>
                              {r.points > 0 ? "+" : ""}{r.points}
                            </span>
                            <span className="text-ink/80">{r.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Contacts">
              {e.people.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {e.people.map((p) => (
                    <li key={p.name} className="text-sm">
                      <span className="font-medium">{p.name}</span> <span className="text-muted">· {p.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-1">
                {e.emails.map((m) => (
                  <li key={m.address} className="flex items-center gap-2 text-sm">
                    <span className={cx("truncate", !m.deliverable && "text-muted line-through")}>{m.address}</span>
                    <span className="rounded bg-cold-soft px-1.5 text-[10px] font-semibold uppercase text-muted">{m.kind}</span>
                    {m.deliverable ? <span className="text-[10px] font-semibold text-accent">MX ✓</span> : <span className="text-[10px] font-semibold text-hot">no MX</span>}
                    <CopyButton text={m.address} />
                  </li>
                ))}
                {e.phones.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm">
                    {p} <CopyButton text={p} />
                  </li>
                ))}
                {!e.emails.length && !e.phones.length && !e.people.length && <li className="text-sm text-muted">Nothing public found.</li>}
              </ul>
              {Object.keys(e.socials).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(e.socials).map(([k, url]) => (
                    <a key={k} href={url} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-0.5 text-xs capitalize hover:border-accent hover:text-accent">
                      {k}
                    </a>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Suggested opener">
              <div className="relative rounded-lg bg-cold-soft p-3 text-xs leading-relaxed whitespace-pre-line text-ink/90">
                {opener(lead, icp)}
                <div className="absolute top-2 right-2"><CopyButton text={opener(lead, icp)} /></div>
              </div>
            </Section>

            <Section title="Company facts">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Founded</dt>
                <dd>{e.foundedYear ?? "-"}</dd>
                <dt className="text-muted">Site last updated</dt>
                <dd>{e.lastUpdatedYear ?? "-"}</dd>
                <dt className="text-muted">Address</dt>
                <dd className="text-xs">{e.address ?? lead.inputLocation ?? "-"}</dd>
                <dt className="text-muted">Website</dt>
                <dd className="text-xs">
                  {[e.signals.https ? "HTTPS" : "No HTTPS", e.signals.mobileFriendly ? "Mobile-ready" : "Not mobile-ready"].join(" · ")}
                </dd>
                <dt className="text-muted">Online</dt>
                <dd className="text-xs">
                  {[e.signals.hasBooking && "Booking", e.signals.hasEcommerce && "E-commerce", e.signals.hasLiveChat && "Live chat", e.signals.hasCareersPage && "Hiring"]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </dd>
              </dl>
              {e.description && <p className="mt-3 text-xs text-muted">{e.description}</p>}
              {e.tech.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {e.tech.map((t) => (
                    <span key={t} className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">{t}</span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Sources">
              <ul className="space-y-0.5">
                {e.pagesCrawled.map((u) => (
                  <li key={u} className="truncate text-xs">
                    <a href={u} target="_blank" rel="noreferrer" className="text-muted hover:text-accent">{u}</a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                Crawled {lead.enrichedAt ? new Date(lead.enrichedAt).toLocaleString() : ""} in {(e.fetchMs / 1000).toFixed(1)}s · robots.txt respected
              </p>
            </Section>
          </>
        )}
      </div>

      <footer className="flex gap-2 border-t border-line px-5 py-3">
        <Button onClick={onReenrich} disabled={busy || !lead.domain} className="flex-1">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Re-crawl
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 size={14} /> Remove
        </Button>
      </footer>
    </aside>
  );
}
