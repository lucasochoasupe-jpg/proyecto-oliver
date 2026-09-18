import { NextResponse } from "next/server";
import { getCajaSheetUrl, previsualizarImportacionCaja } from "@/lib/db";
import { fetchCsvDesdeSheet, parseCsvCaja } from "@/lib/caja-import";

export const dynamic = "force-dynamic";

export async function POST() {
  const sheetUrl = getCajaSheetUrl();
  if (!sheetUrl) {
    return NextResponse.json({ error: "Todavía no configuraste el link de la planilla" }, { status: 400 });
  }

  try {
    const csv = await fetchCsvDesdeSheet(sheetUrl);
    const filas = parseCsvCaja(csv);
    const preview = previsualizarImportacionCaja(filas);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo leer la planilla" }, { status: 502 });
  }
}
