import { NextRequest, NextResponse } from "next/server";
import db, { eliminarAusenciaReportadaManual } from "@/lib/db";

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
  const ok =
    numId < 0
      ? eliminarAusenciaReportadaManual(-numId)
      : db.prepare("DELETE FROM messages WHERE id = ? AND role = 'assistant'").run(numId).changes > 0;

  if (!ok) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
