import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;

  const validUser = process.env.DASHBOARD_USER;
  const validPassword = process.env.DASHBOARD_PASSWORD;

  if (!validUser || !validPassword) {
    return NextResponse.json({ error: "Login no configurado (falta DASHBOARD_USER/DASHBOARD_PASSWORD)" }, { status: 500 });
  }

  if (body?.username !== validUser || body?.password !== validPassword) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
