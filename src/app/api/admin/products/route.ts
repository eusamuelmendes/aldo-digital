/**
 * GET /api/admin/products — lista TODOS os produtos (inclusive inativos),
 * para a tela de gestão do cardápio. Diferente de /api/products (público),
 * que só mostra o que está ativo.
 *
 * POST /api/admin/products — cria um produto novo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { products, auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.query.products.findMany({
    orderBy: (product, { asc: a }) => [a(product.categoryId), a(product.sortOrder)],
    with: { optionGroups: { with: { options: true } } },
  });
  return NextResponse.json({ products: rows });
}

const createSchema = z.object({
  categoryId: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // Aceita URL absoluta (colada pelo admin) ou caminho relativo (retornado
  // pelo upload, ex: "/api/uploads/products/xxx.png") — z.string().url()
  // sozinho rejeitaria o segundo caso.
  imageUrl: z.string().min(1).max(2000).optional().or(z.literal("")),
  priceCents: z.number().int().min(0).max(10_000_00),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido.", code: "BAD_JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  try {
    const [created] = await db
      .insert(products)
      .values({
        categoryId: parsed.data.categoryId,
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
        priceCents: parsed.data.priceCents,
        isFeatured: parsed.data.isFeatured ?? false,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();

    const userId = request.headers.get("x-aldo-user-id") ?? undefined;
    await db.insert(auditLogs).values({
      actorUserId: userId,
      action: "product.created",
      entity: "Product",
      entityId: created.id,
      after: created,
    });

    return NextResponse.json({ product: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Já existe um produto com esse identificador (slug).", code: "DUPLICATE" },
        { status: 409 },
      );
    }
    console.error("[POST /api/admin/products]", error);
    return NextResponse.json({ error: "Erro ao criar produto.", code: "INTERNAL" }, { status: 500 });
  }
}
