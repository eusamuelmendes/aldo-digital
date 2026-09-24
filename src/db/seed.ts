/**
 * Seed — dados REAIS do Bar do Aldo.
 *
 * Na Brasa, Para Compartilhar e Especialidades: preços mantidos como já
 * publicados no site (confirmado com o Samuel em 24/09/2026, mesmo esses
 * valores sendo mais altos que os do cardápio impresso do salão — o site é a
 * referência oficial).
 *
 * Guarnições, Porções e Bebidas (cervejas): preços tirados de fotos do
 * cardápio impresso do bar, conferidos item a item com o Samuel em 24/09/2026.
 * Bebidas sem álcool (água, suco, refrigerante) e drinks ainda não têm foto do
 * cardápio físico — entram com o que já foi aprovado; o resto fica para o bar
 * cadastrar pelo painel até chegar a foto da página que falta.
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
  imageUrl?: string;
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
      { name: "Carne Bovina", priceCents: 1400, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-carne-bovina.jpg" },
      { name: "Carne Bovina (magra)", priceCents: 1400, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-carne-bovina-magra.jpg" },
      { name: "Calabresa", priceCents: 1300, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-calabresa.jpg" },
      { name: "Almôndega", priceCents: 1500, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-almondega.jpg" },
      { name: "Peito de Frango (filé)", priceCents: 1300, prepStation: "CHURRASQUEIRA" },
      { name: "Asa de Frango", priceCents: 1300, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-asa-de-frango.jpg" },
      { name: "Coração de Frango", priceCents: 1300, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-coracao-de-frango.jpg" },
      { name: "Linguiça Mista", priceCents: 1300, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-linguica-mista.jpg" },
      { name: "Queijo", priceCents: 1300, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-queijo.jpg" },
      { name: "Costela Bovina", priceCents: 1950, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-costela-bovina.jpg" },
      { name: "Medalhão de Frango", priceCents: 1850, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-medalhao-de-frango.jpg" },
      { name: "Medalhão de Carne", priceCents: 1850, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-medalhao-de-carne.jpg" },
      { name: "Lombinho Suíno", priceCents: 1450, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-lombinho-suino.jpg" },
      { name: "Carne de Sol", priceCents: 1750, prepStation: "CHURRASQUEIRA" },
      { name: "Pão de Alho", priceCents: 900, prepStation: "CHURRASQUEIRA", imageUrl: "/products/brasa-pao-de-alho.jpg" },
      { name: "Creme de Alho", priceCents: 200, prepStation: "COZINHA", imageUrl: "/products/brasa-creme-de-alho.jpg" },
      { name: "Ovo Frito (unid.)", priceCents: 200, prepStation: "COZINHA", imageUrl: "/products/brasa-ovo-frito-unid.jpg" },
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
        imageUrl: "/products/compartilhar-picanha-especial.jpg",
      },
      {
        name: "Contra-Filé Especial",
        description: "Serve 2 · arroz, feijão tropeiro, alface e tomate",
        priceCents: 6800,
        isFeatured: true,
        imageUrl: "/products/compartilhar-contra-file-especial.jpg",
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
        imageUrl: "/products/especialidades-frango-file.jpg",
      },
      {
        name: "Picanha",
        description: "200g, arroz, batata frita, tomate e alface",
        priceCents: 5000,
        imageUrl: "/products/especialidades-picanha.jpg",
      },
      {
        name: "Bife Contra-Filé",
        description: "200g, arroz, batata frita, tomate e alface",
        priceCents: 3200,
        imageUrl: "/products/especialidades-bife-contra-file.jpg",
      },
      {
        name: "Prato do Chef",
        description:
          "Especial do Aldo · contra-filé 200g, arroz, ovo, feijão verde, tomate",
        priceCents: 3000,
        isFeatured: true,
        imageUrl: "/products/especialidades-prato-do-chef.jpg",
      },
    ],
  },
  {
    slug: "guarnicoes",
    name: "Guarnições",
    description: "Porções avulsas de acompanhamento, do cardápio impresso do salão.",
    sortOrder: 4,
    products: [
      { name: "Arroz Branco", priceCents: 600, prepStation: "COZINHA", imageUrl: "/products/guarnicoes-arroz-branco.jpg" },
      { name: "Vinagrete", priceCents: 600, prepStation: "COZINHA", imageUrl: "/products/guarnicoes-vinagrete.jpg" },
      { name: "Feijão Tropeiro", priceCents: 600, prepStation: "COZINHA", imageUrl: "/products/guarnicoes-feijao-tropeiro.jpg" },
      { name: "Feijão Verde com Bacon", priceCents: 700, prepStation: "COZINHA", imageUrl: "/products/guarnicoes-feijao-verde-com-bacon.jpg" },
      // Salada: preço cortado na foto do cardápio impresso — aguardando confirmação do Samuel.
    ],
  },
  {
    slug: "porcoes",
    name: "Porções",
    description: "Porções para compartilhar, do cardápio impresso do salão.",
    sortOrder: 5,
    products: [
      { name: "Batata Frita c/ Queijo e Bacon", priceCents: 2700, prepStation: "COZINHA" },
      { name: "Batata Frita c/ Queijo", priceCents: 2000, prepStation: "COZINHA" },
      { name: "Batata Frita (meia)", priceCents: 1800, prepStation: "COZINHA" },
      {
        name: "Picanha (porção)",
        description: "500g, mandioca, cebola frita e salada",
        priceCents: 5200,
        prepStation: "CHURRASQUEIRA",
      },
      {
        name: "Frango (porção)",
        description: "Filé 300g, mandioca, cebola frita e salada",
        priceCents: 3000,
        prepStation: "CHURRASQUEIRA",
      },
      {
        name: "Calabresa (porção)",
        description: "500g, mandioca, cebola frita e salada",
        priceCents: 2500,
        prepStation: "CHURRASQUEIRA",
      },
      { name: "Frango à Passarinho (1kg)", priceCents: 2500, prepStation: "COZINHA" },
      { name: "Salame com Ovo de Codorna", priceCents: 2000, prepStation: "COZINHA" },
      {
        name: "Contra-Filé (porção)",
        description: "500g, mandioca, cebola frita e salada",
        priceCents: 4000,
        prepStation: "CHURRASQUEIRA",
      },
      { name: "Mandioca Frita (800g)", priceCents: 1200, prepStation: "COZINHA" },
      { name: "Meia Porção Mandioca", priceCents: 800, prepStation: "COZINHA" },
      { name: "Picanha com Fritas", priceCents: 7000, prepStation: "CHURRASQUEIRA" },
      { name: "Contra-Filé com Mandioca Frita", priceCents: 5000, prepStation: "CHURRASQUEIRA" },
      { name: "Tábua de Frios", priceCents: 4000, prepStation: "COZINHA" },
      { name: "Tábua de Frios (meia)", priceCents: 2500, prepStation: "COZINHA" },
    ],
  },
  {
    slug: "bebidas",
    name: "Bebidas",
    description: "Sucos naturais, refrigerantes, cerveja e água.",
    sortOrder: 6,
    products: [
      { name: "Água Mineral", priceCents: 400, prepStation: "BAR", imageUrl: "/products/bebidas-agua-mineral.jpg" },
      { name: "Suco Natural", priceCents: 800, prepStation: "BAR", imageUrl: "/products/bebidas-suco-natural.jpg" },
      { name: "Refrigerante (lata)", priceCents: 600, prepStation: "BAR", imageUrl: "/products/bebidas-refrigerante-lata.jpg" },
      { name: "Caipirinha", priceCents: 1500, prepStation: "BAR", imageUrl: "/products/bebidas-caipirinha.jpg" },
      // Cervejas — preços do cardápio impresso, conferidos com o Samuel em 24/09/2026.
      { name: "Budweiser 600ml", priceCents: 1100, prepStation: "BAR" },
      { name: "Bohemia 600ml", priceCents: 1100, prepStation: "BAR" },
      { name: "Cerveja Eisenbahn 600ml", priceCents: 1100, prepStation: "BAR" },
      { name: "Cerveja Antarctica Original", priceCents: 1100, prepStation: "BAR" },
      { name: "Brahma 600ml", priceCents: 900, prepStation: "BAR" },
      { name: "Cerveja Itaipava Premium", priceCents: 900, prepStation: "BAR" },
      { name: "Skol 600ml", priceCents: 800, prepStation: "BAR" },
      { name: "Crystal 600ml", priceCents: 700, prepStation: "BAR" },
      { name: "Cerveja Itaipava", priceCents: 700, prepStation: "BAR" },
      { name: "Crystal / Itaipava S/ Álcool", priceCents: 600, prepStation: "BAR" },
      { name: "Brahma Long Neck S/ Álcool", priceCents: 600, prepStation: "BAR" },
      { name: "Crystal Lata", priceCents: 300, prepStation: "BAR" },
      { name: "Skol Lata", priceCents: 300, prepStation: "BAR" },
      { name: "Brahma Lata (350ml)", priceCents: 300, prepStation: "BAR" },
      { name: "Itaipava Lata (350ml)", priceCents: 300, prepStation: "BAR" },
      { name: "Skol Palito (269ml)", priceCents: 300, prepStation: "BAR" },
      { name: "Brahma Palito (269ml)", priceCents: 300, prepStation: "BAR" },
      { name: "Copo Cosmel", priceCents: 300, prepStation: "BAR" },
      // Água c/ gás, refri 600ml, drinks (gin/aperol/moscow mule/negroni/vinho/espumante):
      // aguardando foto da página de bebidas não-alcoólicas/drinks do cardápio impresso.
    ],
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
          imageUrl: product.imageUrl ?? null,
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
