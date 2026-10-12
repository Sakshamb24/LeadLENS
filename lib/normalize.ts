// Turns "https://www.Acme.com/about?x=1" into "acme.com".
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // People paste emails into the website column more often than you'd think.
  if (s.includes("@") && !s.includes("/")) s = s.split("@")[1];
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\d?\./, "");
  s = s.split(/[/?#:\s]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

const SUFFIXES = /\b(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|incorporated|pllc|lp|llp|the)\b/g;

// Key used to catch "Acme Plumbing, LLC" vs "acme plumbing inc." as the same company.
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Best-effort company name from a domain when the CSV has no name column.
export function nameFromDomain(domain: string): string {
  const base = domain.split(".")[0].replace(/-/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}
