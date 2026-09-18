/**
 * POST /api/admin/products/:id/option-groups — cria um grupo de opções novo
 * para um produto (ex: "Ponto da carne", "Adicionais").
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { optionGroups, products } from "@/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string().min(1).max(80),
  minSelect: z.number().int().min(0).max(20).default(0),
  maxSelect: z.number().int().min(1).max(20).default(1),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado.", code: "NOT_FOUND" }, { status: 404 });
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
  if (parsed.data.minSelect > parsed.data.maxSelect) {
    return NextResponse.json(
      { error: "O mínimo de seleção não pode ser maior que o máximo.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(optionGroups)
    .values({ productId: id, ...parsed.data })
    .returning();

  return NextResponse.json({ optionGroup: { ...created, options: [] } }, { status: 201 });
}
