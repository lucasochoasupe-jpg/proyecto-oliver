import { NextRequest, NextResponse } from "next/server";
import { crearCajaMovimiento, getCajaConcepto, getCajaCuenta, listCajaMovimientos } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const cuentaId = searchParams.get("cuentaId") ? Number(searchParams.get("cuentaId")) : undefined;
  const conceptoId = searchParams.get("conceptoId") ? Number(searchParams.get("conceptoId")) : undefined;
  const tipoMovimiento = searchParams.get("tipo") as "ingreso" | "salida" | null;

  const movimientos = listCajaMovimientos({
    desde,
    hasta,
    cuentaId,
    conceptoId,
    tipoMovimiento: tipoMovimiento ?? undefined,
  });
  return NextResponse.json(movimientos);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const fecha = body?.fecha;
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const conceptoId = Number(body?.conceptoId);
  const cuentaId = Number(body?.cuentaId);
  const correspondeA = typeof body?.correspondeA === "string" ? body.correspondeA.trim() : "";
  const tipoMovimiento = body?.tipoMovimiento;
  const importeNeto = Number(body?.importeNeto);
  const iva = body?.iva !== undefined ? Number(body.iva) : 0;
  const otrosConceptos = body?.otrosConceptos !== undefined ? Number(body.otrosConceptos) : 0;
  const nota = typeof body?.nota === "string" && body.nota.trim() ? body.nota.trim() : null;

  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  if (!getCajaConcepto(conceptoId)) {
    return NextResponse.json({ error: "Concepto inválido" }, { status: 400 });
  }
  if (!getCajaCuenta(cuentaId)) {
    return NextResponse.json({ error: "Cuenta inválida" }, { status: 400 });
  }
  if (!correspondeA) {
    return NextResponse.json({ error: "Falta a qué período corresponde" }, { status: 400 });
  }
  if (tipoMovimiento !== "ingreso" && tipoMovimiento !== "salida") {
    return NextResponse.json({ error: "El tipo de movimiento debe ser ingreso o salida" }, { status: 400 });
  }
  if (!Number.isFinite(importeNeto) || importeNeto <= 0) {
    return NextResponse.json({ error: "El importe debe ser mayor a 0" }, { status: 400 });
  }

  const movimiento = crearCajaMovimiento({
    fecha,
    nombre,
    conceptoId,
    cuentaId,
    correspondeA,
    tipoMovimiento,
    importeNeto,
    iva,
    otrosConceptos,
    nota,
  });
  return NextResponse.json(movimiento, { status: 201 });
}
