/**
 * POST /api/auth/login — autenticação real do painel (não é mock).
 * Verifica hash scrypt contra o banco e emite cookie de sessão assinado.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, COOKIE_NAME } from "@/lib/session";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const secret = process.env.TABLE_TOKEN_SECRET; // reaproveita o segredo do app
  if (!secret) {
    return NextResponse.json(
      { error: "Servidor sem segredo de sessão configurado.", code: "CONFIG" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido.", code: "BAD_JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "E-mail ou senha inválidos.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1);

  // Mesma resposta para "não existe" e "senha errada" — não vaza quais
  // e-mails têm conta no sistema.
  const invalid = () =>
    NextResponse.json(
      { error: "E-mail ou senha inválidos.", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );

  if (!user || !user.isActive) return invalid();

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return invalid();

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const token = await createSessionToken(user, secret);
  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
