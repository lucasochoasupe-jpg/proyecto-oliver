import { NextRequest, NextResponse } from "next/server";
import { eliminarTurnoPuntual, getTurnoPuntual } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const turno = getTurnoPuntual(Number(id));
  if (!turno) {
    return NextResponse.json({ error: "Turno puntual no encontrado" }, { status: 404 });
  }
  eliminarTurnoPuntual(turno.id);
  return NextResponse.json({ ok: true });
}
