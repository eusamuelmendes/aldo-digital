import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.TABLE_TOKEN_SECRET;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = secret ? await verifySessionToken(token, secret) : null;
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.uid))
    .limit(1);

  if (!user || !user.isActive) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
