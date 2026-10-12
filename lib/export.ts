import Papa from "papaparse";
import type { Lead, Scored } from "./types";

type Row = { lead: Lead; s: Scored };

function bestContact(lead: Lead) {
  const e = lead.enrichment;
  const person = e?.people.find((p) => /owner|founder|president|ceo|chief|principal|partner|manager/i.test(p.title)) ?? e?.people[0];
  const email = e?.emails.find((x) => x.deliverable) ?? null;
  const [first = "", ...rest] = (person?.name ?? "").split(" ");
  return { person, email, first, last: rest.join(" ") };
}

function topReasons(s: Scored, n = 3) {
  return s.reasons.filter((r) => r.points > 0 && r.group !== "quality" && !r.label.includes("filter set")).sort((a, b) => b.points - a.points).slice(0, n).map((r) => r.label).join("; ");
}

export function toCsv(rows: Row[]): string {
  return Papa.unparse(
    rows.map(({ lead, s }) => {
      const e = lead.enrichment;
      const c = bestContact(lead);
      return {
        Score: s.score,
        Tier: s.tier,
        Company: lead.name,
        Website: lead.domain ?? "",
        Industry: lead.inputIndustry ?? "",
        Location: lead.inputLocation ?? e?.address ?? "",
        "Contact Name": c.person?.name ?? "",
        "Contact Title": c.person?.title ?? "",
        Email: c.email?.address ?? "",
        "Email Type": c.email?.kind ?? "",
        Phone: e?.phones[0] ?? "",
        LinkedIn: e?.socials.linkedin ?? "",
        "Founded": e?.foundedYear ?? "",
        "Site Last Updated": e?.lastUpdatedYear ?? "",
        "Tech": e?.tech.join(", ") ?? "",
        "Completeness %": s.completeness,
        "Why": topReasons(s),
        Status: lead.status,
      };
    }),
  );
}

// Column names match HubSpot's default import properties, so the file maps itself on upload.
export function toHubSpotCsv(rows: Row[]): string {
  return Papa.unparse(
    rows.map(({ lead, s }) => {
      const e = lead.enrichment;
      const c = bestContact(lead);
      const [city = "", state = ""] = (lead.inputLocation ?? "").split(",").map((x) => x.trim());
      return {
        "First Name": c.first,
        "Last Name": c.last,
        Email: c.email?.address ?? "",
        "Job Title": c.person?.title ?? "",
        "Phone Number": e?.phones[0] ?? "",
        "Company Name": lead.name,
        "Company Domain Name": lead.domain ?? "",
        City: city,
        "State/Region": state,
        Industry: lead.inputIndustry ?? "",
        "Year Founded": e?.foundedYear ?? "",
        "LinkedIn Company Page": e?.socials.linkedin ?? "",
        "Lead Status": s.tier === "hot" ? "NEW" : "OPEN",
        "Lead Score (LeadLens)": s.score,
        "Notes (LeadLens)": topReasons(s, 4),
      };
    }),
  );
}

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
