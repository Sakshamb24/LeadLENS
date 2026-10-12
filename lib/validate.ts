import { promises as dns } from "node:dns";
import type { EmailInfo, EmailKind } from "./types";

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com",
  "live.com", "msn.com", "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "bellsouth.net",
  "protonmail.com", "proton.me", "ymail.com", "mail.com", "cox.net", "charter.net",
]);

const ROLE_PREFIXES = new Set([
  "info", "contact", "sales", "hello", "support", "admin", "office", "service", "services", "team",
  "help", "enquiries", "inquiries", "inquiry", "marketing", "billing", "accounts", "accounting", "hr",
  "careers", "jobs", "webmaster", "customerservice", "booking", "bookings", "reception", "mail",
  "orders", "general", "frontdesk", "dispatch", "estimates", "quotes", "media", "press", "privacy",
]);

const SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

// MX lookups are cached per process; most leads share a handful of mail domains.
const mxCache = new Map<string, Promise<boolean>>();

export function hasMx(domain: string): Promise<boolean> {
  if (FREE_PROVIDERS.has(domain)) return Promise.resolve(true);
  let p = mxCache.get(domain);
  if (!p) {
    p = Promise.race([
      dns.resolveMx(domain).then((r) => r.length > 0),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]).catch(() => false);
    mxCache.set(domain, p);
  }
  return p;
}

export function classify(address: string): EmailKind {
  const [local, domain] = address.split("@");
  if (FREE_PROVIDERS.has(domain)) return "free";
  return ROLE_PREFIXES.has(local.replace(/[^a-z]/g, "")) ? "role" : "personal";
}

export async function validateEmails(raw: string[], companyDomain: string): Promise<EmailInfo[]> {
  const unique = [...new Set(raw.map((e) => e.trim().toLowerCase().replace(/^mailto:/, "")))].filter((e) =>
    SYNTAX.test(e),
  );
  const out = await Promise.all(
    unique.map(async (address): Promise<EmailInfo> => {
      const domain = address.split("@")[1];
      return {
        address,
        kind: classify(address),
        onDomain: domain === companyDomain || domain.endsWith(`.${companyDomain}`),
        deliverable: await hasMx(domain),
      };
    }),
  );
  // Best first: personal on-domain > role on-domain > free mailbox > off-domain.
  const rank = (e: EmailInfo) =>
    (e.deliverable ? 0 : 10) + (e.kind === "personal" ? 0 : e.kind === "role" ? 1 : 2) + (e.onDomain ? 0 : 3);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 8);
}
