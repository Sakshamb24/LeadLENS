import { db } from "@/lib/db";
import { nameFromDomain, nameKey, normalizeDomain } from "@/lib/normalize";
import { toLead } from "@/lib/serialize";
import type { ImportRow } from "@/lib/types";


export async function GET() {
  const rows = await db.lead.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json(rows.map(toLead));
}

// Import with dedup: by normalised domain first, then by normalised company name.
export async function POST(req: Request) {
  const { rows } = (await req.json()) as { rows: ImportRow[] };
  if (!Array.isArray(rows)) return Response.json({ error: "rows must be an array" }, { status: 400 });
  if (rows.length > 2000) return Response.json({ error: "Max 2,000 rows per import" }, { status: 413 });

  const existing = await db.lead.findMany({ select: { id: true, name: true, domain: true, nameKey: true } });
  const byDomain = new Map(existing.filter((e) => e.domain).map((e) => [e.domain!, e.name]));
  const byName = new Map(existing.map((e) => [e.nameKey, e.name]));

  const toCreate: {
    name: string; domain: string | null; nameKey: string; inputIndustry: string | null; inputLocation: string | null;
  }[] = [];
  const duplicates: { name: string; matched: string; reason: string }[] = [];
  const invalid: { name: string; reason: string }[] = [];

  for (const r of rows) {
    const domain = normalizeDomain(r.website);
    const rawName = r.company?.trim() || (domain ? nameFromDomain(domain) : "");
    if (!rawName) {
      invalid.push({ name: r.website || "(blank row)", reason: "No company name or valid website" });
      continue;
    }
    if (r.website?.trim() && !domain) {
      invalid.push({ name: rawName, reason: `"${r.website}" is not a valid website` });
      continue;
    }
    const key = nameKey(rawName);
    if (domain && byDomain.has(domain)) {
      duplicates.push({ name: rawName, matched: byDomain.get(domain)!, reason: `Same website (${domain})` });
      continue;
    }
    if (byName.has(key)) {
      duplicates.push({ name: rawName, matched: byName.get(key)!, reason: "Same company name" });
      continue;
    }
    toCreate.push({
      name: rawName,
      domain,
      nameKey: key,
      inputIndustry: r.industry?.trim() || null,
      inputLocation: r.location?.trim() || null,
    });
    if (domain) byDomain.set(domain, rawName);
    byName.set(key, rawName);
  }

  if (toCreate.length) await db.lead.createMany({ data: toCreate });
  return Response.json({ created: toCreate.length, duplicates, invalid });
}

export async function DELETE() {
  await db.lead.deleteMany();
  return Response.json({ ok: true });
}
