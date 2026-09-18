/**
 * PATCH /api/admin/option-groups/:id — edita nome/regras de um grupo.
 * DELETE /api/admin/option-groups/:id — remove o grupo, SE nenhuma das suas
 * opções já foi usada em algum pedido (o banco protege isso via chave
 * estrangeira — ver order_item_options). Se já foi usada, a exclusão é
 * recusada e sugerimos desativar as opções em vez de apagar o grupo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { optionGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/db-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  isRequired: z.boolean().optional(),
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

  const [updated] = await db
    .update(optionGroups)
    .set(parsed.data)
    .where(eq(optionGroups.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Grupo não encontrado.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ optionGroup: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const [deleted] = await db.delete(optionGroups).where(eq(optionGroups.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: "Grupo não encontrado.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json(
        {
          error:
            "Não é possível remover: uma ou mais opções deste grupo já foram usadas em pedidos. Desative as opções individualmente em vez de apagar o grupo.",
          code: "IN_USE",
        },
        { status: 409 },
      );
    }
    console.error("[DELETE /api/admin/option-groups/:id]", error);
    return NextResponse.json({ error: "Erro ao remover grupo.", code: "INTERNAL" }, { status: 500 });
  }
}
