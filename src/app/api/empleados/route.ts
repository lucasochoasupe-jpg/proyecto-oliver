import { NextRequest, NextResponse } from "next/server";
import { listEmpleados, insertEmpleado } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listEmpleados());
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { nombre: string; celular?: string };
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
  }
  try {
    insertEmpleado(body.nombre.trim(), body.celular?.trim() || undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "El nombre ya existe" }, { status: 409 });
  }
}
