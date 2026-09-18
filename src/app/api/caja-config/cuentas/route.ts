import { NextRequest, NextResponse } from "next/server";
import { crearCajaCuenta, listCajaCuentas } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listCajaCuentas());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  try {
    const cuenta = crearCajaCuenta(nombre);
    return NextResponse.json(cuenta, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe una cuenta con ese nombre" }, { status: 409 });
  }
}
