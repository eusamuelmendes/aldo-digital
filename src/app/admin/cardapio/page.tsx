"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/format";

type Category = { id: string; name: string; slug: string };
type OptionRow = { id: string; name: string; priceDeltaCents: number; isActive: boolean; sortOrder: number };
type OptionGroupRow = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: OptionRow[];
};
type Product = {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  optionGroups: OptionGroupRow[];
};

export default function AdminCardapioPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingOptions, setManagingOptions] = useState<Product | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catsRes, prodsRes] = await Promise.all([
        fetch("/api/admin/categories"),
        fetch("/api/admin/products"),
      ]);
      const cats = await catsRes.json();
      const prods = await prodsRes.json();
      if (!catsRes.ok || !prodsRes.ok) throw new Error("Erro ao carregar cardápio.");
      setCategories(cats.categories);
      setProducts(prods.products);
      // mantém o modal de opções sincronizado com os dados recarregados
      setManagingOptions((current) =>
        current ? (prods.products.find((p: Product) => p.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAvailable(product: Product) {
    await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: !product.isAvailable }),
    });
    load();
  }

  async function toggleActive(product: Product) {
    await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    load();
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!products) return <p style={{ color: "var(--ink-soft)" }}>Carregando...</p>;

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const visible = products.filter((p) => showInactive || p.isActive);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "1.1rem" }}>Cardápio ({visible.length})</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            mostrar removidos
          </label>
          <button className="btn btn-sm" onClick={() => setCreating(true)}>+ Novo produto</button>
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th>Preço</th>
            <th>Disponível</th>
            <th>No cardápio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((product) => (
            <tr key={product.id} style={{ opacity: product.isActive ? 1 : 0.5 }}>
              <td>{product.name}</td>
              <td style={{ color: "var(--ink-soft)" }}>{categoryName(product.categoryId)}</td>
              <td>{formatCents(product.priceCents)}</td>
              <td>
                <button className="btn-sm btn-ghost" onClick={() => toggleAvailable(product)}>
                  {product.isAvailable ? "sim" : "não — acabou"}
                </button>
              </td>
              <td>
                <button className="btn-sm btn-ghost" onClick={() => toggleActive(product)}>
                  {product.isActive ? "sim" : "removido"}
                </button>
              </td>
              <td style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setEditing(product)}>editar</button>
                <button className="btn-sm btn-ghost" onClick={() => setManagingOptions(product)}>
                  opções ({product.optionGroups.length})
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <ProductForm
          categories={categories}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {creating && (
        <ProductForm
          categories={categories}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {managingOptions && (
        <OptionsManager product={managingOptions} onClose={() => setManagingOptions(null)} onChanged={load} />
      )}
    </div>
  );
}

function ProductForm({
  categories,
  product,
  onClose,
  onSaved,
}: {
  categories: Category[];
  product?: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [priceReais, setPriceReais] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar a foto.");
      setImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar a foto.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceCents = Math.round(parseFloat(priceReais.replace(",", ".")) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError("Preço inválido.");
      return;
    }

    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products";
      const method = isEdit ? "PATCH" : "POST";
      const payload: Record<string, unknown> = {
        name,
        description: description || undefined,
        priceCents,
        imageUrl: imageUrl || undefined,
        isFeatured,
        categoryId,
      };
      if (!isEdit) payload.slug = slug;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: 420, maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 16 }}>{isEdit ? "Editar produto" : "Novo produto"}</h3>

        <div className="field">
          <label>Nome</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!isEdit && (
          <div className="field">
            <label>Identificador (slug)</label>
            <input required placeholder="ex: brasa-costela-especial" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Categoria</label>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{ background: "#241b15", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", color: "var(--ink)" }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Descrição</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Preço (R$)</label>
          <input required inputMode="decimal" placeholder="14,00" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} />
        </div>
        <div className="field">
          <label>Foto</label>
          {imageUrl && (
            <img src={imageUrl} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelected} disabled={uploading} />
          {uploading && <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>Enviando...</span>}
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="ou cole uma URL"
            style={{ marginTop: 6 }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.86rem", marginBottom: 16 }}>
          <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
          Destacar no cardápio
        </label>

        {error && <div className="error-box">{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} disabled={saving || uploading}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

function OptionsManager({
  product,
  onClose,
  onChanged,
}: {
  product: Product;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function addGroup() {
    if (!newGroupName.trim()) return;
    setError(null);
    const res = await fetch(`/api/admin/products/${product.id}/option-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName.trim(), minSelect: 0, maxSelect: 1, isRequired: false }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erro ao criar grupo."); return; }
    setNewGroupName("");
    onChanged();
  }

  async function updateGroup(groupId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/option-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChanged();
  }

  async function deleteGroup(groupId: string) {
    setError(null);
    const res = await fetch(`/api/admin/option-groups/${groupId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erro ao remover grupo."); return; }
    onChanged();
  }

  async function addOption(groupId: string, name: string, priceReais: string) {
    if (!name.trim()) return;
    const priceDeltaCents = Math.round((parseFloat(priceReais.replace(",", ".")) || 0) * 100);
    const res = await fetch(`/api/admin/option-groups/${groupId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), priceDeltaCents }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erro ao adicionar opção."); return; }
    onChanged();
  }

  async function toggleOption(optionId: string, isActive: boolean) {
    await fetch(`/api/admin/options/${optionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    onChanged();
  }

  async function removeOption(optionId: string) {
    setNote(null);
    const res = await fetch(`/api/admin/options/${optionId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.note) setNote(data.note);
    onChanged();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 480, maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 4 }}>Opções — {product.name}</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginBottom: 16 }}>
          Grupos como &quot;Ponto da carne&quot; (obrigatório) ou &quot;Adicionais&quot; (opcional, com preço extra).
        </p>

        {error && <div className="error-box">{error}</div>}
        {note && <div className="error-box" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>{note}</div>}

        {product.optionGroups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            onUpdateGroup={(patch) => updateGroup(group.id, patch)}
            onDeleteGroup={() => deleteGroup(group.id)}
            onAddOption={(name, price) => addOption(group.id, name, price)}
            onToggleOption={toggleOption}
            onRemoveOption={removeOption}
          />
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <input
            placeholder="Nome do novo grupo (ex: Adicionais)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm" onClick={addGroup}>+ Grupo</button>
        </div>

        <button className="btn-ghost" style={{ width: "100%", marginTop: 16 }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

function GroupEditor({
  group,
  onUpdateGroup,
  onDeleteGroup,
  onAddOption,
  onToggleOption,
  onRemoveOption,
}: {
  group: OptionGroupRow;
  onUpdateGroup: (patch: Record<string, unknown>) => void;
  onDeleteGroup: () => void;
  onAddOption: (name: string, priceReais: string) => void;
  onToggleOption: (optionId: string, isActive: boolean) => void;
  onRemoveOption: (optionId: string) => void;
}) {
  const [optName, setOptName] = useState("");
  const [optPrice, setOptPrice] = useState("");

  return (
    <div className="card" style={{ marginBottom: 12, background: "#1a130e" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <input
          value={group.name}
          onChange={(e) => onUpdateGroup({ name: e.target.value })}
          style={{ fontWeight: 700, border: "none", background: "transparent", fontSize: "0.95rem", padding: 0 }}
        />
        <button className="btn-outline-danger btn-sm" onClick={onDeleteGroup}>remover grupo</button>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: "0.8rem", color: "var(--ink-soft)", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={group.isRequired}
            onChange={(e) => onUpdateGroup({ isRequired: e.target.checked, minSelect: e.target.checked ? 1 : 0 })}
          />
          obrigatório
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          máx. de escolhas:
          <input
            type="number"
            min={1}
            max={20}
            value={group.maxSelect}
            onChange={(e) => onUpdateGroup({ maxSelect: parseInt(e.target.value, 10) || 1 })}
            style={{ width: 50 }}
          />
        </label>
      </div>

      {group.options.map((option) => (
        <div key={option.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", opacity: option.isActive ? 1 : 0.5 }}>
          <span>{option.name} {option.priceDeltaCents !== 0 && `(+${formatCents(option.priceDeltaCents)})`}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="btn-sm btn-ghost" onClick={() => onToggleOption(option.id, option.isActive)}>
              {option.isActive ? "ativa" : "inativa"}
            </button>
            <button className="btn-outline-danger btn-sm" onClick={() => onRemoveOption(option.id)}>remover</button>
          </span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input placeholder="Nova opção" value={optName} onChange={(e) => setOptName(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="+R$" inputMode="decimal" value={optPrice} onChange={(e) => setOptPrice(e.target.value)} style={{ width: 70 }} />
        <button
          className="btn-sm btn-ghost"
          onClick={() => { onAddOption(optName, optPrice); setOptName(""); setOptPrice(""); }}
        >
          + opção
        </button>
      </div>
    </div>
  );
}
