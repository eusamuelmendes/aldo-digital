"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/format";

type Dashboard = {
  today: { ordersCount: number; revenueCents: number; avgTicketCents: number };
  openOrders: number;
  occupiedTables: number;
  topProducts: { name: string; quantity: number }[];
};

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

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Pedidos hoje</div>
          <div className="kpi-value">{data.today.ordersCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Faturamento hoje</div>
          <div className="kpi-value">{formatCents(data.today.revenueCents)}</div>
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
          <div className="kpi-value">{data.occupiedTables}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: "1.05rem" }}>Mais vendidos hoje</h3>
        {data.topProducts.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>Ainda sem vendas hoje.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Produto</th><th>Quantidade</th></tr>
            </thead>
            <tbody>
              {data.topProducts.map((p) => (
                <tr key={p.name}><td>{p.name}</td><td>{p.quantity}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
