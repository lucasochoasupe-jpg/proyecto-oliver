import { NextRequest, NextResponse } from "next/server";
import { eliminarAdelanto, getAdelanto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adelanto = getAdelanto(Number(id));
  if (!adelanto) {
    return NextResponse.json({ error: "Adelanto no encontrado" }, { status: 404 });
  }
  eliminarAdelanto(adelanto.id);
  return NextResponse.json({ ok: true });
}
