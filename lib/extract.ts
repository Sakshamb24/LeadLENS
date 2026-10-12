import * as cheerio from "cheerio";
import type { Person } from "./types";

// Everything we can learn from a single page. Pages are merged in enrich.ts.
export interface PageFacts {
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  people: Person[];
  address: string | null;
  foundedYear: number | null;
  copyrightYear: number | null;
  tech: string[];
  mobileFriendly: boolean;
  hasCareersPage: boolean;
  hasEcommerce: boolean;
  hasBooking: boolean;
  hasLiveChat: boolean;
  headings: string[];
  links: { href: string; text: string }[];
}

const THIS_YEAR = new Date().getFullYear();

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g;
const JUNK_EMAIL =
  /\.(png|jpe?g|gif|svg|webp|css|js)$|example\.|sentry|wixpress|domain\.com|email\.com|yourname|yourdomain|@sentry|noreply|no-reply|godaddy\.com/i;

const DECISION_TITLES = [
  "co-owner", "owner", "co-founder", "founder", "president", "ceo", "chief executive officer",
  "managing partner", "managing director", "general manager", "principal", "partner",
  "vice president", "chief operating officer", "coo", "cfo", "chief financial officer",
  "operations manager", "office manager", "director",
];
const TITLE_RE = new RegExp(`\\b(${DECISION_TITLES.map((t) => t.replace(/-/g, "\\-")).join("|")})\\b`, "i");

// Capitalised words that look like names but aren't.
const NOT_NAME = new Set(
  ("about our team contact us home the services service company group inc llc read more meet view " +
    "learn get free quote call today why choose welcome new local family owned operated your all " +
    "rights reserved privacy policy terms of best and for with from st street ave suite north south " +
    "east west google maps click here menu search shop cart book now leadership staff board directors " +
    "management executive office customer support sales hours open monday friday saturday sunday " +
    "mission vision story history careers jobs blog news faq reviews testimonials gallery projects " +
    "show less hide close open next previous back top skip content main navigation toggle see " +
    "owner operator founder president ceo partner manager director vice chief officer cfo coo").split(" "),
);

const TECH_RULES: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes/],
  ["Shopify", /cdn\.shopify\.com|shopify\.theme/],
  ["Wix", /wixstatic\.com|static\.wixstatic|x-wix/],
  ["Squarespace", /squarespace\.com|static1\.squarespace/],
  ["Webflow", /webflow\.(com|io)|data-wf-page/],
  ["GoDaddy Builder", /img1\.wsimg\.com|godaddy website builder/],
  ["Google Analytics", /google-analytics\.com|gtag\(|googletagmanager\.com\/gtag/],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js/],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents|fbq\(/],
  ["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics/],
  ["Mailchimp", /chimpstatic\.com|list-manage\.com/],
  ["Calendly", /calendly\.com/],
  ["Stripe", /js\.stripe\.com/],
  ["WooCommerce", /woocommerce/],
  ["ServiceTitan", /servicetitan/],
  ["Housecall Pro", /housecallpro/],
  ["Intercom", /widget\.intercom\.io|intercomcdn/],
  ["Drift", /js\.driftt\.com/],
  ["Tawk.to", /embed\.tawk\.to/],
  ["Zendesk", /static\.zdassets\.com/],
];

const STOPWORDS = new Set(
  ("a an the and or of to in for on with by at from is are we our your you us it this that as be " +
    "home page welcome inc llc co company services service contact about best more new all get " +
    "call free quote today near me").split(" "),
);

function yearOk(y: number) {
  return y >= 1850 && y <= THIS_YEAR;
}

function looksLikeName(s: string): boolean {
  const words = s.trim().split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  return words.every(
    (w) => /^[A-Z][a-z'’-]+\.?$|^[A-Z]\.$/.test(w) && !NOT_NAME.has(w.toLowerCase().replace(/\.$/, "")),
  );
}

function cleanTitle(s: string): string | null {
  const m = s.match(TITLE_RE);
  if (!m) return null;
  // Keep the short phrase around the title ("Owner & Master Plumber") rather than a whole sentence.
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= 50 ? t : m[1].replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhone(a: string, b: string, c: string) {
  return `(${a}) ${b}-${c}`;
}

// Walks JSON-LD (handles @graph and nested arrays) and yields every object.
function* walkLd(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const n of node) yield* walkLd(n);
  else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    yield obj;
    if (obj["@graph"]) yield* walkLd(obj["@graph"]);
    for (const k of ["founder", "employee", "address", "author"]) if (obj[k]) yield* walkLd(obj[k]);
  }
}

export function extractPage(html: string, pageUrl: string): PageFacts {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();

  const facts: PageFacts = {
    title: $("title").first().text().trim() || null,
    description:
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      null,
    emails: [],
    phones: [],
    socials: {},
    people: [],
    address: null,
    foundedYear: null,
    copyrightYear: null,
    tech: TECH_RULES.filter(([, re]) => re.test(lowerHtml)).map(([n]) => n),
    mobileFriendly: /width=device-width/i.test($('meta[name="viewport"]').attr("content") ?? ""),
    hasCareersPage: false,
    hasEcommerce: /cdn\.shopify|woocommerce|add to cart|add-to-cart|js\.stripe\.com/.test(lowerHtml),
    hasBooking: /calendly|acuityscheduling|housecallpro|servicetitan|book (now|online|an appointment)|schedule (service|online|an appointment)/.test(lowerHtml),
    hasLiveChat: /intercom|driftt|tawk\.to|zdassets|livechatinc|tidio/.test(lowerHtml),
    headings: [],
    links: [],
  };

  // ---- structured data first: it's the most reliable source when present
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    for (const o of walkLd(data)) {
      const type = String(o["@type"] ?? "");
      if (typeof o.email === "string") facts.emails.push(o.email.replace(/^mailto:/i, ""));
      if (typeof o.telephone === "string") facts.phones.push(o.telephone);
      if (typeof o.foundingDate === "string") {
        const y = parseInt(o.foundingDate.slice(0, 4), 10);
        if (yearOk(y)) facts.foundedYear = y;
      }
      if (type === "PostalAddress" && !facts.address) {
        const parts = [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode].filter(
          (p) => typeof p === "string" && p,
        );
        if (parts.length >= 2) facts.address = parts.join(", ");
      }
      if (type === "Person" && typeof o.name === "string" && looksLikeName(o.name)) {
        facts.people.push({ name: o.name, title: typeof o.jobTitle === "string" ? o.jobTitle : "Founder" });
      }
      const sameAs = Array.isArray(o.sameAs) ? o.sameAs : typeof o.sameAs === "string" ? [o.sameAs] : [];
      for (const s of sameAs) if (typeof s === "string") addSocial(facts, s);
    }
  });

  // ---- links: mailto / tel / socials / navigation
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (/^mailto:/i.test(href)) facts.emails.push(decodeURIComponent(href.slice(7).split("?")[0]));
    else if (/^tel:/i.test(href)) facts.phones.push(href.slice(4));
    else {
      addSocial(facts, href);
      try {
        const abs = new URL(href, pageUrl).toString();
        facts.links.push({ href: abs, text });
        if (/career|jobs|join[- ]our[- ]team|employment|now hiring|we.?re hiring/i.test(href + " " + text)) {
          facts.hasCareersPage = true;
        }
      } catch {
        /* ignore bad hrefs */
      }
    }
  });

  // ---- visible text
  $("script, style, noscript, svg, iframe").remove();
  // cheerio's .text() glues neighbouring elements together ("info@acme.comAddress"), so pad every element first.
  $("body *").each((_, el) => {
    $(el).prepend(" ").append(" ");
  });
  const text = $("body").text().replace(/\s+/g, " ");
  const deobfuscated = text.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");

  facts.emails.push(...(deobfuscated.match(EMAIL_RE) ?? []));
  for (const m of text.matchAll(PHONE_RE)) facts.phones.push(formatPhone(m[1], m[2], m[3]));

  // Copyright year = when the site was last touched.
  for (const m of text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)) {
    const y = parseInt(m[1], 10);
    if (yearOk(y)) facts.copyrightYear = Math.max(facts.copyrightYear ?? 0, y);
  }

  // Founded year: "since 1987", "established in 1987", "founded in 1987", "over 30 years"
  if (!facts.foundedYear) {
    const m = text.match(/\b(?:founded|established|est\.?|since|in business since|serving [^.]{0,40}? since)\s*(?:in\s*)?((?:18|19|20)\d{2})\b/i);
    if (m && yearOk(+m[1])) facts.foundedYear = +m[1];
    else {
      const y = text.match(/\b(?:over|more than|nearly|almost)?\s*(\d{1,3})\+?\s*years\s+(?:of\s+(?:experience|service)|in business|serving)/i);
      if (y && +y[1] >= 3 && +y[1] <= 150) facts.foundedYear = THIS_YEAR - +y[1];
    }
  }

  if (!facts.address) {
    const a = text.match(/\d{2,6} [A-Z0-9][A-Za-z0-9 .]{2,40},?\s+[A-Z][A-Za-z .]{2,30},\s*[A-Z]{2}\s+\d{5}/);
    if (a) facts.address = a[0].trim();
  }

  // ---- people: "Jane Smith, Owner" on one line, or a name line followed by a title line (team cards)
  const lines: string[] = [];
  $("h1,h2,h3,h4,h5,h6,p,li,strong,b,span,td,figcaption,dt,dd").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length < 140) lines.push(t);
  });
  $("h1,h2,h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length < 120) facts.headings.push(t);
  });

  const inline = /([A-Z][a-z'’-]+(?: [A-Z]\.)? [A-Z][a-zA-Z'’-]+)\s*(?:,|–|—|-|\||:)\s*((?:the\s+)?[A-Za-z &/-]{2,50})/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(inline);
    if (m && looksLikeName(m[1])) {
      const title = cleanTitle(m[2]);
      if (title) facts.people.push({ name: m[1], title });
    }
    if (looksLikeName(line) && i + 1 < lines.length && lines[i + 1].length <= 60) {
      const title = cleanTitle(lines[i + 1]);
      if (title) facts.people.push({ name: line, title });
    }
    const founded = line.match(/founded (?:in \d{4} )?by ([A-Z][a-z'’-]+ [A-Z][a-zA-Z'’-]+)/);
    if (founded && looksLikeName(founded[1])) facts.people.push({ name: founded[1], title: "Founder" });
  }

  return facts;
}

function addSocial(facts: PageFacts, href: string) {
  if (/sharer|share\?|intent\/|\/share|\/plugins\//i.test(href)) return;
  const rules: [string, RegExp][] = [
    ["linkedin", /linkedin\.com\/(company|in|school)\/[^/?#\s"']+/i],
    ["facebook", /facebook\.com\/[^/?#\s"']+/i],
    ["twitter", /(?:\/\/|www\.)(?:twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]+/i],
    ["instagram", /instagram\.com\/[^/?#\s"']+/i],
    ["youtube", /youtube\.com\/(channel|c|user|@)[^?#\s"']*/i],
  ];
  for (const [key, re] of rules) {
    const m = href.match(re);
    if (m && !facts.socials[key]) facts.socials[key] = `https://${m[0].replace(/^(https?:)?\/\//, "").replace(/^www\./, "")}`;
  }
}

export function topKeywords(chunks: (string | null)[], n = 8): string[] {
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const w of chunk.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
      if (STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

export const isJunkEmail = (e: string) => JUNK_EMAIL.test(e) || /^[a-f0-9]{16,}@/i.test(e) || e.length > 60;
export const isDecisionMaker = (title: string) =>
  /owner|founder|president|ceo|chief|principal|managing|partner|general manager/i.test(title);
