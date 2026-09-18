/**
 * Protege /admin/* (páginas) e /api/admin/* (dados). Sem sessão válida,
 * redireciona para o login (páginas) ou devolve 401 (API) — nunca deixa a
 * rota passar "quase autenticada".
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi = pathname.startsWith("/api/admin");
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const secret = process.env.TABLE_TOKEN_SECRET;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = secret ? await verifySessionToken(token, secret) : null;

  if (!payload) {
    if (isAdminApi) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada.", code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-aldo-user-id", payload.uid);
  response.headers.set("x-aldo-user-role", payload.role);
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
