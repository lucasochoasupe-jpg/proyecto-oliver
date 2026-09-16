import { NextRequest, NextResponse } from "next/server";
import { asignarEmpleadosAPuesto, getPuestoById } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const puestoId = Number(id);
  if (!getPuestoById(puestoId)) {
    return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as { empleadoIds?: number[] } | null;
  const empleadoIds = Array.isArray(body?.empleadoIds)
    ? body.empleadoIds.map(Number).filter((n) => Number.isInteger(n))
    : [];

  asignarEmpleadosAPuesto(puestoId, empleadoIds);
  return NextResponse.json({ ok: true });
}
