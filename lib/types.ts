export type EmailKind = "personal" | "role" | "free";

export interface EmailInfo {
  address: string;
  kind: EmailKind; // personal = jane@acme.com, role = info@acme.com, free = gmail/yahoo/etc.
  onDomain: boolean; // email domain matches the company website
  deliverable: boolean | null; // domain has MX records (null = not checked)
}

export interface Person {
  name: string;
  title: string;
}

export interface Enrichment {
  finalUrl: string;
  title: string | null;
  description: string | null;
  emails: EmailInfo[];
  phones: string[];
  socials: Partial<Record<"linkedin" | "facebook" | "twitter" | "instagram" | "youtube", string>>;
  people: Person[];
  address: string | null;
  foundedYear: number | null;
  lastUpdatedYear: number | null; // newest copyright year on the site
  tech: string[];
  signals: {
    https: boolean;
    mobileFriendly: boolean;
    hasCareersPage: boolean;
    hasEcommerce: boolean;
    hasBooking: boolean;
    hasLiveChat: boolean;
  };
  keywords: string[];
  pagesCrawled: string[];
  fetchMs: number;
}

export type LeadStatus = "pending" | "done" | "failed" | "blocked";

export interface Lead {
  id: string;
  name: string;
  domain: string | null;
  inputIndustry: string | null;
  inputLocation: string | null;
  status: LeadStatus;
  error: string | null;
  enrichment: Enrichment | null;
  enrichedAt: string | null;
  createdAt: string;
}

export type Goal = "acquisition" | "sales";

export interface ICP {
  goal: Goal;
  industries: string[]; // keywords, e.g. ["hvac", "plumbing"]
  locations: string[]; // e.g. ["TX", "Austin"]
  minYearsInBusiness: number;
}

export type Tier = "hot" | "warm" | "cold";

export interface ScoreReason {
  label: string;
  points: number;
  group: "reach" | "fit" | "signal" | "quality";
}

export interface Scored {
  score: number;
  tier: Tier;
  reasons: ScoreReason[];
  completeness: number;
}

export interface ImportRow {
  company?: string;
  website?: string;
  industry?: string;
  location?: string;
}
