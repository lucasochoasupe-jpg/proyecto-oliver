import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const result = db.prepare("DELETE FROM messages WHERE id = ? AND role = 'assistant'").run(numId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
