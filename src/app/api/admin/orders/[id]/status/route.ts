/**
 * PATCH /api/admin/orders/:id/status — avança (ou cancela) um pedido.
 * Usa a mesma máquina de estados testada em create-order.ts — o painel não
 * tem um caminho "por fora" que ignore as transições permitidas.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { changeOrderStatus, OrderTransitionError } from "@/server/orders/create-order";

const schema = z.object({
  status: z.enum(["CONFIRMED", "PREPARING", "READY", "DELIVERED", "COMPLETED", "CANCELLED"]),
  note: z.string().max(280).optional(),
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Status inválido.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  try {
    const userId = request.headers.get("x-aldo-user-id") ?? undefined;
    const order = await changeOrderStatus(id, parsed.data.status, {
      userId,
      note: parsed.data.note,
    });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[PATCH /api/admin/orders/:id/status]", error);
    return NextResponse.json(
      { error: "Erro interno ao mudar status.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
