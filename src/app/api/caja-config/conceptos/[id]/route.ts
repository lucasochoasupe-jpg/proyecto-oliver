import { NextRequest, NextResponse } from "next/server";
import { getCajaConcepto, updateCajaConcepto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const concepto = getCajaConcepto(Number(id));
  if (!concepto) {
    return NextResponse.json({ error: "Concepto no encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  updateCajaConcepto(concepto.id, {
    nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
    activo: typeof body?.activo === "boolean" ? body.activo : undefined,
    orden: typeof body?.orden === "number" ? body.orden : undefined,
  });
  return NextResponse.json(getCajaConcepto(concepto.id));
}
