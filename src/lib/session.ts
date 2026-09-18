/**
 * Sessão de login do painel — cookie assinado (HMAC), sem tabela de sessões.
 *
 * Usa Web Crypto (globalThis.crypto.subtle) em vez de node:crypto porque este
 * módulo é importado pelo middleware do Next.js, que roda no runtime Edge —
 * lá node:crypto não está disponível, mas Web Crypto sim (e funciona igual
 * nas rotas normais, que rodam em Node).
 */

export type SessionPayload = {
  uid: string; // user id
  role: string;
  v: 1;
  exp: number; // epoch ms
};

const COOKIE_NAME = "aldo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

export async function createSessionToken(
  user: { id: string; role: string },
  secret: string,
): Promise<string> {
  const payload: SessionPayload = {
    uid: user.id,
    role: user.role,
    v: 1,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature).slice().buffer as ArrayBuffer,
    new TextEncoder().encode(encoded),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encoded)),
    ) as SessionPayload;
    if (payload.v !== 1 || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
