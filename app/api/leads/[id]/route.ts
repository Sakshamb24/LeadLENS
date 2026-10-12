import { db } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.lead.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
