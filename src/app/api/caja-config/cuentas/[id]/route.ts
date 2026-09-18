import { NextRequest, NextResponse } from "next/server";
import { getCajaCuenta, updateCajaCuenta } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cuenta = getCajaCuenta(Number(id));
  if (!cuenta) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  updateCajaCuenta(cuenta.id, {
    nombre: typeof body?.nombre === "string" ? body.nombre : undefined,
    activo: typeof body?.activo === "boolean" ? body.activo : undefined,
    orden: typeof body?.orden === "number" ? body.orden : undefined,
  });
  return NextResponse.json(getCajaCuenta(cuenta.id));
}
