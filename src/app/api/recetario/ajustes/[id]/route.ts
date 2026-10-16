import { NextRequest, NextResponse } from "next/server";
import { ajustarReceta } from "@/lib/recetario";

export const dynamic = "force-dynamic";

// Corrige la unidad (kg / unidad) de una receta o la oculta del buscador.
// Se guarda aparte de las recetas, así sobrevive a la próxima sincronización.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { unidad?: string | null; oculto?: boolean } | null;
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const unidad =
    body.unidad === undefined ? undefined : body.unidad === "kg" || body.unidad === "unidad" ? body.unidad : null;
  ajustarReceta(id, { unidad, oculto: body.oculto });
  return NextResponse.json({ ok: true });
}
