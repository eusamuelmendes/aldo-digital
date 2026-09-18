"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

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
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: string;
  items: { productName: string; quantity: number; lineTotalCents: number; options: { name: string }[] }[];
};

function formatElapsed(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "agora mesmo";
  if (minutes === 1) return "há 1 minuto";
  if (minutes < 60) return `há ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`;
}

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Na mesa",
  TAKEAWAY: "Retirada",
  DELIVERY: "Entrega",
};

export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const isFinished = order.status === "DELIVERED" || order.status === "COMPLETED";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (ex: http sem permissão) — sem drama, o link já está na barra de endereço
    }
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          Pedido #{order.number}
          <small>Bar do Aldo · {TYPE_LABEL[order.type] ?? order.type}{order.table && ` · Mesa ${order.table.number}`}</small>
        </div>
        <span className={`status-pill status-${order.status}`}>{ORDER_STATUS_LABEL[order.status]}</span>
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
              {STEPS[currentIndex]?.label ?? ORDER_STATUS_LABEL[order.status]}
              {" · feito "}{formatElapsed(order.createdAt)}
            </p>

            {isFinished && (
              <div className="card" style={{ marginTop: 16, textAlign: "center", background: "var(--ember-10, rgba(216,114,44,0.08))" }}>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>
                  {order.status === "DELIVERED" ? "Aproveite! 🍽️" : "Pedido finalizado."}
                </p>
                <Link href="/cardapio" className="btn" style={{ display: "inline-block", marginTop: 10 }}>
                  Fazer novo pedido
                </Link>
              </div>
            )}
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-soft)", marginTop: 10 }}>
            <span>Subtotal</span>
            <span>{formatCents(order.subtotalCents)}</span>
          </div>
          {order.serviceFeeCents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
              <span>Taxa de serviço</span>
              <span>{formatCents(order.serviceFeeCents)}</span>
            </div>
          )}
          {order.deliveryFeeCents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
              <span>Taxa de entrega</span>
              <span>{formatCents(order.deliveryFeeCents)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 10, fontSize: "1.05rem" }}>
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
        </div>

        <button onClick={copyLink} className="btn-ghost" style={{ marginTop: 16, width: "100%" }}>
          {copied ? "Link copiado ✓" : "Copiar link deste pedido"}
        </button>

        <p style={{ fontSize: "0.76rem", color: "var(--ink-soft)", marginTop: 12, textAlign: "center" }}>
          Esta página atualiza sozinha. Você pode fechá-la e voltar depois — o link continua válido.
        </p>
      </div>
    </div>
  );
}
