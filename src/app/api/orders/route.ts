/**
 * POST /api/orders — nascimento do pedido DENTRO do sistema.
 *
 * Este endpoint é o que substitui o "abrir o WhatsApp com um texto pronto".
 * O pedido é validado, precificado no servidor, gravado no banco e devolvido
 * com número próprio (#1047) para acompanhamento.
 *
 * A mesa NUNCA vem do corpo da requisição: ela é derivada do token assinado
 * do QR Code. Mandar {"tableId": "..."} no JSON não tem efeito nenhum.
 */

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { PricingError } from "@/lib/pricing";
import { verifyTableToken, TableTokenError } from "@/lib/table-token";
import { createOrder, createOrderSchema } from "@/server/orders/create-order";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido.", code: "BAD_JSON" },
      { status: 400 },
    );
  }

  try {
    const input = createOrderSchema.parse(body);

    // --- resolve a mesa a partir do token assinado, não do corpo ----------
    let tableId: string | undefined;
    if (input.tableToken) {
      const secret = process.env.TABLE_TOKEN_SECRET;
      if (!secret) {
        return NextResponse.json(
          { error: "Servidor sem TABLE_TOKEN_SECRET configurado.", code: "CONFIG" },
          { status: 500 },
        );
      }
      const payload = await verifyTableToken(
        input.tableToken,
        secret,
        async (id) => {
          const [table] = await db
            .select({ qrSecret: tables.qrSecret })
            .from(tables)
            .where(and(eq(tables.id, id), eq(tables.isActive, true)))
            .limit(1);
          return table?.qrSecret ?? null;
        },
      );
      tableId = payload.t;
    }

    const order = await createOrder(input, { tableId });

    return NextResponse.json(
      {
        order: {
          id: order.id,
          number: order.number,
          status: order.status,
          type: order.type,
          tableId: order.tableId,
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
            options: item.options.map((option) => ({
              name: option.optionName,
              priceDeltaCents: option.priceDeltaCents,
            })),
          })),
          createdAt: order.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Pedido inválido.", code: "VALIDATION", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof PricingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 422 },
      );
    }
    if (error instanceof TableTokenError) {
      return NextResponse.json(
        { error: "QR Code da mesa inválido.", code: error.code },
        { status: 403 },
      );
    }

    console.error("[POST /api/orders]", error);
    return NextResponse.json(
      { error: "Erro interno ao criar o pedido.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
