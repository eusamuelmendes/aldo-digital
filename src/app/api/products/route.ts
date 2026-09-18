/**
 * GET /api/products — cardápio público.
 *
 * Substitui os 23 itens que hoje estão escritos à mão dentro do HTML do site.
 * O que sai daqui é exatamente o que o bar cadastrou: se o Aldo marcar
 * "Costela" como indisponível às 22h, o cardápio reflete na hora.
 *
 * Nunca expõe costCents nem nada interno — só o que o cliente precisa ver.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.query.categories.findMany({
    where: (category, { eq }) => eq(category.isActive, true),
    orderBy: (category, { asc }) => [asc(category.sortOrder)],
    with: {
      products: {
        where: (product, { eq }) => eq(product.isActive, true),
        orderBy: (product, { asc }) => [asc(product.sortOrder)],
        with: {
          optionGroups: {
            orderBy: (group, { asc }) => [asc(group.sortOrder)],
            with: {
              options: {
                where: (option, { eq }) => eq(option.isActive, true),
                orderBy: (option, { asc }) => [asc(option.sortOrder)],
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    categories: rows.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      products: category.products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
        isAvailable: product.isAvailable,
        isFeatured: product.isFeatured,
        optionGroups: product.optionGroups.map((group) => ({
          id: group.id,
          name: group.name,
          isRequired: group.isRequired,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map((option) => ({
            id: option.id,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
        })),
      })),
    })),
  });
}
