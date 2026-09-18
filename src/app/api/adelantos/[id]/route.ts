import { NextRequest, NextResponse } from "next/server";
import { eliminarAdelanto, eliminarGrupoAdelanto, getAdelanto } from "@/lib/db";

export const dynamic = "force-dynamic";

// Con ?grupo=true borra todas las cuotas del adelanto dividido de una vez;
// si no, borra solo esta cuota puntual.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const grupo = searchParams.get("grupo") === "true";

  const adelanto = getAdelanto(Number(id));
  if (!adelanto) {
    return NextResponse.json({ error: "Adelanto no encontrado" }, { status: 404 });
  }
  if (grupo && adelanto.grupo_id) {
    const eliminados = eliminarGrupoAdelanto(adelanto.grupo_id);
    return NextResponse.json({ ok: true, eliminados });
  }
  eliminarAdelanto(adelanto.id);
  return NextResponse.json({ ok: true, eliminados: 1 });
}
