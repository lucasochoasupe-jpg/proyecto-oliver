import { NextResponse } from "next/server";
import { ejecutarImportacionCaja, getCajaSheetUrl } from "@/lib/db";
import { fetchCsvDesdeSheet, parseCsvCaja } from "@/lib/caja-import";

export const dynamic = "force-dynamic";

// Vuelve a leer la planilla (no reutiliza el preview) para importar siempre
// sobre el estado más fresco posible — la deduplicación por contenido hace
// que esto sea seguro de correr varias veces seguidas.
export async function POST() {
  const sheetUrl = getCajaSheetUrl();
  if (!sheetUrl) {
    return NextResponse.json({ error: "Todavía no configuraste el link de la planilla" }, { status: 400 });
  }

  try {
    const csv = await fetchCsvDesdeSheet(sheetUrl);
    const filas = parseCsvCaja(csv);
    const resultado = ejecutarImportacionCaja(filas);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo importar la planilla" }, { status: 502 });
  }
}
