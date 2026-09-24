"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { formatCents } from "@/lib/format";

type Option = { id: string; name: string; priceDeltaCents: number };
type OptionGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: Option[];
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  optionGroups: OptionGroup[];
};
type Category = { id: string; name: string; description: string | null; products: Product[] };

export default function CardapioClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableToken = searchParams.get("mesa");

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const { itemCount, totalCents } = useCart();

  useEffect(() => {
    fetch("/api/products")
      .then((res) => {
        if (!res.ok) throw new Error("Não foi possível carregar o cardápio agora.");
        return res.json();
      })
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(err.message));
  }, []);

  // guarda o token da mesa (do QR Code) para o checkout, sem depender do
  // usuário manter o parâmetro na URL ao navegar entre as páginas
  useEffect(() => {
    if (tableToken) sessionStorage.setItem("aldo-table-token", tableToken);
  }, [tableToken]);

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          Bar do Aldo
          <small>Cardápio digital</small>
        </div>
        {tableToken && <span className="status-pill status-CONFIRMED">Mesa identificada</span>}
      </header>

      <div className="container" style={{ paddingTop: 20 }}>
        {error && <div className="error-box">{error}</div>}
        {!categories && !error && <p style={{ color: "var(--ink-soft)" }}>Carregando cardápio...</p>}

        {categories?.map((category) => (
          <section key={category.id}>
            <h2 className="category-title">{category.name}</h2>
            {category.products.length === 0 && (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.86rem" }}>
                Nenhum item cadastrado ainda nesta categoria.
              </p>
            )}
            {category.products.map((product) => (
              <button
                key={product.id}
                onClick={() => product.isAvailable && setOpenProduct(product)}
                className="product-row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  opacity: product.isAvailable ? 1 : 0.55,
                }}
              >
                {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
                <div className="product-info">
                  <div className="product-name">{product.name}</div>
                  {product.description && <div className="product-desc">{product.description}</div>}
                  <div className="product-price">{formatCents(product.priceCents)}</div>
                  {!product.isAvailable && <span className="unavailable-tag">Indisponível agora</span>}
                </div>
              </button>
            ))}
          </section>
        ))}
      </div>

      {itemCount > 0 && (
        <div className="cart-bar" onClick={() => router.push("/carrinho")} role="button">
          <span>{itemCount} {itemCount === 1 ? "item" : "itens"} no carrinho</span>
          <span>{formatCents(totalCents)} · ver carrinho →</span>
        </div>
      )}

      {openProduct && (
        <ProductSheet product={openProduct} onClose={() => setOpenProduct(null)} />
      )}
    </div>
  );
}

function ProductSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addLine } = useCart();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);
      if (isSelected) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (group.maxSelect === 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (current.length >= group.maxSelect) return prev; // já no limite
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function handleAdd() {
    for (const group of product.optionGroups) {
      const chosen = selected[group.id] ?? [];
      if (group.isRequired && chosen.length < Math.max(1, group.minSelect)) {
        setValidationError(`Escolha uma opção em "${group.name}".`);
        return;
      }
    }
    setValidationError(null);

    const options = product.optionGroups.flatMap((group) =>
      (selected[group.id] ?? []).map((optId) => {
        const opt = group.options.find((o) => o.id === optId)!;
        return { id: opt.id, name: opt.name, priceDeltaCents: opt.priceDeltaCents };
      }),
    );

    addLine({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      unitPriceCents: product.priceCents,
      quantity,
      notes: notes.trim() || undefined,
      options,
    });
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div
        className="container"
        style={{
          background: "var(--bg)",
          borderRadius: "18px 18px 0 0",
          padding: "20px 18px 24px",
          maxHeight: "85vh",
          overflowY: "auto",
          width: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "1.3rem" }}>{product.name}</h2>
        {product.description && (
          <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>{product.description}</p>
        )}
        <p className="product-price" style={{ marginTop: 10 }}>{formatCents(product.priceCents)}</p>

        {product.optionGroups.map((group) => (
          <div key={group.id} style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
              {group.name} {group.isRequired && <span style={{ color: "var(--ember)" }}>· obrigatório</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {group.options.map((option) => {
                const isSelected = (selected[group.id] ?? []).includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderColor: isSelected ? "var(--ember)" : "var(--line)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        checked={isSelected}
                        onChange={() => toggleOption(group, option.id)}
                      />
                      {option.name}
                    </span>
                    {option.priceDeltaCents !== 0 && (
                      <span style={{ color: "var(--ink-soft)", fontSize: "0.84rem" }}>
                        +{formatCents(option.priceDeltaCents)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="field" style={{ marginTop: 20 }}>
          <label>Observações (opcional)</label>
          <textarea
            rows={2}
            maxLength={280}
            placeholder="Ex: sem cebola, ponto da carne, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {validationError && <div className="error-box">{validationError}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <div className="qty-control">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <span>{quantity}</span>
            <button onClick={() => setQuantity((q) => Math.min(99, q + 1))}>+</button>
          </div>
          <button className="btn" onClick={handleAdd}>Adicionar ao carrinho</button>
        </div>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
