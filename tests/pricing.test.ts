/**
 * Testes do cálculo de preço.
 *
 * O objetivo central aqui é provar a afirmação de segurança do item 6/25 do
 * briefing: NÃO É POSSÍVEL o cliente influenciar o preço. Os testes de
 * "manipulação" abaixo são a evidência disso.
 */

import { describe, it, expect } from "vitest";
import {
  priceOrder,
  PricingError,
  DEFAULT_POLICY,
  type CatalogProduct,
} from "../src/lib/pricing";
import { formatBRL, parseBRLToCents, percentOf } from "../src/lib/money";

// Catálogo de teste com preços reais do cardápio do Aldo
const picanha: CatalogProduct = {
  id: "p_picanha",
  name: "Picanha",
  priceCents: 5000, // R$ 50,00
  isActive: true,
  isAvailable: true,
  optionGroups: [
    {
      id: "g_ponto",
      name: "Ponto da carne",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [
        { id: "o_mal", optionGroupId: "g_ponto", name: "Mal passada", priceDeltaCents: 0, isActive: true },
        { id: "o_ponto", optionGroupId: "g_ponto", name: "Ao ponto", priceDeltaCents: 0, isActive: true },
      ],
    },
    {
      id: "g_add",
      name: "Adicionais",
      minSelect: 0,
      maxSelect: 2,
      isRequired: false,
      options: [
        { id: "o_creme", optionGroupId: "g_add", name: "Creme de alho", priceDeltaCents: 200, isActive: true },
        { id: "o_ovo", optionGroupId: "g_add", name: "Ovo frito", priceDeltaCents: 200, isActive: true },
        { id: "o_off", optionGroupId: "g_add", name: "Fora de linha", priceDeltaCents: 500, isActive: false },
      ],
    },
  ],
};

const espeto: CatalogProduct = {
  id: "p_espeto",
  name: "Carne Bovina",
  priceCents: 1400,
  isActive: true,
  isAvailable: true,
  optionGroups: [],
};

const acabou: CatalogProduct = {
  id: "p_costela",
  name: "Costela Bovina",
  priceCents: 1950,
  isActive: true,
  isAvailable: false, // acabou hoje
  optionGroups: [],
};

const catalog = new Map<string, CatalogProduct>([
  [picanha.id, picanha],
  [espeto.id, espeto],
  [acabou.id, acabou],
]);

describe("dinheiro em centavos", () => {
  it("soma centavos sem erro de ponto flutuante", () => {
    // O clássico: 0.1 + 0.2 !== 0.3 em float
    expect(0.1 + 0.2).not.toBe(0.3);
    // Em centavos, é exato
    expect(10 + 20).toBe(30);
  });

  it("formata e converte valores brasileiros", () => {
    expect(formatBRL(1400).replace(/ /g, " ")).toBe("R$ 14,00");
    expect(parseBRLToCents("R$ 14,00")).toBe(1400);
    expect(parseBRLToCents("1.950,00")).toBe(195000);
    expect(percentOf(8750, 10)).toBe(875);
  });
});

describe("cálculo do pedido", () => {
  it("multiplica quantidade pelo preço do banco", () => {
    const result = priceOrder(
      { orderType: "TAKEAWAY", items: [{ productId: "p_espeto", quantity: 3 }] },
      catalog,
    );
    expect(result.subtotalCents).toBe(4200); // 3 × R$ 14,00
    expect(result.items[0].unitPriceCents).toBe(1400);
    expect(result.items[0].productName).toBe("Carne Bovina");
  });

  it("soma adicionais por unidade, não uma vez só", () => {
    const result = priceOrder(
      {
        orderType: "TAKEAWAY",
        items: [
          {
            productId: "p_picanha",
            quantity: 2,
            optionIds: ["o_ponto", "o_creme"], // R$ 50,00 + R$ 2,00
          },
        ],
      },
      catalog,
    );
    expect(result.items[0].lineTotalCents).toBe(10400); // 2 × R$ 52,00
    expect(result.subtotalCents).toBe(10400);
  });

  it("aplica taxa de atendimento apenas no consumo no local", () => {
    const items = [{ productId: "p_espeto", quantity: 5 }]; // R$ 70,00

    const local = priceOrder({ orderType: "DINE_IN", items }, catalog);
    expect(local.serviceFeeCents).toBe(700); // 10%
    expect(local.totalCents).toBe(7700);

    const retirada = priceOrder({ orderType: "TAKEAWAY", items }, catalog);
    expect(retirada.serviceFeeCents).toBe(0);
    expect(retirada.totalCents).toBe(7000);
  });

  it("arredonda a taxa para o centavo mais próximo", () => {
    const result = priceOrder(
      { orderType: "DINE_IN", items: [{ productId: "p_espeto", quantity: 1 }] },
      catalog,
      { ...DEFAULT_POLICY, serviceFeePercent: 10 },
    );
    expect(result.serviceFeeCents).toBe(140);
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });
});

describe("tentativas de manipulação pelo cliente", () => {
  it("ignora qualquer preço enviado pelo navegador", () => {
    // Simula um cliente malicioso mandando preço próprio no JSON.
    const payloadMalicioso = {
      productId: "p_picanha",
      quantity: 1,
      optionIds: ["o_ponto"],
      // campos abaixo NÃO existem no tipo de entrada — e são descartados
      priceCents: 1,
      unitPriceCents: 1,
      lineTotalCents: 1,
      totalCents: 1,
    } as unknown as { productId: string; quantity: number; optionIds: string[] };

    const result = priceOrder(
      { orderType: "TAKEAWAY", items: [payloadMalicioso] },
      catalog,
    );

    expect(result.items[0].unitPriceCents).toBe(5000); // preço do banco
    expect(result.totalCents).toBe(5000); // e não R$ 0,01
  });

  it("recusa opção que pertence a outro produto", () => {
    expect(() =>
      priceOrder(
        {
          orderType: "TAKEAWAY",
          items: [{ productId: "p_espeto", quantity: 1, optionIds: ["o_creme"] }],
        },
        catalog,
      ),
    ).toThrow(PricingError);
  });

  it("recusa opção inventada", () => {
    expect(() =>
      priceOrder(
        {
          orderType: "TAKEAWAY",
          items: [
            { productId: "p_picanha", quantity: 1, optionIds: ["o_ponto", "o_desconto_99"] },
          ],
        },
        catalog,
      ),
    ).toThrow(/Opção inválida/);
  });

  it("recusa opção desativada", () => {
    expect(() =>
      priceOrder(
        {
          orderType: "TAKEAWAY",
          items: [{ productId: "p_picanha", quantity: 1, optionIds: ["o_ponto", "o_off"] }],
        },
        catalog,
      ),
    ).toThrow(/indisponível/i);
  });

  it("recusa produto que acabou", () => {
    expect(() =>
      priceOrder(
        { orderType: "TAKEAWAY", items: [{ productId: "p_costela", quantity: 1 }] },
        catalog,
      ),
    ).toThrow(/indisponível/i);
  });

  it("recusa produto inexistente", () => {
    expect(() =>
      priceOrder(
        { orderType: "TAKEAWAY", items: [{ productId: "p_nao_existe", quantity: 1 }] },
        catalog,
      ),
    ).toThrow(/não encontrado/i);
  });

  it("recusa quantidade negativa, zero, fracionada ou absurda", () => {
    for (const quantity of [0, -1, -999, 1.5, 100, Number.NaN]) {
      expect(() =>
        priceOrder(
          { orderType: "TAKEAWAY", items: [{ productId: "p_espeto", quantity }] },
          catalog,
        ),
      ).toThrow(/Quantidade inválida/);
    }
  });

  it("recusa carrinho vazio", () => {
    expect(() => priceOrder({ orderType: "TAKEAWAY", items: [] }, catalog)).toThrow(
      /não tem itens/,
    );
  });

  it("exige escolha obrigatória (ponto da carne)", () => {
    expect(() =>
      priceOrder(
        { orderType: "TAKEAWAY", items: [{ productId: "p_picanha", quantity: 1 }] },
        catalog,
      ),
    ).toThrow(/obrigatória/i);
  });

  it("respeita o máximo de escolhas por grupo", () => {
    expect(() =>
      priceOrder(
        {
          orderType: "TAKEAWAY",
          items: [
            { productId: "p_picanha", quantity: 1, optionIds: ["o_mal", "o_ponto"] },
          ],
        },
        catalog,
      ),
    ).toThrow(/Máximo de 1/);
  });

  it("recusa a mesma opção repetida para inflar desconto/adicional", () => {
    expect(() =>
      priceOrder(
        {
          orderType: "TAKEAWAY",
          items: [
            {
              productId: "p_picanha",
              quantity: 1,
              optionIds: ["o_ponto", "o_creme", "o_creme"],
            },
          ],
        },
        catalog,
      ),
    ).toThrow(/repetida/i);
  });
});
