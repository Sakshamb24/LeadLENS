"use client";

import { FileSpreadsheet, Sparkles, Upload } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";
import type { ImportRow } from "@/lib/types";
import { Button, Card, cx } from "./ui";

// Accept whatever headers the user's CSV has: SaaSquatch export, Apollo, a hand-made sheet...
function pick(row: Record<string, string>, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const key = Object.keys(row).find((k) => re.test(k.trim()));
    if (key && row[key]?.trim()) return row[key].trim();
  }
}

export function rowsFromCsv(text: string): ImportRow[] {
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return data.map((r) => {
    const city = pick(r, [/^city$/i, /town/i]);
    const state = pick(r, [/^state$/i, /region|province/i]);
    return {
      company: pick(r, [/^company$/i, /company.?name|business.?name|organi[sz]ation/i, /^name$/i, /account/i]),
      website: pick(r, [/website|domain|url|^site$/i]),
      industry: pick(r, [/industry|category|sector|vertical|niche/i]),
      location: [city, state].filter(Boolean).join(", ") || pick(r, [/location|address/i]),
    };
  });
}

// Pasted text: one lead per line. "acme.com" or "Acme Plumbing, acme.com, Plumbing, Austin TX"
function rowsFromPaste(text: string): ImportRow[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t|,/).map((p) => p.trim());
      const siteIdx = parts.findIndex((p) => /\.[a-z]{2,}/i.test(p) && !p.includes(" "));
      if (siteIdx === -1) return { company: parts[0] };
      const rest = parts.filter((_, i) => i !== siteIdx);
      return { website: parts[siteIdx], company: rest[0], industry: rest[1], location: rest.slice(2).join(", ") || undefined };
    });
}

export function ImportPanel({ onImport, busy }: { onImport: (rows: ImportRow[]) => void; busy: boolean }) {
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (f: File) => onImport(rowsFromCsv(await f.text()));

  return (
    <Card title="1 · Import leads">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) readFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className={cx(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition",
          drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50",
        )}
      >
        <Upload size={20} className="text-accent" />
        <p className="text-sm font-medium">Drop a CSV or click to browse</p>
        <p className="text-xs text-muted">Any export works. We auto-detect company, website, industry and location columns.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder={"…or paste one per line\nacmeplumbing.com\nBright HVAC, brighthvac.com, HVAC, Austin TX"}
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-line px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />
      <div className="mt-2 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={!paste.trim() || busy}
          onClick={() => {
            onImport(rowsFromPaste(paste));
            setPaste("");
          }}
        >
          <FileSpreadsheet size={14} /> Import &amp; enrich
        </Button>
        <Button
          disabled={busy}
          onClick={async () => onImport(rowsFromCsv(await (await fetch("/sample-leads.csv")).text()))}
          title="Load 25+ real small businesses"
        >
          <Sparkles size={14} /> Sample
        </Button>
      </div>
    </Card>
  );
}
