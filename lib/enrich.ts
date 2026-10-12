import { allowed, CrawlError, fetchHomepage, fetchText, sleep } from "./crawler";
import { db } from "./db";
import { extractPage, isDecisionMaker, isJunkEmail, topKeywords, type PageFacts } from "./extract";
import type { Enrichment, Person } from "./types";
import { validateEmails } from "./validate";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUBPAGES = 3;
const POLITE_DELAY_MS = 350; // between requests to the same site

// Contact pages first: that's where emails and phones live. Then about/team for owner names.
const SUBPAGE_PRIORITY: [RegExp, number][] = [
  [/contact/i, 0],
  [/about|our[- ]story|who[- ]we[- ]are|history/i, 1],
  [/team|staff|leadership|people|meet|owner/i, 2],
];

function pickSubpages(facts: PageFacts, homeUrl: string): string[] {
  const home = new URL(homeUrl);
  const host = home.host.replace(/^www\./, "");
  const scored = new Map<string, number>();
  for (const { href, text } of facts.links) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.host.replace(/^www\./, "") !== host || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(u.pathname) || u.pathname === home.pathname) continue;
    const hay = `${u.pathname} ${text}`;
    for (const [re, p] of SUBPAGE_PRIORITY) {
      if (re.test(hay)) {
        const key = `${u.origin}${u.pathname}`;
        scored.set(key, Math.min(scored.get(key) ?? 99, p));
        break;
      }
    }
  }
  return [...scored.entries()].sort((a, b) => a[1] - b[1]).slice(0, MAX_SUBPAGES).map(([u]) => u);
}

function mergePeople(people: Person[]): Person[] {
  const byName = new Map<string, Person>();
  for (const p of people) {
    const prev = byName.get(p.name);
    if (!prev || (isDecisionMaker(p.title) && !isDecisionMaker(prev.title))) byName.set(p.name, p);
  }
  return [...byName.values()]
    .sort((a, b) => Number(isDecisionMaker(b.title)) - Number(isDecisionMaker(a.title)))
    .slice(0, 6);
}

export async function crawlDomain(domain: string): Promise<Enrichment> {
  const started = Date.now();
  const { page: home, robots } = await fetchHomepage(domain);
  const pages: { url: string; facts: PageFacts }[] = [{ url: home.url, facts: extractPage(home.html, home.url) }];

  for (const url of pickSubpages(pages[0].facts, home.url)) {
    if (!allowed(robots, url)) continue;
    await sleep(POLITE_DELAY_MS);
    const res = await fetchText(url);
    if (res && /html/i.test(res.type)) pages.push({ url: res.url, facts: extractPage(res.text, res.url) });
  }

  const all = pages.map((p) => p.facts);
  const first = <T>(pick: (f: PageFacts) => T | null): T | null => {
    for (const f of all) {
      const v = pick(f);
      if (v) return v;
    }
    return null;
  };

  const rawEmails = all.flatMap((f) => f.emails).filter((e) => !isJunkEmail(e));
  const phones = [...new Set(all.flatMap((f) => f.phones).map(normalizePhone).filter(Boolean) as string[])].slice(0, 4);
  const socials = Object.assign({}, ...all.map((f) => f.socials).reverse());
  const founded = all.map((f) => f.foundedYear).filter((y): y is number => !!y);
  const copyright = all.map((f) => f.copyrightYear).filter((y): y is number => !!y);
  const homeFacts = pages[0].facts;

  return {
    finalUrl: home.url,
    title: homeFacts.title,
    description: first((f) => f.description),
    emails: await validateEmails(rawEmails, domain),
    phones,
    socials,
    people: mergePeople(all.flatMap((f) => f.people)),
    address: first((f) => f.address),
    foundedYear: founded.length ? Math.min(...founded) : null,
    lastUpdatedYear: copyright.length ? Math.max(...copyright) : null,
    tech: [...new Set(all.flatMap((f) => f.tech))],
    signals: {
      https: home.url.startsWith("https://"),
      mobileFriendly: homeFacts.mobileFriendly,
      hasCareersPage: all.some((f) => f.hasCareersPage),
      hasEcommerce: all.some((f) => f.hasEcommerce),
      hasBooking: all.some((f) => f.hasBooking),
      hasLiveChat: all.some((f) => f.hasLiveChat),
    },
    keywords: topKeywords([homeFacts.title, homeFacts.description, ...homeFacts.headings]),
    pagesCrawled: pages.map((p) => p.url),
    fetchMs: Date.now() - started,
  };
}

function normalizePhone(p: string): string | null {
  const d = p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10 || !/^[2-9]/.test(d)) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Cache-aware wrapper: one crawl per domain per week, shared across all leads/imports.
export async function enrichDomain(domain: string, force = false): Promise<Enrichment> {
  if (!force) {
    const hit = await db.domainCache.findUnique({ where: { domain } });
    if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) return JSON.parse(hit.data);
  }
  const data = await crawlDomain(domain);
  const json = JSON.stringify(data);
  await db.domainCache.upsert({
    where: { domain },
    create: { domain, data: json },
    update: { data: json, fetchedAt: new Date() },
  });
  return data;
}

export async function enrichLead(id: string, force = false) {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return null;
  if (!lead.domain) {
    return db.lead.update({ where: { id }, data: { status: "failed", error: "No website to enrich" } });
  }
  try {
    const e = await enrichDomain(lead.domain, force);
    return db.lead.update({
      where: { id },
      data: { status: "done", error: null, enrichment: JSON.stringify(e), enrichedAt: new Date() },
    });
  } catch (err) {
    const blocked = err instanceof CrawlError && err.kind === "blocked";
    return db.lead.update({
      where: { id },
      data: {
        status: blocked ? "blocked" : "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        enrichedAt: new Date(),
      },
    });
  }
}

// Tiny concurrency limiter: run `fn` over items with at most `n` in flight.
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
