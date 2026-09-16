import { NextRequest, NextResponse } from "next/server";
import { eliminarAusenciaReportadaManual, eliminarAvisoBot } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId === 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Los negativos identifican cargas manuales (ver POST /api/rrhh) —
  // viven en ausencias_reportadas, no en messages.
  const ok = numId < 0 ? eliminarAusenciaReportadaManual(-numId) : eliminarAvisoBot(numId);

  if (!ok) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
