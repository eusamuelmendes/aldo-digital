/**
 * GET /api/orders/:id — acompanhamento do pedido pelo cliente.
 * Público de propósito (o cliente não faz login para acompanhar), mas o id
 * é opaco e não-sequencial (src/lib/id.ts) — não dá para "adivinhar" outro
 * pedido a partir do seu.
 */
import { NextResponse } from "next/server";
import { getOrder } from "@/server/orders/create-order";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) {
    return NextResponse.json(
      { error: "Pedido não encontrado.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      type: order.type,
      table: order.table ? { number: order.table.number, label: order.table.label } : null,
      subtotalCents: order.subtotalCents,
      serviceFeeCents: order.serviceFeeCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        notes: item.notes,
        options: item.options.map((o) => ({
          name: o.optionName,
          priceDeltaCents: o.priceDeltaCents,
        })),
      })),
      statusHistory: order.statusHistory
        .map((h) => ({ toStatus: h.toStatus, at: h.createdAt }))
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
      createdAt: order.createdAt,
    },
  });
}
