/**
 * Testes de INTEGRAÇÃO — contra PostgreSQL de verdade.
 *
 * Diferente dos testes de unidade (pricing.test.ts), aqui o pedido é
 * realmente gravado no banco: transação, snapshots, histórico de status,
 * sessão de mesa. É a prova de que a fundação funciona ponta a ponta, e não
 * só no papel.
 *
 * Pré-requisito: DATABASE_URL apontando para um banco de DESENVOLVIMENTO
 * já migrado (`npm run db:migrate && npm run db:seed`).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/db";
import { seed } from "../src/db/seed";
import { products, orders, orderStatusHistory, tables } from "../src/db/schema";
import {
  createOrder,
  changeOrderStatus,
  getOrder,
  OrderTransitionError,
} from "../src/server/orders/create-order";
import { PricingError } from "../src/lib/pricing";
import { createTableToken, verifyTableToken } from "../src/lib/table-token";

let espetoId: string;
let picanhaId: string;
let mesa: typeof tables.$inferSelect;

beforeAll(async () => {
  // Isolamento: a suite recria o estado do banco. Sem isto, um teste que
  // altera preço e falha no meio deixa lixo que quebra a execução seguinte
  // — foi exatamente o que aconteceu na primeira rodada destes testes.
  await seed();

  const espeto = await db.query.products.findFirst({
    where: (p, { eq: is }) => is(p.slug, "brasa-carne-bovina"),
  });
  const picanha = await db.query.products.findFirst({
    where: (p, { eq: is }) => is(p.slug, "especialidades-picanha"),
  });
  const [firstTable] = await db.select().from(tables).limit(1);

  if (!espeto || !picanha || !firstTable) {
    throw new Error("Rode `npm run db:seed` antes dos testes de integração.");
  }

  espetoId = espeto.id;
  picanhaId = picanha.id;
  mesa = firstTable;
});

afterAll(async () => {
  await sql.end();
});

describe("criação de pedido no banco", () => {
  it("grava o pedido com total calculado pelo servidor", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [{ productId: espetoId, quantity: 4 }], // 4 × R$ 14,00
    });

    expect(order.subtotalCents).toBe(5600);
    expect(order.serviceFeeCents).toBe(0); // retirada não paga taxa
    expect(order.totalCents).toBe(5600);
    expect(order.status).toBe("RECEIVED");
    expect(order.number).toBeGreaterThan(0); // número sequencial legível

    // Confere direto no banco, não só no retorno da função
    const [saved] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(saved.totalCents).toBe(5600);
  });

  it("guarda snapshot de nome e preço (relatório histórico não muda depois)", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [{ productId: espetoId, quantity: 1 }],
    });

    const [item] = order.items;
    expect(item.productName).toBe("Carne Bovina");
    expect(item.unitPriceCents).toBe(1400);

    try {
      // O bar reajusta o preço...
      await db
        .update(products)
        .set({ priceCents: 1600 })
        .where(eq(products.id, espetoId));

      const reloaded = await getOrder(order.id);
      // ...e o pedido antigo continua valendo R$ 14,00
      expect(reloaded?.items[0].unitPriceCents).toBe(1400);
      expect(reloaded?.totalCents).toBe(1400);

      // Um pedido NOVO já sai com o preço novo
      const novo = await createOrder({
        orderType: "TAKEAWAY",
        items: [{ productId: espetoId, quantity: 1 }],
      });
      expect(novo.totalCents).toBe(1600);
    } finally {
      // finally: restaura mesmo se uma asserção falhar no meio
      await db
        .update(products)
        .set({ priceCents: 1400 })
        .where(eq(products.id, espetoId));
    }
  });

  it("aplica taxa de atendimento e vincula a mesa via token do QR Code", async () => {
    const token = createTableToken(mesa, process.env.TABLE_TOKEN_SECRET!);
    const payload = await verifyTableToken(
      token,
      process.env.TABLE_TOKEN_SECRET!,
      async (id) => {
        const [t] = await db.select().from(tables).where(eq(tables.id, id));
        return t?.qrSecret ?? null;
      },
    );

    const order = await createOrder(
      {
        orderType: "DINE_IN",
        items: [{ productId: espetoId, quantity: 5 }], // R$ 70,00
      },
      { tableId: payload.t },
    );

    expect(order.subtotalCents).toBe(7000);
    expect(order.serviceFeeCents).toBe(700); // 10%
    expect(order.totalCents).toBe(7700);
    expect(order.tableId).toBe(mesa.id);
    expect(order.tableSessionId).toBeTruthy(); // abriu/reaproveitou a sessão
  });

  it("agrupa pedidos da mesma mesa na mesma sessão (fechar a conta junto)", async () => {
    const primeiro = await createOrder(
      { orderType: "DINE_IN", items: [{ productId: espetoId, quantity: 1 }] },
      { tableId: mesa.id },
    );
    const segundo = await createOrder(
      { orderType: "DINE_IN", items: [{ productId: espetoId, quantity: 2 }] },
      { tableId: mesa.id },
    );

    expect(segundo.tableSessionId).toBe(primeiro.tableSessionId);
  });

  it("recusa pedido no local sem mesa identificada", async () => {
    await expect(
      createOrder({
        orderType: "DINE_IN",
        items: [{ productId: espetoId, quantity: 1 }],
      }),
    ).rejects.toThrow(PricingError);
  });

  it("não grava nada quando um item do carrinho é inválido (transação)", async () => {
    const [{ count: antes }] = await sql`SELECT count(*)::int FROM orders`;

    await expect(
      createOrder({
        orderType: "TAKEAWAY",
        items: [
          { productId: espetoId, quantity: 2 }, // válido
          { productId: "produto-que-nao-existe", quantity: 1 }, // inválido
        ],
      }),
    ).rejects.toThrow(/não encontrado/i);

    const [{ count: depois }] = await sql`SELECT count(*)::int FROM orders`;
    expect(depois).toBe(antes); // nenhum pedido pela metade
  });

  it("registra as opções escolhidas com preço congelado", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [
        {
          productId: picanhaId,
          quantity: 1,
          // precisa do "ponto da carne" (grupo obrigatório)
          optionIds: await pickOptions(picanhaId),
        },
      ],
    });

    const saved = await getOrder(order.id);
    const optionNames = saved?.items[0].options.map((o) => o.optionName) ?? [];
    expect(optionNames.length).toBeGreaterThan(0);
    // R$ 50,00 (picanha) + R$ 2,00 (creme de alho)
    expect(saved?.totalCents).toBe(5200);
  });
});

describe("ciclo de vida do pedido", () => {
  it("registra cada transição no histórico", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [{ productId: espetoId, quantity: 1 }],
    });

    await changeOrderStatus(order.id, "CONFIRMED", { note: "aceito no painel" });
    await changeOrderStatus(order.id, "PREPARING");
    await changeOrderStatus(order.id, "READY");

    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id));

    // criação + 3 transições
    expect(history).toHaveLength(4);
    expect(history.map((h) => h.toStatus)).toEqual([
      "RECEIVED",
      "CONFIRMED",
      "PREPARING",
      "READY",
    ]);
  });

  it("impede pular etapas (recebido -> finalizado)", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [{ productId: espetoId, quantity: 1 }],
    });

    await expect(changeOrderStatus(order.id, "COMPLETED")).rejects.toThrow(
      OrderTransitionError,
    );
  });

  it("impede reabrir pedido cancelado", async () => {
    const order = await createOrder({
      orderType: "TAKEAWAY",
      items: [{ productId: espetoId, quantity: 1 }],
    });

    await changeOrderStatus(order.id, "CANCELLED", { note: "cliente desistiu" });
    await expect(changeOrderStatus(order.id, "CONFIRMED")).rejects.toThrow(
      /Transição inválida/,
    );
  });
});

/** Escolhe uma opção obrigatória + um adicional real do produto. */
async function pickOptions(productId: string): Promise<string[]> {
  const product = await db.query.products.findFirst({
    where: (p, { eq: is }) => is(p.id, productId),
    with: { optionGroups: { with: { options: true } } },
  });

  const chosen: string[] = [];
  for (const group of product?.optionGroups ?? []) {
    if (group.isRequired && group.options[0]) {
      chosen.push(group.options[0].id); // "Mal passada" (+R$ 0)
    }
    if (!group.isRequired && group.options[0]) {
      chosen.push(group.options[0].id); // "Creme de alho" (+R$ 2,00)
    }
  }
  return chosen;
}
