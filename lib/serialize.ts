import type { Lead as DbLead } from "@prisma/client";
import type { Lead, LeadStatus } from "./types";

export function toLead(row: DbLead): Lead {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    inputIndustry: row.inputIndustry,
    inputLocation: row.inputLocation,
    status: row.status as LeadStatus,
    error: row.error,
    enrichment: row.enrichment ? JSON.parse(row.enrichment) : null,
    enrichedAt: row.enrichedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
