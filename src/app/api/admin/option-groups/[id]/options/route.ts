/**
 * POST /api/admin/option-groups/:id/options — adiciona uma opção
 * (ex: "Ao ponto", "Creme de alho +R$2,00") a um grupo existente.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { options, optionGroups } from "@/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string().min(1).max(80),
  priceDeltaCents: z.number().int().min(-100_000).max(100_000).default(0),
  sortOrder: z.number().int().default(0),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [group] = await db.select().from(optionGroups).where(eq(optionGroups.id, id)).limit(1);
  if (!group) {
    return NextResponse.json({ error: "Grupo não encontrado.", code: "NOT_FOUND" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido.", code: "BAD_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(options)
    .values({ optionGroupId: id, ...parsed.data })
    .returning();

  return NextResponse.json({ option: created }, { status: 201 });
}
