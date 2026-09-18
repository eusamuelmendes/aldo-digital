/**
 * Rótulos em português para o status do pedido — usados tanto na tela do
 * cliente (/pedido/:id) quanto no painel (/admin/pedidos), pra nunca mais
 * aparecer "READY" ou "DELIVERED" crus na tela de alguém.
 */
export type OrderStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  READY: "Pronto",
  DELIVERED: "Entregue",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};
