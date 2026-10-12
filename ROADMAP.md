# Caprae Capital: Full Stack Developer Pre-Work Roadmap

## 1. What they are asking, in plain words

Caprae Capital is a private equity firm. It buys small businesses and then helps them grow, often by using AI.
They built a lead-generation tool called **SaaSquatch** (saasquatchleads.com). It finds companies and the people to contact at them, for sales outreach or acquisition sourcing.

**Your task:** spend about **5 hours** building **one or two features** that make a tool like SaaSquatch more useful for a business.
They care less about how much you build and more about **whether you understand the business problem**.

## 2. The deliverables (what you send)

| # | Deliverable | Who does it |
|---|-------------|-------------|
| 1 | **GitHub repo** with the code, a `README.md` that has setup steps, and a sample dataset | We build it together |
| 2 | **Architecture write-up** covering UX choices, database, caching, hosting (static or serverless), deployment and cloud provider | We write it into the README |
| 3 | **1–2 minute video** explaining what you built, why it matters and the decisions you made | You record it (I'll write a script) |
| 4 | **Demo link** (optional, but recommended) | We deploy it |
| 5 | **Business essays**, 3 questions at 3–4 paragraphs each: Caprae's mission, why Caprae, and how Caprae is changing ETA and PE | I draft them, you personalise them |
| 6 | **Short answers**: US work status, 40 hrs/week, why Caprae, expected salary | **Only you** can answer these |
| 7 | **Confirm the terms**: 3-month probation, 9–6 EST during training, about 2 hrs/week on-call | **Only you** |
| 8 | **Email** to recruiting@capraecapital.com with your resume attached | **Only you** |

**Deadline: Tuesday, Oct 13, 2026** (7 days from the invite email on Oct 6). No extensions.

**Subject line:** the email says `Saksham Bhardwaj - Full Stack Developer - Handbook Submission`. The handbook's order is different (`Full Stack Developer - Handbook Submission - Saksham Bhardwaj`). Use the email's version, because it's the more recent instruction.

## 3. How they grade it (40 points)

| Area | Pts | What they really want to see |
|------|-----|------------------------------|
| Business use case | 10 | The tool **ranks the best leads first**, filters out junk and fits a sales workflow. It gives insights, not just raw scraped data. |
| UX/UI | 10 | It is easy to use. Filtering, verifying and exporting are obvious. It saves the user time. |
| Technicality | 10 | Data comes from more than one source. It has **dedup, enrichment and validation**, and it handles failures, rate limits and site changes. |
| Design | 5 | It looks clean and professional, with good colour, type and layout. |
| Other | 5 | Extras like CRM export, ethical scraping (robots.txt, rate limits) and clear docs |

## 4. The feature I recommend: "Lead Intelligence & Scoring"

SaaSquatch already gives users **lists** of companies. The gap is this: *"I have 500 leads. Which 20 should I call today, and why?"*

We take that "Quality First" route: build an engine that turns raw leads into a **prioritised, verified call list**.

1. **Import**: upload a CSV of companies, or paste domains.
2. **Enrich**: crawl each company's website politely (respecting robots.txt, with rate limits and caching) to pull:
   - emails, phones, social links, team or "about" page names and titles
   - industry keywords, an employee-size hint, an approximate founding year
   - website "health" (HTTPS, mobile-friendly, tech stack, copyright year as a sign the site is stale)
3. **Validate and clean**:
   - check email syntax and the domain's MX records
   - remove duplicates by normalised domain and company name
   - give each record a data-completeness %
4. **Score (0–100) with reasons**: the user sets their ideal customer profile (industry, size, location). Each lead gets a score plus readable reasons, for example "Owner email found · 20+ yrs in business · outdated site → likely succession or digitisation opportunity". This ties directly to Caprae's **ETA and acquisition** angle.
5. **Act**:
   - a table you can sort and filter, with score badges and a detail drawer for each lead
   - **export to CSV / HubSpot-ready CSV**
   - a one-click AI-drafted opening line for outreach (optional, if time allows)

## 5. Proposed tech stack (simple and deployable)

- **Frontend and API:** Next.js (React + TypeScript) with Tailwind CSS
- **Scraping:** Node `fetch` + Cheerio (HTML parsing), with a concurrency limit, timeouts, retries and a robots.txt check
- **Database:** SQLite locally through Prisma, which swaps to Postgres (Neon or Supabase) in production
- **Caching:** each domain's crawl result is cached in the database with a TTL, so leads are never scraped twice
- **Hosting:** Vercel (serverless functions + static frontend). This is an AWS-backed cloud with auto-deploy from GitHub.
- **Validation:** Node `dns.resolveMx` for the email-domain check

## 6. Build plan (about 5 hours)

| Step | Time | Output |
|------|------|--------|
| 0 | 15m | Scaffold the project: Next.js, Tailwind, Prisma |
| 1 | 60m | Enrichment crawler (homepage + contact/about pages) with a cache |
| 2 | 45m | Validation + dedup + completeness |
| 3 | 45m | Scoring engine + ideal customer profile settings |
| 4 | 75m | UI: upload, progress, results table, filters, lead drawer, export |
| 5 | 30m | Sample dataset, README, architecture section |
| 6 | 30m | Deploy to Vercel, write the video script, draft the essays |

## 7. Next step

Confirm the feature idea and the stack (or suggest changes), and we start with Step 0.
