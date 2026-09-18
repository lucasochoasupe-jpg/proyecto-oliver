import { NextRequest, NextResponse } from "next/server";
import { eliminarCajaMovimiento, getCajaMovimiento, updateCajaMovimiento } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const movimiento = getCajaMovimiento(Number(id));
  if (!movimiento) {
    return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const actualizado = updateCajaMovimiento(movimiento.id, {
    fecha: typeof body?.fecha === "string" ? body.fecha : undefined,
    nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
    conceptoId: body?.conceptoId !== undefined ? Number(body.conceptoId) : undefined,
    cuentaId: body?.cuentaId !== undefined ? Number(body.cuentaId) : undefined,
    correspondeA: typeof body?.correspondeA === "string" ? body.correspondeA : undefined,
    tipoMovimiento: body?.tipoMovimiento === "ingreso" || body?.tipoMovimiento === "salida" ? body.tipoMovimiento : undefined,
    importeNeto: body?.importeNeto !== undefined ? Number(body.importeNeto) : undefined,
    iva: body?.iva !== undefined ? Number(body.iva) : undefined,
    otrosConceptos: body?.otrosConceptos !== undefined ? Number(body.otrosConceptos) : undefined,
    nota: body?.nota !== undefined ? (typeof body.nota === "string" && body.nota.trim() ? body.nota.trim() : null) : undefined,
  });
  return NextResponse.json(actualizado);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const movimiento = getCajaMovimiento(Number(id));
  if (!movimiento) {
    return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }
  eliminarCajaMovimiento(movimiento.id);
  return NextResponse.json({ ok: true });
}
