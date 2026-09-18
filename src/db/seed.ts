/**
 * Seed — dados REAIS do Bar do Aldo.
 *
 * O cardápio abaixo foi extraído do site publicado: 23 itens com preço, nas
 * categorias Na Brasa, Para Compartilhar e Especialidades. Nenhum preço foi
 * inventado.
 *
 * Guarnições e Bebidas entram como categoria VAZIA: no cardápio atual elas
 * aparecem como "porções avulsas sob consulta" e "cardápio completo no salão",
 * ou seja, não existe preço público para copiar. Quem preenche é o próprio bar
 * pelo painel — inventar número aqui seria colocar dado falso dentro de um
 * sistema que vai virar relatório de faturamento.
 */

import { db, sql } from "./index";
import {
  users,
  categories,
  products,
  optionGroups,
  options,
  tables,
  settings,
} from "./schema";
import { hashPassword } from "@/lib/password";
import { generateQrSecret } from "@/lib/table-token";

type SeedProduct = {
  name: string;
  description?: string;
  priceCents: number;
  isFeatured?: boolean;
  prepStation?: "COZINHA" | "BAR" | "CHURRASQUEIRA";
};

const CATEGORIES: Array<{
  slug: string;
  name: string;
  description?: string;
  sortOrder: number;
  products: SeedProduct[];
}> = [
  {
    slug: "brasa",
    name: "Na Brasa",
    description: "Espetos assados na brasa, do jeito que é desde 2000.",
    sortOrder: 1,
    products: [
      { name: "Carne Bovina", priceCents: 1400, prepStation: "CHURRASQUEIRA" },
      { name: "Carne Bovina (magra)", priceCents: 1400, prepStation: "CHURRASQUEIRA" },
      { name: "Calabresa", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Almôndega", priceCents: 1500, prepStation: "CHURRASQUEIRA" },
      { name: "Peito de Frango (filé)", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Asa de Frango", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Coração de Frango", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Linguiça Mista", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Queijo", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Costela Bovina", priceCents: 1950, prepStation: "CHURRASQUEIRA" },
      { name: "Medalhão de Frango", priceCents: 1850, prepStation: "CHURRASQUEIRA" },
      { name: "Medalhão de Carne", priceCents: 1850, prepStation: "CHURRASQUEIRA" },
      { name: "Lombinho Suíno", priceCents: 1450, prepStation: "CHURRASQUEIRA" },
      { name: "Carne de Sol", priceCents: 1750, prepStation: "CHURRASQUEIRA" },
      { name: "Pão de Alho", priceCents: 900, prepStation: "CHURRASQUEIRA" },
      { name: "Creme de Alho", priceCents: 200, prepStation: "COZINHA" },
      { name: "Ovo Frito (unid.)", priceCents: 200, prepStation: "COZINHA" },
    ],
  },
  {
    slug: "compartilhar",
    name: "Para Compartilhar",
    description: "Pratos generosos, feitos para render a mesa.",
    sortOrder: 2,
    products: [
      {
        name: "Picanha Especial",
        description: "Serve 2 · arroz, batata, vinagrete, alface e tomate",
        priceCents: 9500,
        isFeatured: true,
      },
      {
        name: "Contra-Filé Especial",
        description: "Serve 2 · arroz, feijão tropeiro, alface e tomate",
        priceCents: 6800,
        isFeatured: true,
      },
    ],
  },
  {
    slug: "especialidades",
    name: "Especialidades",
    sortOrder: 3,
    products: [
      {
        name: "Frango (filé)",
        description: "250g, arroz, batata frita, tomate e alface",
        priceCents: 2500,
      },
      {
        name: "Picanha",
        description: "200g, arroz, batata frita, tomate e alface",
        priceCents: 5000,
      },
      {
        name: "Bife Contra-Filé",
        description: "200g, arroz, batata frita, tomate e alface",
        priceCents: 3200,
      },
      {
        name: "Prato do Chef",
        description:
          "Especial do Aldo · contra-filé 200g, arroz, ovo, feijão verde, tomate",
        priceCents: 3000,
        isFeatured: true,
      },
    ],
  },
  {
    slug: "guarnicoes",
    name: "Guarnições",
    description:
      "Arroz branco · Vinagrete · Feijão tropeiro · Feijão verde com bacon · Salada. Preços a cadastrar pelo painel.",
    sortOrder: 4,
    products: [],
  },
  {
    slug: "bebidas",
    name: "Bebidas",
    description:
      "Sucos naturais, refrigerantes, cerveja e água. Preços a cadastrar pelo painel.",
    sortOrder: 5,
    products: [],
  },
];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function seed() {
  console.log("→ limpando dados de desenvolvimento...");
  // TRUNCATE ... CASCADE respeita as foreign keys e reinicia a sequência do
  // número do pedido. Isto é um comando de DESENVOLVIMENTO.
  await sql.unsafe(`TRUNCATE TABLE
    order_item_options, order_items, order_status_history, payments,
    order_deliveries, orders, table_sessions, reservations, audit_logs,
    options, option_groups, product_ingredients, products, categories,
    ingredients, tables, customers, users, settings
    RESTART IDENTITY CASCADE`);

  // --- equipe -------------------------------------------------------------
  // Senha de DESENVOLVIMENTO. Em produção o primeiro acesso força troca.
  const devPassword = await hashPassword("aldo-dev-2026");
  await db.insert(users).values([
    {
      email: "admin@bardoaldo.com.br",
      name: "Aldo (proprietário)",
      role: "ADMIN",
      passwordHash: devPassword,
    },
    {
      email: "atendimento@bardoaldo.com.br",
      name: "Atendimento",
      role: "ATENDIMENTO",
      passwordHash: devPassword,
    },
    {
      email: "cozinha@bardoaldo.com.br",
      name: "Cozinha",
      role: "COZINHA",
      passwordHash: devPassword,
    },
  ]);
  console.log("✓ 3 usuários de equipe");

  // --- cardápio -----------------------------------------------------------
  let productCount = 0;
  for (const category of CATEGORIES) {
    const [created] = await db
      .insert(categories)
      .values({
        slug: category.slug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
      })
      .returning();

    if (category.products.length > 0) {
      await db.insert(products).values(
        category.products.map((product, index) => ({
          categoryId: created.id,
          slug: `${category.slug}-${slugify(product.name)}`,
          name: product.name,
          description: product.description,
          priceCents: product.priceCents,
          sortOrder: index,
          isFeatured: product.isFeatured ?? false,
          prepStation: product.prepStation ?? ("COZINHA" as const),
        })),
      );
      productCount += category.products.length;
    }
  }
  console.log(`✓ ${CATEGORIES.length} categorias, ${productCount} produtos`);

  // --- exemplo de grupos de opções ---------------------------------------
  // Estrutura demonstrativa usando SOMENTE itens que já existem no cardápio
  // com preço real (creme de alho R$ 2,00, ovo R$ 2,00, pão de alho R$ 9,00).
  const picanha = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.slug, "especialidades-picanha"),
  });

  if (picanha) {
    const [pontoGroup] = await db
      .insert(optionGroups)
      .values({
        productId: picanha.id,
        name: "Ponto da carne",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 0,
      })
      .returning();

    await db.insert(options).values([
      { optionGroupId: pontoGroup.id, name: "Mal passada", priceDeltaCents: 0, sortOrder: 0 },
      { optionGroupId: pontoGroup.id, name: "Ao ponto", priceDeltaCents: 0, sortOrder: 1 },
      { optionGroupId: pontoGroup.id, name: "Bem passada", priceDeltaCents: 0, sortOrder: 2 },
    ]);

    const [addGroup] = await db
      .insert(optionGroups)
      .values({
        productId: picanha.id,
        name: "Adicionais",
        isRequired: false,
        minSelect: 0,
        maxSelect: 3,
        sortOrder: 1,
      })
      .returning();

    await db.insert(options).values([
      { optionGroupId: addGroup.id, name: "Creme de alho", priceDeltaCents: 200, sortOrder: 0 },
      { optionGroupId: addGroup.id, name: "Ovo frito", priceDeltaCents: 200, sortOrder: 1 },
      { optionGroupId: addGroup.id, name: "Pão de alho", priceDeltaCents: 900, sortOrder: 2 },
    ]);
    console.log("✓ 2 grupos de opções (exemplo, na Picanha)");
  }

  // --- mesas --------------------------------------------------------------
  await db.insert(tables).values(
    Array.from({ length: 12 }, (_, index) => {
      const number = index + 1;
      return {
        number,
        label: `Mesa ${String(number).padStart(2, "0")}`,
        capacity: number <= 8 ? 4 : 6,
        qrSecret: generateQrSecret(),
      };
    }),
  );
  console.log("✓ 12 mesas com segredo de QR Code próprio");

  // --- configurações ------------------------------------------------------
  await db.insert(settings).values([
    { key: "service_fee_percent", value: "10" },
    { key: "accepts_delivery", value: "false" },
    { key: "accepts_takeaway", value: "true" },
    { key: "min_order_cents", value: "0" },
    { key: "opening_hours", value: "16:00-00:00" },
    { key: "closed_weekdays", value: "0" }, // domingo
  ]);
  console.log("✓ configurações da casa");
}

// Executa apenas quando chamado diretamente (`npm run db:seed`)
if (process.argv[1]?.includes("seed")) {
  seed()
    .then(async () => {
      console.log("\nSeed concluído.");
      console.log("Login de desenvolvimento: admin@bardoaldo.com.br / aldo-dev-2026");
      await sql.end();
    })
    .catch(async (error) => {
      console.error(error);
      await sql.end();
      process.exit(1);
    });
}
