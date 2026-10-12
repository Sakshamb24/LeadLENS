# LeadLens

**Turn a lead list into a call list.**

Tools like SaaSquatch are good at producing lists of companies. The problem comes right after that: you have 500 rows, and you need to know which 20 to call today and what to say to them.

LeadLens takes any lead list (a SaaSquatch export, an Apollo export or a hand-made sheet). For each lead it:

1. **Removes duplicates**, including the same website written differently and the same company with "LLC" vs "Inc".
2. **Visits the company's website** (homepage + contact/about/team pages) and pulls the owner's name and title, emails, phones, social links, founding year, when the site was last updated, and the tech stack.
3. **Checks the emails**: whether the syntax is valid, whether the domain has MX records (can receive mail), and what kind of address it is (personal, role inbox or Gmail-style).
4. **Scores the lead from 0 to 100, with reasons you can read.** For example: "Decision maker found: Max Bellman (Founder) · 71 years in business · website last updated 2018."
5. **Exports** to CSV, or to a HubSpot-ready CSV whose columns map automatically on import.

It was built for the search-fund / ETA use case that Caprae and SaaSquatch serve, so it has two scoring modes:

- **Acquisition sourcing** rewards owner-operated, long-established businesses with signs of under-investment (old website, no marketing tools). Those are the businesses where an owner might be thinking about succession, and where a new operator can create value.
- **Sales outreach** flips the signals: hiring, active marketing and online booking mean a business is growing and has budget.


---

## Quick start

Requirements: Node 20+.

```bash
git clone https://github.com/Sakshamb24/LeadLENS.git
cd LeadLENS
npm install          # also generates the Prisma client
cp .env.example .env # paste a Postgres URL (a free Neon database works)
npm run db:push      # creates the tables
npm run dev          # http://localhost:3000
```

Click **Sample** to load the included dataset ([public/sample-leads.csv](public/sample-leads.csv)). It has 26 real small businesses across plumbing, HVAC, machine shops, pest control, landscaping, electrical, roofing, auto repair, accounting and dental labs, plus 3 rows added on purpose to show dedup and validation.

---

## Features and UX decisions

| What | Why |
|---|---|
| **One screen, 4-step stepper** (Import → Enrich → Prioritise → Export) | The user always knows where they are. No navigation to learn. |
| **Any CSV works.** Column names are auto-detected (`company` / `business name` / `account`, `website` / `domain` / `url`…) | People export from many tools; making them rename columns is friction. |
| **Enrichment starts automatically after import** | There's no reason to make the user click twice. |
| **Import report** ("26 added · 2 duplicates skipped · 1 invalid") that names each duplicate and what it matched | Builds trust. You can see exactly what was cleaned. |
| **Live progress bar** while enriching; leads appear scored as they finish | Long lists still feel fast. |
| **Score ring + Hot/Warm/Cold badge + top reason** in each row | You can scan the table without opening anything. |
| **Detail drawer** with the score broken down into Reachability / Fit / Timing / Data quality, each line showing its points | A score nobody can explain is a score nobody trusts. |
| **Ideal-customer settings** (goal, industries, locations, min. years) that **re-rank instantly** | Scoring runs in the browser on cached data, so nothing is re-scraped. |
| **Quick filters**: Hot / Warm / Cold, "Has verified email", "Decision maker found", "Hide unreachable" | The three questions a rep actually asks. |
| **Suggested opener** built from facts found on the site (founding year, owner's first name, city) | It's template-based, not an LLM, so every claim in it is verifiable. One-click copy. |
| **HubSpot export** with HubSpot's own property names, plus score and reasons as notes | Drops straight into an existing sales workflow. |
| **Sources section** listing every page we crawled, with a link | Anyone can check where a fact came from. |

---

## Architecture

```
Browser (Next.js client)                     Server (Next.js route handlers, Node runtime)
┌───────────────────────────┐   POST rows   ┌───────────────────────────────────────────────┐
│ CSV parse (PapaParse)     │ ────────────▶ │ /api/leads      normalise + dedup → DB        │
│ Scoring engine (pure TS)  │               │                                               │
│ Filters / sort / export   │  POST 4 ids   │ /api/enrich     ┌─ DomainCache hit? → return  │
│ Batches of 4, 2 in flight │ ────────────▶ │  (4 concurrent) └─ miss → crawler             │
└───────────────────────────┘ ◀──────────── │                    robots.txt → home → ≤3     │
          ▲  re-score instantly  leads      │                    subpages → extract →       │
          │  when ICP changes               │                    MX check → cache 7 days    │
                                            └──────────────┬────────────────────────────────┘
                                                           │ Prisma
                                                ┌──────────▼─────────┐
                                                │ Postgres (Neon)    │
                                                │ serverless, on AWS │
                                                └────────────────────┘
```

### Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + **TypeScript** |
| Styling | **Tailwind CSS v4**, `lucide-react` icons, Geist font |
| API | Next.js **Route Handlers** (`app/api/*`), Node.js runtime (needed for DNS MX lookups) |
| Scraping | Native `fetch` + **Cheerio** for HTML parsing, **robots-parser** for robots.txt |
| Validation | Node `dns.resolveMx` for email domains |
| CSV | **PapaParse** (import and export, in the browser) |
| ORM | **Prisma 6** |
| Database | **PostgreSQL on Neon** (serverless Postgres). SQLite also works for an offline local run. |
| Hosting | **Vercel**: static frontend on the CDN, API routes as serverless functions |

### Data storage

Two tables ([prisma/schema.prisma](prisma/schema.prisma)):

- **`Lead`** holds one row per company. `domain` is unique; `nameKey` (a normalised name with LLC/Inc/punctuation stripped) is indexed for name-based dedup. Enrichment results are stored as a JSON column.
- **`DomainCache`** holds one crawl result per domain, with a timestamp.

To run fully offline, set `provider = "sqlite"` in the schema and `DATABASE_URL="file:./dev.db"`. No code changes.

### Caching and performance

- **Domain cache (7-day TTL).** If a domain was crawled this week, it isn't crawled again, even if you clear your leads and re-import. Re-imports are instant, and we don't hammer small business websites.
- **MX lookup cache.** Lookups are memoised per process; most leads share a few mail domains (gmail.com, etc.).
- **Scoring runs on the client.** Changing the ICP or goal re-ranks 1,000 leads in milliseconds with no network calls.
- **Batching designed for serverless.** The browser sends 4 leads per request with 2 requests in flight (8 sites crawled concurrently). Each function call is short, so it fits inside Vercel's time limit, and the UI gets live progress for free.
- **Per-site time budget.** Each page has an 8s timeout, with one retry with backoff on 5xx/429/network errors. Each site gets a 20s budget across http/https/www variants, so one dead host can't stall a batch.
- **Response cap.** HTML is capped at 1.5 MB per page.

### Data quality

- **Dedup.** Domains are normalised (`http://www.Acme.com/contact` → `acme.com`); names are normalised (`Acme Plumbing, LLC` = `acme plumbing inc`). Duplicates are matched within the import and against existing leads.
- **Extraction sources, most reliable first.** JSON-LD structured data (`foundingDate`, `founder`, `telephone`, `PostalAddress`, `sameAs`), then `mailto:`/`tel:` links, then visible text (with `[at]`/`[dot]` de-obfuscation).
- **Junk filtering.** Image filenames that look like emails, Sentry/Wix system addresses, `noreply@`, placeholder emails, and UI words read as names ("Show Less", "Owner Operator").
- **Email ranking.** Deliverable, then personal on-domain, then role inbox, then free mailbox, then off-domain.
- **Completeness %** for every lead, so thin records are visible rather than hidden.

### Ethical crawling

- It identifies itself honestly (`LeadLensBot/1.0` user agent) and **obeys robots.txt**.
- **It does not try to bypass blocks.** If a site returns 403 to bots, the lead is marked "Blocks bots" instead of retrying with a fake browser user agent or proxies. That's a deliberate choice: the people on these lists are the people you want to do business with.
- It visits at most 4 pages per site, with a 350 ms delay between pages on the same site, and the 7-day cache prevents repeat visits.
- It only collects public business contact information that the company published on its own website.

### Deployment (Vercel + Neon)

1. Create a free Postgres database on [Neon](https://neon.tech) and copy the connection string.
2. Import the GitHub repo into [Vercel](https://vercel.com) and add the `DATABASE_URL` env var.
3. Run `npx prisma db push` once against the Neon URL to create the tables.
4. Every push to `main` now auto-deploys, and pull requests get preview URLs.

The cloud is Vercel, which runs on AWS. Neon is also on AWS, so pick the same region as your Vercel functions.

---

## Project layout

```
app/
  page.tsx              main screen (state, enrichment queue, filters, stats)
  api/leads/route.ts    GET list · POST import with dedup · DELETE all
  api/leads/[id]/       DELETE one
  api/enrich/route.ts   POST batch enrichment (serverless-sized)
components/             ImportPanel, IcpPanel, LeadTable, LeadDrawer, ui primitives
lib/
  crawler.ts            polite fetch, retries, robots.txt, homepage fallbacks
  extract.ts            HTML → facts (JSON-LD, links, text heuristics, tech detection)
  enrich.ts             crawl orchestration + domain cache + concurrency limiter
  validate.ts           email syntax / type / MX checks
  scoring.ts            explainable 0-100 score, two goal modes
  export.ts             CSV + HubSpot CSV
  normalize.ts          domain + company-name normalisation for dedup
public/sample-leads.csv demo dataset
```

## Limitations and what I'd build next

- **JavaScript-only websites** (some Wix/React sites) return little HTML. Next step: a headless-browser fallback (Playwright) for pages that come back nearly empty.
- **The copyright year** is sometimes written by JavaScript (always "this year"), which hides stale sites. A better signal would be the `Last-Modified` header or sitemap dates.
- **Email verification** stops at MX records. Full SMTP mailbox verification needs a dedicated service (e.g. ZeroBounce) because port 25 is blocked on serverless.
- **More sources**: Google Business Profile (reviews, hours), state Secretary of State filings (true founding date, registered owner) and LinkedIn headcount.
- **A background job queue** (Inngest / QStash) for 10k+ row lists, so enrichment keeps going after the tab is closed.
- **Direct HubSpot/Salesforce push** through their APIs instead of CSV.
