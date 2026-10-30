import { NextRequest, NextResponse } from "next/server";
import { confirmarFilaCaja, getCajaSheetUrl } from "@/lib/db";
import { fetchCsvDesdeSheet, parseCsvCaja } from "@/lib/caja-import";

export const dynamic = "force-dynamic";

// Confirma una sola fila de las que se completaron solas (concepto, cuenta o
// Ingreso/Salida copiados de filas parecidas). Relee la planilla igual que
// "ejecutar", para importar sobre el estado más fresco.
export async function POST(req: NextRequest) {
  const sheetUrl = getCajaSheetUrl();
  if (!sheetUrl) {
    return NextResponse.json({ error: "Todavía no configuraste el link de la planilla" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.fecha || typeof body.importeNeto !== "number" || !body.cuenta || !body.tipoMovimiento) {
    return NextResponse.json({ error: "Faltan datos de la fila" }, { status: 400 });
  }

  try {
    const filas = parseCsvCaja(await fetchCsvDesdeSheet(sheetUrl));
    const r = confirmarFilaCaja(filas, {
      fecha: String(body.fecha),
      nombre: String(body.nombre ?? ""),
      cuenta: String(body.cuenta),
      importeNeto: body.importeNeto,
      tipoMovimiento: String(body.tipoMovimiento),
    });
    if (!r.importado) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo confirmar" }, { status: 502 });
  }
}
