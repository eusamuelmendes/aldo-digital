/**
 * Dinheiro em centavos (inteiro). Nunca Float.
 *
 * Motivo prático: 0.1 + 0.2 === 0.30000000000000004 em JavaScript. Somando
 * 40 itens de uma comanda isso vira divergência de centavos no fechamento do
 * caixa — e ninguém consegue explicar de onde veio. Trabalhando em centavos,
 * toda soma é exata.
 */

export type Cents = number;

export function isValidCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 1400 -> "R$ 14,00" */
export function formatBRL(cents: Cents): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** "14,00" | "14.00" | "R$ 14,00" -> 1400 (uso administrativo: cadastro de produto) */
export function parseBRLToCents(input: string): Cents {
  const normalized = input
    .replace(/[R$\s.]/g, "")
    .replace(",", ".")
    .trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Valor monetário inválido: ${input}`);
  }
  return Math.round(value * 100);
}

/**
 * Percentual sobre um valor, arredondado para o centavo mais próximo.
 * Ex.: taxa de atendimento de 10% sobre R$ 87,50 => 875 centavos.
 */
export function percentOf(cents: Cents, percent: number): Cents {
  if (!isValidCents(cents)) throw new Error("Valor base inválido");
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error("Percentual inválido");
  }
  return Math.round((cents * percent) / 100);
}
