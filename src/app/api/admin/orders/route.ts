/**
 * GET /api/admin/orders — fila de pedidos para o painel/cozinha.
 * Protegido pelo middleware (src/middleware.ts). Sem parâmetro `status`,
 * devolve os pedidos "em aberto" (tudo que ainda não foi entregue/encerrado).
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { inArray } from "drizzle-orm";
import type { OrderStatus } from "@/db/schema";

const OPEN_STATUSES: OrderStatus[] = ["RECEIVED", "CONFIRMED", "PREPARING", "READY"];

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status");
  const statuses = statusParam
    ? (statusParam.split(",") as OrderStatus[])
    : OPEN_STATUSES;

  const rows = await db.query.orders.findMany({
    where: (order) => inArray(order.status, statuses),
    orderBy: (order, { asc }) => [asc(order.createdAt)],
    with: {
      items: { with: { options: true } },
      table: true,
    },
    limit: 100,
  });

  return NextResponse.json({
    orders: rows.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      type: order.type,
      table: order.table ? { number: order.table.number, label: order.table.label } : null,
      totalCents: order.totalCents,
      notes: order.notes,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        notes: item.notes,
        options: item.options.map((o) => o.optionName),
      })),
    })),
  });
}
