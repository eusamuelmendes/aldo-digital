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

  return NextResponse.json({
    today: {
      ordersCount: todayRow.orders_count,
      revenueCents: todayRow.revenue_cents,
      avgTicketCents: todayRow.avg_ticket_cents,
    },
    openOrders: openRow.open_orders,
    occupiedTables: tablesRow.occupied_tables,
    topProducts: topProducts.map((r) => ({ name: r.product_name, quantity: r.qty })),
  });
}
