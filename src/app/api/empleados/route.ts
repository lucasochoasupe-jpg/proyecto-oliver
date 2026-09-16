import { NextRequest, NextResponse } from "next/server";
import { listEmpleados, insertEmpleado, deleteEmpleadosMany } from "@/lib/db";

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

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No se recibieron IDs válidos." }, { status: 400 });
  }

  deleteEmpleadosMany(ids);
  return NextResponse.json({ ok: true, deleted: ids.length });
}
