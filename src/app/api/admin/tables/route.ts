/**
 * GET /api/admin/tables — lista as mesas com o link assinado do QR Code de
 * cada uma, para o Aldo gerar/imprimir os códigos. Protegido pelo middleware.
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { asc } from "drizzle-orm";
import { createTableToken } from "@/lib/table-token";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.TABLE_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Sem TABLE_TOKEN_SECRET.", code: "CONFIG" }, { status: 500 });
  }

  const rows = await db.select().from(tables).orderBy(asc(tables.number));
  const origin = request.nextUrl.origin;

  return NextResponse.json({
    tables: rows.map((table) => ({
      id: table.id,
      number: table.number,
      label: table.label,
      isActive: table.isActive,
      qrUrl: `${origin}/cardapio?mesa=${createTableToken(table, secret)}`,
    })),
  });
}
