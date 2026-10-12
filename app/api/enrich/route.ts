import { enrichLead, mapLimit } from "@/lib/enrich";
import { toLead } from "@/lib/serialize";

// The browser sends small batches (a few leads per request), so each serverless call stays
// well under the time limit and the UI can show live progress. Big lists = many short calls.
export const maxDuration = 60;

const MAX_BATCH = 8;
const CONCURRENCY = 4;

export async function POST(req: Request) {
  const { ids, force = false } = (await req.json()) as { ids: string[]; force?: boolean };
  if (!Array.isArray(ids) || !ids.length) return Response.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_BATCH) return Response.json({ error: `Max ${MAX_BATCH} ids per call` }, { status: 413 });

  const rows = await mapLimit(ids, CONCURRENCY, (id) => enrichLead(id, force));
  return Response.json(rows.filter((r) => r !== null).map(toLead));
}
