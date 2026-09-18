/**
 * SEGURANÇA DO QR CODE DAS MESAS
 *
 * O problema de usar /mesa/01, /mesa/02: qualquer cliente troca o número na
 * URL e lança o consumo dele na conta da mesa do vizinho. É trivial de
 * explorar e impossível de auditar depois.
 *
 * Solução adotada: o QR Code não carrega o número da mesa em texto puro, e sim
 * um token assinado:
 *
 *     /m/<payload>.<assinatura>
 *
 * - payload  = base64url de { t: tableId, n: número, v: versão }
 * - assinatura = HMAC-SHA256(payload, TABLE_TOKEN_SECRET + qrSecret da mesa)
 *
 * Trocar qualquer coisa no payload invalida a assinatura. Como cada mesa tem
 * seu próprio `qrSecret`, descobrir o token de uma mesa não permite forjar o
 * de outra, e é possível "girar" o QR de uma mesa específica (trocando o
 * qrSecret dela) sem reimprimir os QR Codes das demais.
 *
 * O token NÃO expira por tempo: um adesivo de mesa fica colado por meses. O
 * controle de "quem está sentado agora" é feito pela TableSession, não pelo
 * token.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export type TablePayload = {
  /** id da mesa no banco */
  t: string;
  /** número visível da mesa (conferência humana) */
  n: number;
  /** versão do formato, para permitir evolução sem quebrar QRs impressos */
  v: number;
};

const CURRENT_VERSION = 1;

export class TableTokenError extends Error {
  constructor(
    message: string,
    readonly code: "MALFORMED" | "BAD_SIGNATURE" | "UNSUPPORTED_VERSION",
  ) {
    super(message);
    this.name = "TableTokenError";
  }
}

/** Segredo por mesa, gerado no cadastro. */
export function generateQrSecret(): string {
  return randomBytes(24).toString("hex");
}

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function sign(payload: string, appSecret: string, qrSecret: string): string {
  return createHmac("sha256", `${appSecret}:${qrSecret}`)
    .update(payload)
    .digest("base64url");
}

export function createTableToken(
  table: { id: string; number: number; qrSecret: string },
  appSecret: string,
): string {
  if (!appSecret) {
    throw new Error("TABLE_TOKEN_SECRET não configurado.");
  }
  const payload: TablePayload = {
    t: table.id,
    n: table.number,
    v: CURRENT_VERSION,
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encoded, appSecret, table.qrSecret);
  return `${encoded}.${signature}`;
}

/**
 * Verifica o token. `resolveQrSecret` recebe o tableId do payload e devolve o
 * segredo daquela mesa (normalmente uma consulta ao banco) — a assinatura só
 * é validada depois, então um tableId forjado não passa daqui.
 */
export async function verifyTableToken(
  token: string,
  appSecret: string,
  resolveQrSecret: (tableId: string) => Promise<string | null>,
): Promise<TablePayload> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TableTokenError("Token de mesa malformado.", "MALFORMED");
  }
  const [encoded, signature] = parts;

  let payload: TablePayload;
  try {
    payload = JSON.parse(base64urlDecode(encoded)) as TablePayload;
  } catch {
    throw new TableTokenError("Token de mesa ilegível.", "MALFORMED");
  }

  if (typeof payload?.t !== "string" || typeof payload?.n !== "number") {
    throw new TableTokenError("Conteúdo do token inválido.", "MALFORMED");
  }
  if (payload.v !== CURRENT_VERSION) {
    throw new TableTokenError(
      `Versão de token não suportada: ${payload.v}`,
      "UNSUPPORTED_VERSION",
    );
  }

  const qrSecret = await resolveQrSecret(payload.t);
  if (!qrSecret) {
    // Mesa inexistente/desativada: mesma resposta de assinatura inválida,
    // para não revelar quais ids existem.
    throw new TableTokenError("Assinatura inválida.", "BAD_SIGNATURE");
  }

  const expected = sign(encoded, appSecret, qrSecret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  // Comparação em tempo constante evita vazar informação por timing.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TableTokenError("Assinatura inválida.", "BAD_SIGNATURE");
  }

  return payload;
}
