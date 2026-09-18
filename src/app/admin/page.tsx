"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/format";

type Dashboard = {
  today: { ordersCount: number; revenueCents: number; avgTicketCents: number };
  yesterday: { revenueCents: number };
  openOrders: number;
  occupiedTables: number;
  topProducts: { name: string; quantity: number }[];
  hourly: { hour: number; revenueCents: number }[];
  byType: { dineIn: number; takeaway: number; delivery: number; cancelled: number };
};

function trendPercent(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null; // sem base de comparação — não inventa número
  return Math.round(((today - yesterday) / yesterday) * 100);
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/dashboard");
        const json = await res.json();
        if (!cancelled) {
          if (!res.ok) setError(json.error ?? "Erro ao carregar.");
          else setData(json);
        }
      } catch {
        if (!cancelled) setError("Erro ao carregar o painel.");
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <p style={{ color: "var(--ink-soft)" }}>Carregando...</p>;

  const trend = trendPercent(data.today.revenueCents, data.yesterday.revenueCents);
  const maxHourly = Math.max(1, ...data.hourly.map((h) => h.revenueCents));
  const activeHours = data.hourly.filter((h) => h.revenueCents > 0 || (h.hour >= 11 && h.hour <= 23));
  const totalOrdersByType = data.byType.dineIn + data.byType.takeaway + data.byType.delivery;

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card kpi-card-primary">
          <div className="kpi-label">Faturamento hoje</div>
          <div className="kpi-value">{formatCents(data.today.revenueCents)}</div>
          {trend !== null && (
            <div className={`kpi-trend ${trend >= 0 ? "kpi-trend-up" : "kpi-trend-down"}`}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs. mesma hora de ontem
            </div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pedidos hoje</div>
          <div className="kpi-value">{data.today.ordersCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ticket médio</div>
          <div className="kpi-value">{formatCents(data.today.avgTicketCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pedidos em aberto</div>
          <div className="kpi-value">{data.openOrders}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Mesas ocupadas</div>
          <div className="kpi-value">{data.occupiedTables} <span style={{ fontSize: "0.6em", color: "var(--ink-soft)" }}>/ 12</span></div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: "1.05rem" }}>Movimento de hoje</h3>
          {activeHours.every((h) => h.revenueCents === 0) ? (
            <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>Ainda sem vendas hoje.</p>
          ) : (
            <div className="hourly-chart">
              {activeHours.map((h) => (
                <div key={h.hour} className="hourly-bar-col" title={`${h.hour}h — ${formatCents(h.revenueCents)}`}>
                  <div
                    className="hourly-bar"
                    style={{ height: `${Math.max(3, (h.revenueCents / maxHourly) * 100)}%` }}
                  />
                  <span className="hourly-bar-label">{h.hour}h</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: "1.05rem" }}>Pedidos por tipo</h3>
          {totalOrdersByType === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>Ainda sem pedidos hoje.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Na mesa", value: data.byType.dineIn },
                { label: "Retirada", value: data.byType.takeaway },
                { label: "Entrega", value: data.byType.delivery },
              ].map((row) => (
                <div key={row.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 4 }}>
                    <span>{row.label}</span>
                    <span style={{ color: "var(--ink-soft)" }}>{row.value}</span>
                  </div>
                  <div className="type-bar-track">
                    <div
                      className="type-bar-fill"
                      style={{ width: `${totalOrdersByType > 0 ? (row.value / totalOrdersByType) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {data.byType.cancelled > 0 && (
                <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 4 }}>
                  {data.byType.cancelled} pedido{data.byType.cancelled > 1 ? "s" : ""} cancelado{data.byType.cancelled > 1 ? "s" : ""} hoje
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 12, fontSize: "1.05rem" }}>Mais vendidos hoje</h3>
        {data.topProducts.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>Ainda sem vendas hoje.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.topProducts.map((p, i) => {
              const max = data.topProducts[0].quantity;
              return (
                <div key={p.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.86rem", marginBottom: 4 }}>
                    <span>{i + 1}. {p.name}</span>
                    <span style={{ color: "var(--ink-soft)" }}>{p.quantity}×</span>
                  </div>
                  <div className="type-bar-track">
                    <div className="type-bar-fill" style={{ width: `${(p.quantity / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
