import { NextRequest, NextResponse } from "next/server";
import { aprobarAsistenciaRechazada, descartarAsistenciaRechazada } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: "aprobar" | "descartar" } | null;

  try {
    if (body?.action === "aprobar") {
      aprobarAsistenciaRechazada(Number(id));
    } else if (body?.action === "descartar") {
      descartarAsistenciaRechazada(Number(id));
    } else {
      return NextResponse.json({ error: "action debe ser 'aprobar' o 'descartar'" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar el intento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
