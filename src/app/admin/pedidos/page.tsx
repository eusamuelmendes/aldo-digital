"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/format";

type OrderStatus = "RECEIVED" | "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "COMPLETED" | "CANCELLED";

type AdminOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  type: string;
  table: { number: number; label: string | null } | null;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  items: { productName: string; quantity: number; notes: string | null; options: string[] }[];
};

const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  RECEIVED: { to: "CONFIRMED", label: "Confirmar" },
  CONFIRMED: { to: "PREPARING", label: "Iniciar preparo" },
  PREPARING: { to: "READY", label: "Marcar pronto" },
  READY: { to: "DELIVERED", label: "Marcar entregue" },
  DELIVERED: { to: "COMPLETED", label: "Finalizar" },
};

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar pedidos.");
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function changeStatus(id: string, to: OrderStatus) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível atualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!orders) return <p style={{ color: "var(--ink-soft)" }}>Carregando...</p>;

  return (
    <div>
      <h3 style={{ marginBottom: 16, fontSize: "1.1rem" }}>Pedidos em aberto ({orders.length})</h3>
      {orders.length === 0 && (
        <p style={{ color: "var(--ink-soft)" }}>Nenhum pedido em aberto no momento.</p>
      )}
      {orders.map((order) => {
        const next = NEXT_STATUS[order.status];
        return (
          <div key={order.id} className="order-card">
            <div className="order-card-head">
              <div>
                <strong>#{order.number}</strong>{" "}
                <span style={{ color: "var(--ink-soft)", fontSize: "0.84rem" }}>
                  {order.type === "DINE_IN" ? `Mesa ${order.table?.number ?? "?"}` : "Retirada"} ·{" "}
                  {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <span className={`status-pill status-${order.status}`}>{order.status}</span>
            </div>
            <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "0.9rem" }}>
              {order.items.map((item, i) => (
                <li key={i}>
                  {item.quantity}× {item.productName}
                  {item.options.length > 0 && ` (${item.options.join(", ")})`}
                  {item.notes && <em> — "{item.notes}"</em>}
                </li>
              ))}
            </ul>
            {order.notes && (
              <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginBottom: 10 }}>
                Obs. geral: {order.notes}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>{formatCents(order.totalCents)}</span>
              <div style={{ display: "flex", gap: 8 }}>
                {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
                  <button
                    className="btn-outline-danger"
                    disabled={busyId === order.id}
                    onClick={() => changeStatus(order.id, "CANCELLED")}
                  >
                    Cancelar
                  </button>
                )}
                {next && (
                  <button
                    className="btn btn-sm"
                    disabled={busyId === order.id}
                    onClick={() => changeStatus(order.id, next.to)}
                  >
                    {busyId === order.id ? "..." : next.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
