import { randomBytes } from "node:crypto";

/**
 * Identificador público, opaco e ordenável por tempo.
 *
 * Evita id sequencial exposto (1, 2, 3...) porque isso vaza volume de negócio
 * — qualquer um descobriria quantos pedidos o bar faz por dia só olhando a
 * URL. O número legível do pedido (#1047) existe à parte, para a operação.
 *
 * Formato: <timestamp base36><12 bytes aleatórios em hex>
 */
export function createId(): string {
  return Date.now().toString(36) + randomBytes(12).toString("hex");
}
