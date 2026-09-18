/**
 * PATCH /api/admin/products/:id — edita um produto existente.
 *
 * Nunca apaga (item 23 do briefing): "remover do cardápio" é isActive=false,
 * não um DELETE. Toda mudança de preço é registrada em audit_logs com o
 * valor antes/depois — quem mudou, quando, de quanto para quanto.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { products, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  imageUrl: z.string().min(1).max(2000).nullable().optional().or(z.literal("")),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  isActive: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categoryId: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido.", code: "BAD_JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const [before] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!before) {
    return NextResponse.json({ error: "Produto não encontrado.", code: "NOT_FOUND" }, { status: 404 });
  }

  const patch = { ...parsed.data, updatedAt: new Date() };
  if (patch.imageUrl === "") patch.imageUrl = null;

  const [after] = await db.update(products).set(patch).where(eq(products.id, id)).returning();

  const userId = request.headers.get("x-aldo-user-id") ?? undefined;

  // Auditoria específica para preço — é o dado que mais importa rastrear
  if (parsed.data.priceCents !== undefined && parsed.data.priceCents !== before.priceCents) {
    await db.insert(auditLogs).values({
      actorUserId: userId,
      action: "product.price_changed",
      entity: "Product",
      entityId: id,
      before: { priceCents: before.priceCents },
      after: { priceCents: after.priceCents },
    });
  }
  // Auditoria geral para as demais mudanças (ativar/desativar, disponibilidade, etc.)
  const otherChanges = Object.keys(parsed.data).filter((k) => k !== "priceCents");
  if (otherChanges.length > 0) {
    await db.insert(auditLogs).values({
      actorUserId: userId,
      action: "product.updated",
      entity: "Product",
      entityId: id,
      before: Object.fromEntries(otherChanges.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: Object.fromEntries(otherChanges.map((k) => [k, (after as Record<string, unknown>)[k]])),
    });
  }

  return NextResponse.json({ product: after });
}
