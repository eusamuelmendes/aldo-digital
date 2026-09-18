import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  return NextResponse.json({ categories: rows });
}

const createSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
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
      .insert(categories)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description || null,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();
    return NextResponse.json({ category: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Já existe uma categoria com esse identificador.", code: "DUPLICATE" },
        { status: 409 },
      );
    }
    console.error("[POST /api/admin/categories]", error);
    return NextResponse.json({ error: "Erro ao criar categoria.", code: "INTERNAL" }, { status: 500 });
  }
}
