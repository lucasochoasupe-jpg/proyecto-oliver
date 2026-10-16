import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, ROL_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, type Rol } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;

  const validUser = process.env.DASHBOARD_USER;
  const validPassword = process.env.DASHBOARD_PASSWORD;

  if (!validUser || !validPassword) {
    return NextResponse.json({ error: "Login no configurado (falta DASHBOARD_USER/DASHBOARD_PASSWORD)" }, { status: 500 });
  }

  // Usuario de la cuadra: opcional, solo entra al Recetario.
  const prodUser = process.env.PRODUCCION_USER;
  const prodPassword = process.env.PRODUCCION_PASSWORD;

  let rol: Rol | null = null;
  if (body?.username === validUser && body?.password === validPassword) rol = "admin";
  else if (prodUser && prodPassword && body?.username === prodUser && body?.password === prodPassword) rol = "produccion";

  if (!rol) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, rol });
  const opciones = {
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
  res.cookies.set(SESSION_COOKIE, await createSessionToken(rol), { ...opciones, httpOnly: true });
  res.cookies.set(ROL_COOKIE, rol, opciones);
  return res;
}
