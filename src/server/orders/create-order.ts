/**
 * Caso de uso: criar um pedido.
 *
 * Fluxo:
 *   1. carrega do banco os produtos citados (fonte de verdade de preço)
 *   2. recalcula tudo em `priceOrder` (função pura, testada à parte)
 *   3. grava pedido + itens + opções + primeira linha do histórico numa
 *      ÚNICA transação — ou nasce tudo, ou não nasce nada
 *
 * O que o cliente envia nunca inclui preço. Ver src/lib/pricing.ts.
 */

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  orderItems,
  orderItemOptions,
  orderStatusHistory,
  customers,
  tableSessions,
  settings,
  type OrderStatus,
} from "@/db/schema";
import {
  priceOrder,
  PricingError,
  DEFAULT_POLICY,
  type CatalogProduct,
  type PricingPolicy,
} from "@/lib/pricing";

export const createOrderSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  /** Token assinado do QR Code; obrigatório para consumo no local. */
  tableToken: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        optionIds: z.array(z.string().min(1)).max(20).optional(),
        notes: z.string().max(280).optional(),
      }),
    )
    .min(1)
    .max(60),
  customer: z
    .object({
      name: z.string().max(120).optional(),
      phone: z.string().min(8).max(20),
    })
    .optional(),
  notes: z.string().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type CreateOrderContext = {
  /** Resolvido a partir do tableToken pela rota — nunca vem do corpo da requisição. */
  tableId?: string;
  createdByUserId?: string;
};

export async function loadPolicy(): Promise<PricingPolicy> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "service_fee_percent"))
    .limit(1);

  const fromEnv = Number(process.env.SERVICE_FEE_PERCENT);
  const percent =
    Number(row?.value) ||
    (Number.isFinite(fromEnv) ? fromEnv : DEFAULT_POLICY.serviceFeePercent);

  return { ...DEFAULT_POLICY, serviceFeePercent: percent };
}

/** Busca os produtos citados no carrinho, com seus grupos de opções. */
export async function loadCatalog(
  productIds: string[],
): Promise<Map<string, CatalogProduct>> {
  if (productIds.length === 0) return new Map();

  const rows = await db.query.products.findMany({
    where: (product, { inArray: isIn }) => isIn(product.id, productIds),
    with: { optionGroups: { with: { options: true } } },
  });

  return new Map(
    rows.map((product) => [
      product.id,
      {
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        isActive: product.isActive,
        isAvailable: product.isAvailable,
        optionGroups: product.optionGroups.map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired,
          options: group.options.map((option) => ({
            id: option.id,
            optionGroupId: option.optionGroupId,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
            isActive: option.isActive,
          })),
        })),
      },
    ]),
  );
}

export async function createOrder(
  input: CreateOrderInput,
  context: CreateOrderContext = {},
) {
  if (input.orderType === "DINE_IN" && !context.tableId) {
    throw new PricingError(
      "Pedido no local exige uma mesa identificada pelo QR Code.",
      "TABLE_REQUIRED",
    );
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const [catalog, policy] = await Promise.all([
    loadCatalog(productIds),
    loadPolicy(),
  ]);

  // ---- ponto crítico: o total nasce aqui, do banco, nunca do navegador ----
  const priced = priceOrder(
    { items: input.items, orderType: input.orderType },
    catalog,
    policy,
  );

  return db.transaction(async (tx) => {
    let customerId: string | undefined;
    if (input.customer?.phone) {
      const [customer] = await tx
        .insert(customers)
        .values({
          phone: input.customer.phone,
          name: input.customer.name,
        })
        .onConflictDoUpdate({
          target: customers.phone,
          set: {
            name: input.customer.name ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      customerId = customer.id;
    }

    // Mesa ocupada reaproveita a sessão aberta; senão abre uma nova.
    let tableSessionId: string | undefined;
    if (context.tableId) {
      const [open] = await tx
        .select()
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.tableId, context.tableId),
            eq(tableSessions.status, "OPEN"),
          ),
        )
        .limit(1);

      if (open) {
        tableSessionId = open.id;
      } else {
        const [created] = await tx
          .insert(tableSessions)
          .values({ tableId: context.tableId, status: "OPEN" })
          .returning();
        tableSessionId = created.id;
      }
    }

    const [order] = await tx
      .insert(orders)
      .values({
        type: input.orderType,
        status: "RECEIVED",
        customerId,
        tableId: context.tableId,
        tableSessionId,
        createdByUserId: context.createdByUserId,
        subtotalCents: priced.subtotalCents,
        serviceFeeCents: priced.serviceFeeCents,
        deliveryFeeCents: priced.deliveryFeeCents,
        discountCents: priced.discountCents,
        totalCents: priced.totalCents,
        notes: input.notes,
      })
      .returning();

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        priced.items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          productName: item.productName, // snapshot
          unitPriceCents: item.unitPriceCents, // snapshot
          quantity: item.quantity,
          notes: item.notes,
          lineTotalCents: item.lineTotalCents,
        })),
      )
      .returning();

    const optionRows = priced.items.flatMap((item, index) =>
      item.options.map((option) => ({
        orderItemId: insertedItems[index].id,
        optionId: option.optionId,
        optionName: option.optionName, // snapshot
        priceDeltaCents: option.priceDeltaCents, // snapshot
      })),
    );
    if (optionRows.length > 0) {
      await tx.insert(orderItemOptions).values(optionRows);
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "RECEIVED",
      changedByUserId: context.createdByUserId,
      note: "Pedido criado pelo cliente",
    });

    return {
      ...order,
      items: insertedItems.map((item, index) => ({
        ...item,
        options: priced.items[index].options,
      })),
    };
  });
}

/**
 * Máquina de estados do pedido. Impede pulos inválidos — por exemplo, marcar
 * como FINALIZADO um pedido que a cozinha nunca viu.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class OrderTransitionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export async function changeOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  options: { userId?: string; note?: string } = {},
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new OrderTransitionError("Pedido não encontrado.", "NOT_FOUND");
    }
    if (!canTransition(order.status, toStatus)) {
      throw new OrderTransitionError(
        `Transição inválida: ${order.status} -> ${toStatus}.`,
        "INVALID_TRANSITION",
      );
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus,
      changedByUserId: options.userId,
      note: options.note,
    });

    return updated;
  });
}

/** Busca um pedido completo (para a tela de acompanhamento do cliente). */
export async function getOrder(orderId: string) {
  return db.query.orders.findFirst({
    where: (order, { eq: is }) => is(order.id, orderId),
    with: {
      items: { with: { options: true } },
      table: true,
      statusHistory: true,
    },
  });
}

export { inArray };
