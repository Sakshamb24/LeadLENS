"use client";

import { Download, Flame, Inbox, Layers, Mail, Search, Trash2, UserCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IcpPanel } from "@/components/IcpPanel";
import { ImportPanel } from "@/components/ImportPanel";
import { LeadDrawer } from "@/components/LeadDrawer";
import { LeadTable, type Row } from "@/components/LeadTable";
import { Button, cx, Toggle } from "@/components/ui";
import { download, toCsv, toHubSpotCsv } from "@/lib/export";
import { DEFAULT_ICP, scoreLead } from "@/lib/scoring";
import type { ICP, ImportRow, Lead, Tier } from "@/lib/types";

type ImportReport = {
  created: number;
  duplicates: { name: string; matched: string; reason: string }[];
  invalid: { name: string; reason: string }[];
};

const BATCH = 4; // leads per request
const PARALLEL = 2; // requests in flight
const DECISION = /owner|founder|president|ceo|chief|principal|managing|partner|general manager/i;

function loadIcp(): ICP {
  try {
    const raw = localStorage.getItem("leadlens.icp");
    return raw ? { ...DEFAULT_ICP, ...JSON.parse(raw) } : DEFAULT_ICP;
  } catch {
    return DEFAULT_ICP;
  }
}

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [icp, setIcp] = useState<ICP>(DEFAULT_ICP);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [onlyDM, setOnlyDM] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    // localStorage only exists in the browser, so read it after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIcp(loadIcp());
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l: Lead[]) => setLeads(l))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("leadlens.icp", JSON.stringify(icp));
    } catch {
      /* private mode: preference just won't persist */
    }
  }, [icp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mergeLeads = (updated: Lead[]) =>
    setLeads((prev) => {
      const m = new Map(updated.map((l) => [l.id, l]));
      return prev.map((l) => m.get(l.id) ?? l);
    });

  const enrich = useCallback(async (ids: string[], force = false) => {
    if (!ids.length) return;
    cancelRef.current = false;
    let done = 0;
    setProgress({ done, total: ids.length });
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
    let next = 0;
    const worker = async () => {
      while (next < batches.length && !cancelRef.current) {
        const batch = batches[next++];
        setWorking((w) => new Set([...w, ...batch]));
        try {
          const res = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch, force }),
          });
          if (res.ok) mergeLeads(await res.json());
        } finally {
          setWorking((w) => new Set([...w].filter((id) => !batch.includes(id))));
          done += batch.length;
          setProgress({ done, total: ids.length });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setProgress(null);
  }, []);

  const importRows = async (rows: ImportRow[]) => {
    if (!rows.length) return;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const r: ImportReport & { error?: string } = await res.json();
    if (!res.ok) return alert(r.error ?? "Import failed");
    setReport(r);
    const all: Lead[] = await (await fetch("/api/leads")).json();
    setLeads(all);
    // Smart default: start enriching right away instead of making the user click again.
    enrich(all.filter((l) => l.status === "pending").map((l) => l.id));
  };

  const scored: Row[] = useMemo(() => leads.map((lead) => ({ lead, s: scoreLead(lead, icp) })), [leads, icp]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored
      .filter(({ lead, s }) => {
        const e = lead.enrichment;
        if (q && ![lead.name, lead.domain, lead.inputIndustry, lead.inputLocation].join(" ").toLowerCase().includes(q)) return false;
        if (tier !== "all" && (lead.status !== "done" || s.tier !== tier)) return false;
        if (onlyEmail && !e?.emails.some((x) => x.deliverable)) return false;
        if (onlyDM && !e?.people.some((p) => DECISION.test(p.title))) return false;
        if (hideFailed && (lead.status === "failed" || lead.status === "blocked")) return false;
        return true;
      })
      .sort((a, b) => {
        // Enriched leads by score; pending next; failed last.
        const rank = (r: Row) => (r.lead.status === "done" ? 0 : r.lead.status === "pending" ? 1 : 2);
        return rank(a) - rank(b) || b.s.score - a.s.score || a.lead.name.localeCompare(b.lead.name);
      });
  }, [scored, query, tier, onlyEmail, onlyDM, hideFailed]);

  const stats = useMemo(() => {
    const done = scored.filter((r) => r.lead.status === "done");
    return {
      total: leads.length,
      hot: done.filter((r) => r.s.tier === "hot").length,
      warm: done.filter((r) => r.s.tier === "warm").length,
      cold: done.filter((r) => r.s.tier === "cold").length,
      emails: done.filter((r) => r.lead.enrichment?.emails.some((x) => x.deliverable)).length,
      dms: done.filter((r) => r.lead.enrichment?.people.some((p) => DECISION.test(p.title))).length,
    };
  }, [scored, leads.length]);

  const exportRows = (selected.size ? visible.filter((r) => selected.has(r.lead.id)) : visible).filter((r) => r.lead.status === "done");
  const stamp = new Date().toISOString().slice(0, 10);
  const active = scored.find((r) => r.lead.id === activeId);
  const step = !leads.length ? 1 : progress ? 2 : 3;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
              <Layers size={16} />
            </div>
            <div>
              <h1 className="text-base leading-tight font-bold">LeadLens</h1>
              <p className="text-[11px] leading-tight text-muted">Turn a lead list into a call list</p>
            </div>
          </div>
          <ol className="hidden items-center gap-1 text-xs md:flex">
            {["Import", "Enrich & verify", "Prioritise", "Export"].map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={cx(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                    i + 1 === step ? "bg-accent text-white" : i + 1 < step ? "bg-accent-soft text-accent" : "text-muted",
                  )}
                >
                  <span className="tabular-nums">{i + 1}</span> {label}
                </span>
                {i < 3 && <span className="text-line">-</span>}
              </li>
            ))}
          </ol>
          <div className="ml-auto flex gap-2">
            <Button disabled={!exportRows.length} onClick={() => download(`leadlens-${stamp}.csv`, toCsv(exportRows))}>
              <Download size={14} /> CSV
            </Button>
            <Button variant="primary" disabled={!exportRows.length} onClick={() => download(`leadlens-hubspot-${stamp}.csv`, toHubSpotCsv(exportRows))}>
              <Download size={14} /> HubSpot {selected.size ? `(${exportRows.length})` : ""}
            </Button>
          </div>
        </div>
        {progress && (
          <div className="h-0.5 bg-line">
            <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-5">
          <ImportPanel onImport={importRows} busy={!!progress} />
          <IcpPanel icp={icp} onChange={setIcp} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Inbox} label="Leads" value={stats.total} />
            <Stat icon={Flame} label="Hot leads" value={stats.hot} sub={`${stats.warm} warm · ${stats.cold} cold`} tone="hot" onClick={() => setTier(tier === "hot" ? "all" : "hot")} active={tier === "hot"} />
            <Stat icon={Mail} label="Verified emails" value={stats.emails} sub={pct(stats.emails, stats.total)} />
            <Stat icon={UserCheck} label="Decision makers" value={stats.dms} sub={pct(stats.dms, stats.total)} />
          </div>

          {report && (
            <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
              <div className="flex-1">
                <p>
                  <b>{report.created}</b> new leads added
                  {report.duplicates.length > 0 && <> · <b>{report.duplicates.length}</b> duplicates skipped</>}
                  {report.invalid.length > 0 && <> · <b>{report.invalid.length}</b> invalid rows</>}
                  {progress && <> · enriching {progress.done}/{progress.total}…</>}
                </p>
                {(report.duplicates.length > 0 || report.invalid.length > 0) && (
                  <ul className="mt-1 space-y-0.5 text-xs text-ink/70">
                    {report.duplicates.map((d, i) => (
                      <li key={`d${i}`}>↳ &ldquo;{d.name}&rdquo; is the same as &ldquo;{d.matched}&rdquo; ({d.reason})</li>
                    ))}
                    {report.invalid.map((d, i) => (
                      <li key={`i${i}`}>↳ &ldquo;{d.name}&rdquo;: {d.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => setReport(null)} className="text-muted hover:text-ink" aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}

          <section className="rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search leads"
                  className="w-48 rounded-lg border border-line py-1.5 pr-3 pl-8 text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="flex rounded-lg border border-line p-0.5 text-xs font-medium">
                {(["all", "hot", "warm", "cold"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    className={cx("rounded-md px-2.5 py-1 capitalize", tier === t ? "bg-ink text-white" : "text-muted hover:text-ink")}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Toggle label="Has verified email" checked={onlyEmail} onChange={setOnlyEmail} />
              <Toggle label="Decision maker found" checked={onlyDM} onChange={setOnlyDM} />
              <Toggle label="Hide unreachable" checked={hideFailed} onChange={setHideFailed} />
              <div className="ml-auto flex items-center gap-2 text-xs text-muted">
                {progress ? (
                  <Button variant="ghost" onClick={() => (cancelRef.current = true)}>Stop</Button>
                ) : (
                  <>
                    {leads.some((l) => l.status === "pending") && (
                      <Button onClick={() => enrich(leads.filter((l) => l.status === "pending").map((l) => l.id))}>Enrich pending</Button>
                    )}
                    {leads.some((l) => l.status === "failed") && (
                      <Button onClick={() => enrich(leads.filter((l) => l.status === "failed").map((l) => l.id), true)}>Retry failed</Button>
                    )}
                  </>
                )}
                <span>{visible.length} shown{selected.size ? ` · ${selected.size} selected` : ""}</span>
                {leads.length > 0 && (
                  <Button
                    variant="ghost"
                    disabled={!!progress}
                    onClick={async () => {
                      if (!confirm("Remove all leads? Cached website data is kept.")) return;
                      await fetch("/api/leads", { method: "DELETE" });
                      setLeads([]);
                      setSelected(new Set());
                      setReport(null);
                    }}
                    aria-label="Clear all leads"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>

            {leads.length ? (
              <LeadTable
                rows={visible}
                selected={selected}
                working={working}
                activeId={activeId}
                onOpen={setActiveId}
                onToggle={(id) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onToggleAll={() =>
                  setSelected((s) => (visible.every((r) => s.has(r.lead.id)) ? new Set() : new Set(visible.map((r) => r.lead.id))))
                }
              />
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="font-medium">{loaded ? "No leads yet" : "Loading…"}</p>
                {loaded && (
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Import a CSV from SaaSquatch (or anywhere), or click <b>Sample</b>. LeadLens visits each website, finds the owner and a
                    verified email, and ranks every lead so you know who to call first.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {active && (
        <>
          <div className="fixed inset-0 z-20 bg-ink/10" onClick={() => setActiveId(null)} />
          <LeadDrawer
            lead={active.lead}
            s={active.s}
            icp={icp}
            busy={working.has(active.lead.id)}
            onClose={() => setActiveId(null)}
            onReenrich={() => enrich([active.lead.id], true)}
            onDelete={async () => {
              await fetch(`/api/leads/${active.lead.id}`, { method: "DELETE" });
              setLeads((l) => l.filter((x) => x.id !== active.lead.id));
              setActiveId(null);
            }}
          />
        </>
      )}
    </div>
  );
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}% of leads` : "";
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  sub?: string;
  tone?: "hot";
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cx(
        "rounded-xl border bg-panel px-4 py-3 text-left transition",
        active ? "border-hot" : "border-line",
        onClick && "hover:border-hot/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={13} className={tone === "hot" ? "text-hot" : "text-accent"} /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </button>
  );
}
