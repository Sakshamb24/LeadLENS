import robotsParser from "robots-parser";

export const USER_AGENT =
  "LeadLensBot/1.0 (+https://github.com/leadlens; polite lead-enrichment crawler)";

const PAGE_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;

export class CrawlError extends Error {
  constructor(
    message: string,
    public kind: "unreachable" | "blocked" | "not_html",
  ) {
    super(message);
  }
}

export interface Page {
  url: string;
  html: string;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export type FetchResult =
  | { ok: true; url: string; text: string; type: string }
  | { ok: false; status: number | null; reason: string };

// One retry with backoff on network errors / 5xx / 429. Other 4xx are final.
export async function fetchPage(url: string, attempts = 2): Promise<FetchResult> {
  let last: FetchResult = { ok: false, status: null, reason: "no response" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchOnce(url);
      if (res.ok) {
        const text = (await res.text()).slice(0, MAX_HTML_BYTES);
        return { ok: true, url: res.url || url, text, type: res.headers.get("content-type") ?? "" };
      }
      last = { ok: false, status: res.status, reason: `HTTP ${res.status}` };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      last = { ok: false, status: null, reason: e.name === "AbortError" ? "timed out" : e.cause?.code ?? e.message };
    }
    if (attempt < attempts - 1) await sleep(800);
  }
  return last;
}

export async function fetchText(url: string) {
  const r = await fetchPage(url);
  return r.ok ? r : null;
}

type Robots = ReturnType<typeof robotsParser>;

export async function loadRobots(origin: string): Promise<Robots | null> {
  const robotsUrl = `${origin}/robots.txt`;
  const res = await fetchPage(robotsUrl, 1);
  if (!res.ok || /html/i.test(res.type)) return null; // no robots.txt = everything allowed
  return robotsParser(robotsUrl, res.text);
}

export function allowed(robots: Robots | null, url: string): boolean {
  if (!robots) return true;
  return robots.isAllowed(url, USER_AGENT) !== false;
}

// Try https → https://www → http until one answers with HTML.
export async function fetchHomepage(domain: string): Promise<{ page: Page; robots: Robots | null }> {
  const candidates = [`https://${domain}`, `https://www.${domain}`, `http://${domain}`];
  const failures: FetchResult[] = [];
  const started = Date.now();
  for (const base of candidates) {
    // Stay well inside the serverless time limit: a dead host shouldn't eat the whole batch.
    if (Date.now() - started > 20_000) break;
    const robots = await loadRobots(base);
    if (!allowed(robots, `${base}/`)) {
      throw new CrawlError("Site's robots.txt disallows crawling", "blocked");
    }
    const res = await fetchPage(`${base}/`);
    if (!res.ok) {
      failures.push(res);
      continue;
    }
    if (!/html|xml/i.test(res.type) && res.type) throw new CrawlError("Homepage is not HTML", "not_html");
    return { page: { url: res.url, html: res.text }, robots };
  }
  // A 401/403 means the site deliberately refuses bots. We respect that rather than disguising ourselves.
  const refused = failures.find((f) => !f.ok && (f.status === 401 || f.status === 403));
  if (refused) throw new CrawlError("Site refuses automated visitors (HTTP 403)", "blocked");
  const why = failures.map((f) => (!f.ok ? f.reason : "")).find(Boolean) ?? "no response";
  throw new CrawlError(`Website did not respond (${why})`, "unreachable");
}
