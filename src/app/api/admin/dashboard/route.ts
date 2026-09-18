/**
 * GET /api/admin/dashboard — números do dia, calculados por consulta real ao
 * banco (não hardcoded). "Hoje" é considerado no fuso America/Cuiaba (MT).
 */
import { NextResponse } from "next/server";
import { sql } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [todayRow] = await sql`
    SELECT
      count(*)::int AS orders_count,
      coalesce(sum(total_cents), 0)::int AS revenue_cents,
      coalesce(avg(total_cents), 0)::int AS avg_ticket_cents
    FROM orders
    WHERE created_at >= (now() AT TIME ZONE 'America/Cuiaba')::date
      AND status <> 'CANCELLED'
  `;

  const [openRow] = await sql`
    SELECT count(*)::int AS open_orders
    FROM orders
    WHERE status IN ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY')
  `;

  const [tablesRow] = await sql`
    SELECT count(*)::int AS occupied_tables
    FROM table_sessions
    WHERE status = 'OPEN'
  `;

  const topProducts = await sql`
    SELECT product_name, sum(quantity)::int AS qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= (now() AT TIME ZONE 'America/Cuiaba')::date
      AND o.status <> 'CANCELLED'
    GROUP BY product_name
    ORDER BY qty DESC
    LIMIT 5
  `;

  // Comparação honesta com o mesmo horário de ontem — não é "média do mês"
  // inventada, é o dado real do dia anterior até este mesmo instante.
  const [yesterdayRow] = await sql`
    SELECT coalesce(sum(total_cents), 0)::int AS revenue_cents
    FROM orders
    WHERE created_at >= (now() AT TIME ZONE 'America/Cuiaba')::date - interval '1 day'
      AND created_at < (now() AT TIME ZONE 'America/Cuiaba') - interval '1 day'
      AND status <> 'CANCELLED'
  `;

  // Faturamento por hora hoje, pra um gráfico simples de movimento do dia.
  const hourlyRows = await sql`
    SELECT
      extract(hour FROM created_at AT TIME ZONE 'America/Cuiaba')::int AS hour,
      coalesce(sum(total_cents), 0)::int AS revenue_cents
    FROM orders
    WHERE created_at >= (now() AT TIME ZONE 'America/Cuiaba')::date
      AND status <> 'CANCELLED'
    GROUP BY hour
    ORDER BY hour
  `;
  const hourlyMap = new Map(hourlyRows.map((r) => [r.hour, r.revenue_cents]));
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenueCents: hourlyMap.get(h) ?? 0 }));

  const [typeRow] = await sql`
    SELECT
      count(*) FILTER (WHERE type = 'DINE_IN')::int AS dine_in,
      count(*) FILTER (WHERE type = 'TAKEAWAY')::int AS takeaway,
      count(*) FILTER (WHERE type = 'DELIVERY')::int AS delivery,
      count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
    FROM orders
    WHERE created_at >= (now() AT TIME ZONE 'America/Cuiaba')::date
  `;

  return NextResponse.json({
    today: {
      ordersCount: todayRow.orders_count,
      revenueCents: todayRow.revenue_cents,
      avgTicketCents: todayRow.avg_ticket_cents,
    },
    yesterday: { revenueCents: yesterdayRow.revenue_cents },
    openOrders: openRow.open_orders,
    occupiedTables: tablesRow.occupied_tables,
    topProducts: topProducts.map((r) => ({ name: r.product_name, quantity: r.qty })),
    hourly,
    byType: {
      dineIn: typeRow.dine_in,
      takeaway: typeRow.takeaway,
      delivery: typeRow.delivery,
      cancelled: typeRow.cancelled,
    },
  });
}
