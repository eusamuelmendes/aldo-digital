"use client";

/**
 * Carrinho no cliente — guarda só o que precisa para MOSTRAR o preço
 * (referência para exibição), nunca o que decide o preço final: quando o
 * pedido é enviado, o servidor recarrega tudo do banco e recalcula do zero
 * (src/lib/pricing.ts). Persistido em localStorage só para sobreviver a um
 * refresh acidental — não é fonte de verdade de nada.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  key: string; // productId + optionIds ordenados, para agrupar linhas iguais
  productId: string;
  productName: string;
  imageUrl?: string | null;
  unitPriceCents: number;
  quantity: number;
  notes?: string;
  options: { id: string; name: string; priceDeltaCents: number }[];
};

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "key">) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  itemCount: number;
  totalCents: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "aldo-cart-v1";

function makeKey(productId: string, optionIds: string[], notes?: string) {
  return [productId, ...optionIds.sort(), notes ?? ""].join("::");
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // localStorage indisponível (aba anônima, etc.) — carrinho começa vazio
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // segue sem persistir
    }
  }, [lines, hydrated]);

  const addLine = useCallback((line: Omit<CartLine, "key">) => {
    const key = makeKey(
      line.productId,
      line.options.map((o) => o.id),
      line.notes,
    );
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l,
        );
      }
      return [...prev, { ...line, key }];
    });
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity } : l));
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalCents = lines.reduce((sum, l) => {
    const optionsSum = l.options.reduce((s, o) => s + o.priceDeltaCents, 0);
    return sum + (l.unitPriceCents + optionsSum) * l.quantity;
  }, 0);

  const value = useMemo(
    () => ({ lines, addLine, updateQuantity, removeLine, clear, itemCount, totalCents }),
    [lines, addLine, updateQuantity, removeLine, clear, itemCount, totalCents],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de <CartProvider>");
  return ctx;
}
