import type { ICP, Lead, ScoreReason, Scored, Tier } from "./types";

// Pure function, runs in the browser: changing the ICP re-ranks every lead instantly, no refetch.

const THIS_YEAR = new Date().getFullYear();
const MARKETING_TECH = ["Google Analytics", "Google Tag Manager", "Meta Pixel", "HubSpot", "Mailchimp"];
const DECISION = /owner|founder|president|ceo|chief|principal|managing|partner|general manager/i;

export const DEFAULT_ICP: ICP = { goal: "acquisition", industries: [], locations: [], minYearsInBusiness: 10 };

export function completeness(lead: Lead): number {
  const e = lead.enrichment;
  if (!e) return 0;
  const checks = [
    e.emails.some((x) => x.deliverable),
    e.phones.length > 0,
    e.people.length > 0,
    !!e.address || !!lead.inputLocation,
    !!e.foundedYear,
    Object.keys(e.socials).length > 0,
    !!e.description,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function tierOf(score: number): Tier {
  // Calibrated on the sample set: "hot" ≈ the top 10-15% of a typical list.
  return score >= 60 ? "hot" : score >= 45 ? "warm" : "cold";
}

const includesAny = (hay: string, needles: string[]) => {
  const h = hay.toLowerCase();
  return needles.find((n) => n && h.includes(n.toLowerCase()));
};

export function scoreLead(lead: Lead, icp: ICP): Scored {
  const e = lead.enrichment;
  const reasons: ScoreReason[] = [];
  const add = (group: ScoreReason["group"], points: number, label: string) => reasons.push({ group, points, label });

  if (!e) {
    if (lead.status === "failed" || lead.status === "blocked") add("quality", 0, lead.error ?? "Could not enrich");
    return { score: 0, tier: "cold", reasons, completeness: 0 };
  }

  // ---- Reach: can we actually talk to a decision maker? (max ~35)
  const owner = e.people.find((p) => DECISION.test(p.title));
  if (owner) add("reach", 10, `Decision maker found: ${owner.name} (${owner.title})`);
  else if (e.people.length) add("reach", 4, `Contact name found: ${e.people[0].name}`);

  const good = e.emails.filter((x) => x.deliverable);
  const personal = good.find((x) => x.kind === "personal" && x.onDomain);
  const role = good.find((x) => x.kind === "role" && x.onDomain);
  const free = good.find((x) => x.kind === "free");
  if (personal) add("reach", 12, `Direct email verified: ${personal.address}`);
  else if (role) add("reach", 7, `Company inbox verified: ${role.address}`);
  else if (free) add("reach", 6, `Owner-style mailbox: ${free.address}`);
  else add("reach", 0, "No deliverable email found");

  if (e.phones.length) add("reach", 6, `Phone: ${e.phones[0]}`);
  if (e.socials.linkedin) add("reach", 3, "LinkedIn page found");

  // ---- Fit: does it match what the user is looking for? (max ~30)
  const about = [lead.inputIndustry, lead.name, e.title, e.description, ...e.keywords].filter(Boolean).join(" ");
  if (icp.industries.length) {
    const hit = includesAny(about, icp.industries);
    if (hit) add("fit", 15, `Matches target industry "${hit}"`);
    else add("fit", -10, "Outside target industries");
  } else add("fit", 8, "No industry filter set");

  if (icp.locations.length) {
    const hit = includesAny([lead.inputLocation, e.address].filter(Boolean).join(" "), icp.locations);
    if (hit) add("fit", 10, `In target area "${hit}"`);
    else add("fit", -5, "Outside target area");
  } else add("fit", 4, "No location filter set");

  const age = e.foundedYear ? THIS_YEAR - e.foundedYear : null;
  if (age !== null) {
    if (age >= icp.minYearsInBusiness) add("fit", 5, `${age} years in business (since ${e.foundedYear})`);
    else add("fit", -5, `Only ${age} years in business`);
  }

  // ---- Signals: why reach out *now*? Depends on the user's goal. (max ~25)
  const stale = e.lastUpdatedYear !== null && e.lastUpdatedYear <= THIS_YEAR - 3;
  const marketing = e.tech.filter((t) => MARKETING_TECH.includes(t));

  if (icp.goal === "acquisition") {
    if (age !== null && age >= 20) add("signal", 8, "Established 20+ yrs: possible succession / retirement timing");
    else if (age !== null && age >= 10) add("signal", 4, "Established 10+ yrs: proven, durable business");
    if (stale) add("signal", 6, `Website last updated ${e.lastUpdatedYear}: under-invested, value-creation room`);
    if (!marketing.length) add("signal", 4, "No marketing tools: untapped growth lever post-acquisition");
    if (!e.signals.mobileFriendly || !e.signals.https) add("signal", 3, "Dated web presence (not mobile-ready / no HTTPS)");
    if (owner && free) add("signal", 2, "Owner-operated feel (personal mailbox)");
  } else {
    if (e.signals.hasCareersPage) add("signal", 7, "Hiring: growing and likely has budget");
    if (e.lastUpdatedYear !== null && e.lastUpdatedYear >= THIS_YEAR - 1) add("signal", 5, "Website actively maintained");
    if (marketing.length) add("signal", 5, `Invests in marketing (${marketing.slice(0, 2).join(", ")})`);
    if (e.signals.hasBooking || e.signals.hasEcommerce) add("signal", 4, "Takes bookings/orders online");
    if (e.signals.mobileFriendly && e.signals.https) add("signal", 2, "Modern, secure website");
  }

  // ---- Data quality (max 10)
  const comp = completeness(lead);
  add("quality", Math.round(comp / 10), `Profile ${comp}% complete`);

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score, tier: tierOf(score), reasons, completeness: comp };
}
