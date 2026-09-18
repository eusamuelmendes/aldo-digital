/**
 * PATCH /api/admin/options/:id — edita nome/preço/disponibilidade de uma opção.
 * DELETE /api/admin/options/:id — tenta remover de verdade; se a opção já foi
 * usada em algum pedido (protegido por chave estrangeira em
 * order_item_options), cai automaticamente para isActive=false e avisa —
 * nunca perde o histórico de vendas para conseguir "limpar" o cardápio.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { options } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/db-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  priceDeltaCents: z.number().int().min(-100_000).max(100_000).optional(),
  isActive: z.boolean().optional(),
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

  const [updated] = await db.update(options).set(parsed.data).where(eq(options.id, id)).returning();
  if (!updated) {
    return NextResponse.json({ error: "Opção não encontrada.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ option: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const [deleted] = await db.delete(options).where(eq(options.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: "Opção não encontrada.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, hardDeleted: true });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      const [deactivated] = await db
        .update(options)
        .set({ isActive: false })
        .where(eq(options.id, id))
        .returning();
      return NextResponse.json({
        ok: true,
        hardDeleted: false,
        option: deactivated,
        note: "Esta opção já foi usada em pedidos, então não pode ser apagada — foi apenas desativada.",
      });
    }
    console.error("[DELETE /api/admin/options/:id]", error);
    return NextResponse.json({ error: "Erro ao remover opção.", code: "INTERNAL" }, { status: 500 });
  }
}
