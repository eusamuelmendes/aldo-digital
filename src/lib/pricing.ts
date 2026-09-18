/**
 * CÁLCULO DE PREÇO — sempre no servidor.
 *
 * Regra central do sistema: o navegador NÃO informa preço. Repare no tipo
 * `CartItemInput`: não existe campo de preço nem de total. O cliente manda
 * apenas "qual produto, quantas unidades, quais opções". Todo valor é buscado
 * no banco e recalculado aqui.
 *
 * Isso não é excesso de zelo: um carrinho que confia no preço vindo do
 * navegador é manipulável com o devtools aberto — qualquer pessoa fecha um
 * pedido de picanha por R$ 0,01.
 *
 * Este módulo é uma função pura (não conhece banco nem HTTP) justamente para
 * poder ser testado exaustivamente. Quem busca os dados é `price-order.ts`.
 */

import { percentOf, type Cents } from "./money";

// --- Entrada: o que o cliente pode mandar (note a AUSÊNCIA de preço) --------

export type CartItemInput = {
  productId: string;
  quantity: number;
  optionIds?: string[];
  notes?: string;
};

export type OrderKind = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

export type PricingInput = {
  items: CartItemInput[];
  orderType: OrderKind;
};

// --- Catálogo: os dados confiáveis, vindos do banco ------------------------

export type CatalogOption = {
  id: string;
  optionGroupId: string;
  name: string;
  priceDeltaCents: Cents;
  isActive: boolean;
};

export type CatalogOptionGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: CatalogOption[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  priceCents: Cents;
  isActive: boolean;
  isAvailable: boolean;
  optionGroups: CatalogOptionGroup[];
};

export type PricingPolicy = {
  /** Taxa de atendimento (%) aplicada apenas no consumo no local. */
  serviceFeePercent: number;
  /** Taxa de entrega em centavos (0 enquanto delivery não estiver ativo). */
  deliveryFeeCents: Cents;
  /** Limite defensivo de unidades por item. */
  maxQuantityPerItem: number;
};

export const DEFAULT_POLICY: PricingPolicy = {
  serviceFeePercent: 10,
  deliveryFeeCents: 0,
  maxQuantityPerItem: 99,
};

// --- Saída: o pedido precificado -------------------------------------------

export type PricedOptionLine = {
  optionId: string;
  optionName: string;
  priceDeltaCents: Cents;
};

export type PricedItemLine = {
  productId: string;
  productName: string;
  unitPriceCents: Cents;
  quantity: number;
  notes?: string;
  options: PricedOptionLine[];
  /** (preço unitário + soma das opções) × quantidade */
  lineTotalCents: Cents;
};

export type PricedOrder = {
  items: PricedItemLine[];
  subtotalCents: Cents;
  serviceFeeCents: Cents;
  deliveryFeeCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
};

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

// --- O cálculo --------------------------------------------------------------

export function priceOrder(
  input: PricingInput,
  catalog: Map<string, CatalogProduct>,
  policy: PricingPolicy = DEFAULT_POLICY,
): PricedOrder {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PricingError("O pedido não tem itens.", "EMPTY_CART");
  }

  const items: PricedItemLine[] = input.items.map((raw) =>
    priceItem(raw, catalog, policy),
  );

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  // Taxa de atendimento só faz sentido em consumo no local — é a "taxa dos 10%"
  // do garçom. Retirada e delivery não pagam.
  const serviceFeeCents =
    input.orderType === "DINE_IN"
      ? percentOf(subtotalCents, policy.serviceFeePercent)
      : 0;

  const deliveryFeeCents =
    input.orderType === "DELIVERY" ? policy.deliveryFeeCents : 0;

  const discountCents = 0; // cupons entram aqui numa fase futura

  const totalCents =
    subtotalCents + serviceFeeCents + deliveryFeeCents - discountCents;

  return {
    items,
    subtotalCents,
    serviceFeeCents,
    deliveryFeeCents,
    discountCents,
    totalCents,
  };
}

function priceItem(
  raw: CartItemInput,
  catalog: Map<string, CatalogProduct>,
  policy: PricingPolicy,
): PricedItemLine {
  const product = catalog.get(raw.productId);

  if (!product) {
    throw new PricingError(
      `Produto não encontrado: ${raw.productId}`,
      "PRODUCT_NOT_FOUND",
    );
  }
  if (!product.isActive) {
    throw new PricingError(
      `Produto fora do cardápio: ${product.name}`,
      "PRODUCT_INACTIVE",
    );
  }
  if (!product.isAvailable) {
    throw new PricingError(
      `Produto indisponível no momento: ${product.name}`,
      "PRODUCT_UNAVAILABLE",
    );
  }

  if (
    !Number.isInteger(raw.quantity) ||
    raw.quantity < 1 ||
    raw.quantity > policy.maxQuantityPerItem
  ) {
    throw new PricingError(
      `Quantidade inválida para ${product.name}: ${raw.quantity}`,
      "INVALID_QUANTITY",
    );
  }

  const requestedIds = raw.optionIds ?? [];
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new PricingError(
      `Opção repetida em ${product.name}.`,
      "DUPLICATE_OPTION",
    );
  }

  // Indexa as opções válidas DESTE produto. Uma opção de outro produto
  // (ou inventada) simplesmente não existe neste mapa.
  const validOptions = new Map<string, { option: CatalogOption; group: CatalogOptionGroup }>();
  for (const group of product.optionGroups) {
    for (const option of group.options) {
      validOptions.set(option.id, { option, group });
    }
  }

  const chosenByGroup = new Map<string, number>();
  const options: PricedOptionLine[] = [];

  for (const optionId of requestedIds) {
    const found = validOptions.get(optionId);
    if (!found) {
      throw new PricingError(
        `Opção inválida para ${product.name}.`,
        "OPTION_NOT_ALLOWED",
      );
    }
    if (!found.option.isActive) {
      throw new PricingError(
        `Opção indisponível: ${found.option.name}.`,
        "OPTION_INACTIVE",
      );
    }

    const count = (chosenByGroup.get(found.group.id) ?? 0) + 1;
    chosenByGroup.set(found.group.id, count);

    options.push({
      optionId: found.option.id,
      optionName: found.option.name,
      priceDeltaCents: found.option.priceDeltaCents,
    });
  }

  // Grupos obrigatórios e limites min/max
  for (const group of product.optionGroups) {
    const count = chosenByGroup.get(group.id) ?? 0;
    if (group.isRequired && count < Math.max(1, group.minSelect)) {
      throw new PricingError(
        `Escolha obrigatória não preenchida: ${group.name}.`,
        "REQUIRED_GROUP_MISSING",
      );
    }
    if (count > 0 && count < group.minSelect) {
      throw new PricingError(
        `Escolha pelo menos ${group.minSelect} em ${group.name}.`,
        "MIN_SELECT_NOT_MET",
      );
    }
    if (count > group.maxSelect) {
      throw new PricingError(
        `Máximo de ${group.maxSelect} em ${group.name}.`,
        "MAX_SELECT_EXCEEDED",
      );
    }
  }

  const optionsTotal = options.reduce(
    (sum, option) => sum + option.priceDeltaCents,
    0,
  );
  const unitWithOptions = product.priceCents + optionsTotal;
  const lineTotalCents = unitWithOptions * raw.quantity;

  return {
    productId: product.id,
    productName: product.name, // snapshot
    unitPriceCents: product.priceCents, // snapshot
    quantity: raw.quantity,
    notes: raw.notes?.trim() ? raw.notes.trim().slice(0, 280) : undefined,
    options,
    lineTotalCents,
  };
}
