/**
 * ALDO DIGITAL — Modelo de dados (Drizzle ORM / PostgreSQL)
 * =============================================================================
 * Decisões estruturais e o porquê de cada uma:
 *
 * 1. DINHEIRO EM CENTAVOS (integer), nunca float. Em JavaScript
 *    0.1 + 0.2 === 0.30000000000000004. Somando 40 itens de uma comanda isso
 *    vira divergência de caixa que ninguém consegue explicar. Em centavos,
 *    toda soma é exata.
 *
 * 2. SNAPSHOT DE NOME E PREÇO no item do pedido. Quando o Aldo subir o espeto
 *    de R$ 14 para R$ 16, os pedidos antigos precisam continuar valendo R$ 14
 *    — senão todo relatório histórico muda retroativamente.
 *
 * 3. NADA É APAGADO. Produto sai do cardápio com isActive=false; pedido some
 *    com status CANCELLED. Histórico é patrimônio do negócio.
 *
 * 4. HISTÓRICO E AUDITORIA SÃO TABELAS APPEND-ONLY, não colunas que
 *    sobrescrevem o passado.
 *
 * 5. ESTOQUE JÁ MODELADO, DESLIGADO. As tabelas existem para não exigir
 *    migração destrutiva quando o estoque entrar.
 */

import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  serial,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@/lib/id";

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN", // dono: tudo, incluindo financeiro e gestão de usuários
  "GERENTE", // operação completa + relatórios, sem gestão de usuários
  "ATENDIMENTO", // pedidos, mesas, reservas
  "COZINHA", // fila de produção da cozinha
  "BAR", // fila de produção do bar
  "CAIXA", // pagamentos e fechamento de conta
]);

export const prepStationEnum = pgEnum("prep_station", [
  "COZINHA",
  "BAR",
  "CHURRASQUEIRA",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "DINE_IN", // consumo no local (mesa)
  "TAKEAWAY", // retirada no balcão
  "DELIVERY", // entrega
]);

export const orderStatusEnum = pgEnum("order_status", [
  "RECEIVED", // recebido
  "CONFIRMED", // confirmado pelo bar
  "PREPARING", // em preparação
  "READY", // pronto
  "DELIVERED", // entregue/servido
  "COMPLETED", // finalizado
  "CANCELLED", // cancelado
]);

export const tableSessionStatusEnum = pgEnum("table_session_status", [
  "OPEN",
  "CLOSED",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CASH",
  "MEAL_VOUCHER",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "CANCELLED",
  "NO_SHOW",
]);

// ---------------------------------------------------------------------------
// EQUIPE
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(), // scrypt — nunca a senha
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("ATENDIMENTO"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_role_active_idx").on(table.role, table.isActive)],
);

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
// LGPD: o mínimo necessário. Telefone é o identificador natural (é como o bar
// já trabalha). Consentimento é registrado com data e origem, nunca presumido.

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    phone: text("phone").notNull().unique(),
    name: text("name"),
    email: text("email"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    consentSource: text("consent_source"), // "checkout", "reserva", "balcao"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("customers_created_idx").on(table.createdAt)],
);

// ---------------------------------------------------------------------------
// CARDÁPIO
// ---------------------------------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("categories_active_sort_idx").on(table.isActive, table.sortOrder)],
);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),

    /** Preço SEMPRE em centavos. R$ 14,00 => 1400 */
    priceCents: integer("price_cents").notNull(),
    /** Custo, opcional, para margem nos relatórios. Nunca exposto ao cliente. */
    costCents: integer("cost_cents"),

    sortOrder: integer("sort_order").notNull().default(0),
    /** false = fora do cardápio (não apaga o histórico de vendas) */
    isActive: boolean("is_active").notNull().default(true),
    /** false = "acabou hoje" */
    isAvailable: boolean("is_available").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    prepStation: prepStationEnum("prep_station").notNull().default("COZINHA"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_category_idx").on(table.categoryId, table.isActive, table.sortOrder),
    index("products_available_idx").on(table.isAvailable),
  ],
);

/** "Ponto da carne" (escolha 1), "Adicionais" (até 3), "Remover ingredientes". */
export const optionGroups = pgTable(
  "option_groups",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select").notNull().default(1),
    isRequired: boolean("is_required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("option_groups_product_idx").on(table.productId, table.sortOrder)],
);

export const options = pgTable(
  "options",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    optionGroupId: text("option_group_id")
      .notNull()
      .references(() => optionGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 0 (remover cebola) ou positivo (bacon extra) */
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("options_group_idx").on(table.optionGroupId, table.sortOrder)],
);

// ---------------------------------------------------------------------------
// ESTOQUE — estrutura pronta, operação ainda desligada (isTracked = false)
// ---------------------------------------------------------------------------

export const ingredients = pgTable("ingredients", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull().unique(),
  unit: text("unit").notNull(), // "kg", "un", "L"
  currentStock: numeric("current_stock", { precision: 12, scale: 3 })
    .notNull()
    .default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }),
  isTracked: boolean("is_tracked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productIngredients = pgTable(
  "product_ingredients",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    /** consumo por unidade vendida */
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("product_ingredient_unique").on(table.productId, table.ingredientId),
  ],
);

// ---------------------------------------------------------------------------
// MESAS
// ---------------------------------------------------------------------------
// Segurança do QR Code: a URL não é /mesa/01. Cada mesa tem qrSecret próprio e
// o QR carrega um token assinado (HMAC). Ver src/lib/table-token.ts.

export const tables = pgTable(
  "tables",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    number: integer("number").notNull().unique(),
    label: text("label"),
    capacity: integer("capacity").notNull().default(4),
    /** segredo por mesa: permite girar o QR de UMA mesa sem reimprimir as outras */
    qrSecret: text("qr_secret").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tables_active_idx").on(table.isActive)],
);

/** Agrupa todos os pedidos da turma que sentou — é o que permite "fechar a conta da mesa 12". */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id),
    status: tableSessionStatusEnum("status").notNull().default("OPEN"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [index("table_sessions_table_status_idx").on(table.tableId, table.status)],
);

// ---------------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    /** #1047 — número sequencial legível para a operação */
    number: serial("number").notNull().unique(),

    type: orderTypeEnum("type").notNull(),
    status: orderStatusEnum("status").notNull().default("RECEIVED"),

    customerId: text("customer_id").references(() => customers.id),
    tableId: text("table_id").references(() => tables.id),
    tableSessionId: text("table_session_id").references(() => tableSessions.id),
    createdByUserId: text("created_by_user_id").references(() => users.id),

    // Todos calculados NO SERVIDOR (src/lib/pricing.ts). O navegador manda
    // apenas produto + quantidade + opções.
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_status_created_idx").on(table.status, table.createdAt),
    index("orders_created_idx").on(table.createdAt), // relatórios por período
    index("orders_table_session_idx").on(table.tableSessionId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),

    // SNAPSHOT: congela nome e preço no momento da venda
    productName: text("product_name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    notes: text("notes"), // "sem cebola", "bem passado"

    /** (preço unitário + opções) × quantidade */
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    index("order_items_product_idx").on(table.productId), // "produtos mais vendidos"
  ],
);

export const orderItemOptions = pgTable(
  "order_item_options",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => options.id),
    // SNAPSHOT também aqui
    optionName: text("option_name").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull(),
  },
  (table) => [index("order_item_options_item_idx").on(table.orderItemId)],
);

export const orderDeliveries = pgTable("order_deliveries", {
  id: text("id").primaryKey().$defaultFn(createId),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  phone: text("phone").notNull(),
  street: text("street").notNull(),
  number: text("number").notNull(),
  complement: text("complement"),
  district: text("district").notNull(),
  city: text("city").notNull(),
  zipCode: text("zip_code"),
  reference: text("reference"),
});

/** Append-only: cada transição vira uma linha. Nunca sobrescreve. */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    changedByUserId: text("changed_by_user_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_status_history_order_idx").on(table.orderId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// PAGAMENTOS
// ---------------------------------------------------------------------------
// Nenhum dado sensível de cartão trafega ou é gravado. Só método, valor,
// status e a referência no provedor externo.

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    amountCents: integer("amount_cents").notNull(),

    provider: text("provider"), // "mercadopago", "asaas"
    providerRef: text("provider_ref"), // id da cobrança no provedor
    providerPayload: jsonb("provider_payload"), // webhook, para conciliação

    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_order_idx").on(table.orderId),
    index("payments_status_created_idx").on(table.status, table.createdAt),
    // impede processar o mesmo webhook duas vezes (idempotência)
    uniqueIndex("payments_provider_ref_unique").on(table.provider, table.providerRef),
  ],
);

// ---------------------------------------------------------------------------
// RESERVAS
// ---------------------------------------------------------------------------

export const reservations = pgTable(
  "reservations",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    customerId: text("customer_id").references(() => customers.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    date: date("date").notNull(),
    time: text("time").notNull(), // "20:30" — horário comercial, sem timezone
    partySize: integer("party_size").notNull(),
    status: reservationStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    tableId: text("table_id").references(() => tables.id), // atribuída depois
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reservations_date_status_idx").on(table.date, table.status)],
);

// ---------------------------------------------------------------------------
// AUDITORIA
// ---------------------------------------------------------------------------
// "Fulano alterou o preço do produto X de R$ 35 para R$ 39 em tal data."
// before/after em JSON evita uma tabela de auditoria por entidade.

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(), // "product.price_changed", "order.cancelled"
    entity: text("entity").notNull(), // "Product", "Order"
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_entity_idx").on(table.entity, table.entityId, table.createdAt),
    index("audit_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO DA CASA
// ---------------------------------------------------------------------------
// Chave/valor para não exigir migração a cada nova configuração.

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// RELACIONAMENTOS (para queries com `with:`)
// ---------------------------------------------------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  optionGroups: many(optionGroups),
  orderItems: many(orderItems),
}));

export const optionGroupsRelations = relations(optionGroups, ({ one, many }) => ({
  product: one(products, {
    fields: [optionGroups.productId],
    references: [products.id],
  }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  optionGroup: one(optionGroups, {
    fields: [options.optionGroupId],
    references: [optionGroups.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
  tableSession: one(tableSessions, {
    fields: [orders.tableSessionId],
    references: [tableSessions.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  statusHistory: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  options: many(orderItemOptions),
}));

export const orderItemOptionsRelations = relations(orderItemOptions, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [orderItemOptions.orderItemId],
    references: [orderItems.id],
  }),
}));

// O Drizzle precisa dos DOIS lados da relação para inferir as chaves do join:
// o many() no pai e o one() no filho. Sem o one() abaixo, uma query com
// `with: { statusHistory: true }` falha em tempo de execução.
export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
    changedByUser: one(users, {
      fields: [orderStatusHistory.changedByUserId],
      references: [users.id],
    }),
  }),
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const orderDeliveriesRelations = relations(orderDeliveries, ({ one }) => ({
  order: one(orders, {
    fields: [orderDeliveries.orderId],
    references: [orders.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  reservations: many(reservations),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  customer: one(customers, {
    fields: [reservations.customerId],
    references: [customers.id],
  }),
  table: one(tables, { fields: [reservations.tableId], references: [tables.id] }),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  products: many(productIngredients),
}));

export const productIngredientsRelations = relations(
  productIngredients,
  ({ one }) => ({
    product: one(products, {
      fields: [productIngredients.productId],
      references: [products.id],
    }),
    ingredient: one(ingredients, {
      fields: [productIngredients.ingredientId],
      references: [ingredients.id],
    }),
  }),
);

export const tablesRelations = relations(tables, ({ many }) => ({
  sessions: many(tableSessions),
  orders: many(orders),
}));

export const tableSessionsRelations = relations(tableSessions, ({ one, many }) => ({
  table: one(tables, { fields: [tableSessions.tableId], references: [tables.id] }),
  orders: many(orders),
}));

/** Tipos inferidos do schema — usados em todo o resto do código. */
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type OrderType = (typeof orderTypeEnum.enumValues)[number];

/** Helper para relatórios: soma segura em SQL sem perder o tipo. */
export const sumCents = sql<number>`coalesce(sum(${orders.totalCents}), 0)`;
