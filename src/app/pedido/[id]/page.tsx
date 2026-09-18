"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/format";

type OrderStatus = "RECEIVED" | "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "COMPLETED" | "CANCELLED";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "RECEIVED", label: "Recebido" },
  { status: "CONFIRMED", label: "Confirmado" },
  { status: "PREPARING", label: "Em preparo" },
  { status: "READY", label: "Pronto" },
  { status: "DELIVERED", label: "Entregue" },
];

type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  type: string;
  table: { number: number; label: string | null } | null;
  totalCents: number;
  items: { productName: string; quantity: number; lineTotalCents: number; options: { name: string }[] }[];
};

export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Pedido não encontrado.");
          return;
        }
        setOrder(data.order);
      } catch {
        if (!cancelled) setError("Não foi possível atualizar o status agora.");
      }
    }

    poll();
    // Sem WebSocket ainda (Fase 6 do roadmap) — atualização por polling a
    // cada 5s é honesta e funciona bem para uma tela de acompanhamento.
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="error-box">{error}</div>
        <Link href="/cardapio" className="btn-ghost" style={{ display: "inline-block", marginTop: 12 }}>
          Voltar ao cardápio
        </Link>
      </div>
    );
  }

  if (!order) {
    return <div className="container" style={{ paddingTop: 40, color: "var(--ink-soft)" }}>Carregando...</div>;
  }

  const currentIndex = STEPS.findIndex((s) => s.status === order.status);
  const isCancelled = order.status === "CANCELLED";

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          Pedido #{order.number}
          <small>Bar do Aldo</small>
        </div>
        <span className={`status-pill status-${order.status}`}>{order.status}</span>
      </header>

      <div className="container" style={{ paddingTop: 24 }}>
        {isCancelled ? (
          <div className="error-box">Este pedido foi cancelado.</div>
        ) : (
          <>
            <div className="progress-track">
              {STEPS.map((step, i) => (
                <span key={step.status} className={i <= currentIndex ? "done" : ""} />
              ))}
            </div>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>
              {STEPS[currentIndex]?.label ?? order.status}
              {order.table && ` · Mesa ${order.table.number}`}
            </p>
          </>
        )}

        <div className="card" style={{ marginTop: 20 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div>{item.quantity}× {item.productName}</div>
                {item.options.length > 0 && (
                  <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                    {item.options.map((o) => o.name).join(", ")}
                  </div>
                )}
              </div>
              <span>{formatCents(item.lineTotalCents)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 10, fontSize: "1.05rem" }}>
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
        </div>

        <p style={{ fontSize: "0.76rem", color: "var(--ink-soft)", marginTop: 16 }}>
          Esta página atualiza sozinha. Você pode fechá-la e voltar depois — o link continua válido.
        </p>
      </div>
    </div>
  );
}
