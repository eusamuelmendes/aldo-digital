"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { formatCents } from "@/lib/format";

const SERVICE_FEE_PERCENT = 10; // exibição apenas — o servidor recalcula na hora do pedido

export default function CarrinhoPage() {
  const router = useRouter();
  const { lines, updateQuantity, removeLine, clear, totalCents } = useCart();
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("TAKEAWAY");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tableToken =
    typeof window !== "undefined" ? sessionStorage.getItem("aldo-table-token") : null;

  const estimatedFee = orderType === "DINE_IN" ? Math.round((totalCents * SERVICE_FEE_PERCENT) / 100) : 0;
  const estimatedTotal = totalCents + estimatedFee;

  async function handleSubmit() {
    if (lines.length === 0) return;
    if (orderType === "DINE_IN" && !tableToken) {
      setError("Este link não identifica uma mesa. Escaneie o QR Code da sua mesa para pedir no local.");
      return;
    }
    if (!phone.trim()) {
      setError("Informe um telefone para contato sobre o pedido.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          tableToken: orderType === "DINE_IN" ? tableToken : undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            optionIds: l.options.map((o) => o.id),
            notes: l.notes,
          })),
          customer: { phone: phone.trim(), name: name.trim() || undefined },
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível enviar o pedido.");
      }

      clear();
      router.push(`/pedido/${data.order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          Carrinho
          <small>Bar do Aldo</small>
        </div>
      </header>

      <div className="container" style={{ paddingTop: 20 }}>
        {lines.length === 0 ? (
          <div className="empty-state">
            <p>Seu carrinho está vazio.</p>
            <button className="btn" onClick={() => router.push("/cardapio")}>Ver cardápio</button>
          </div>
        ) : (
          <>
            {lines.map((line) => (
              <div key={line.key} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    {line.imageUrl && (
                      <img
                        src={line.imageUrl}
                        alt=""
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: "cover",
                          borderRadius: 8,
                          flexShrink: 0,
                          background: "#2a201a",
                        }}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 700 }}>{line.productName}</div>
                      {line.options.length > 0 && (
                        <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                          {line.options.map((o) => o.name).join(", ")}
                        </div>
                      )}
                      {line.notes && (
                        <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                          "{line.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="btn-outline-danger" onClick={() => removeLine(line.key)}>
                    remover
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <div className="qty-control">
                    <button onClick={() => updateQuantity(line.key, line.quantity - 1)}>−</button>
                    <span>{line.quantity}</span>
                    <button onClick={() => updateQuantity(line.key, line.quantity + 1)}>+</button>
                  </div>
                  <span className="product-price">
                    {formatCents(
                      (line.unitPriceCents + line.options.reduce((s, o) => s + o.priceDeltaCents, 0)) *
                        line.quantity,
                    )}
                  </span>
                </div>
              </div>
            ))}

            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Como você quer pedir?</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className={orderType === "TAKEAWAY" ? "btn" : "btn-ghost"}
                  onClick={() => setOrderType("TAKEAWAY")}
                >
                  Retirar no balcão
                </button>
                <button
                  className={orderType === "DINE_IN" ? "btn" : "btn-ghost"}
                  onClick={() => setOrderType("DINE_IN")}
                  disabled={!tableToken}
                  title={!tableToken ? "Escaneie o QR Code da mesa para habilitar" : undefined}
                >
                  Na mesa {!tableToken && "(escaneie o QR)"}
                </button>
              </div>

              <div className="field" style={{ marginTop: 16 }}>
                <label>Seu telefone (WhatsApp)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(66) 99900-0000" />
              </div>
              <div className="field">
                <label>Seu nome (opcional)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Observações do pedido (opcional)</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--ink-soft)" }}>
                  <span>Subtotal</span>
                  <span>{formatCents(totalCents)}</span>
                </div>
                {orderType === "DINE_IN" && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--ink-soft)" }}>
                    <span>Taxa de serviço (estimada)</span>
                    <span>{formatCents(estimatedFee)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 6, fontSize: "1.05rem" }}>
                  <span>Total estimado</span>
                  <span>{formatCents(estimatedTotal)}</span>
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: 6 }}>
                  O valor final é recalculado pelo sistema no momento da confirmação.
                </p>
              </div>

              {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}

              <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Enviando pedido..." : "Confirmar pedido"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
