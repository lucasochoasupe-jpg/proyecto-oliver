import { NextRequest, NextResponse } from "next/server";
import { deleteTurnoTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteTurnoTemplate(Number(id));
  return NextResponse.json({ ok: true });
}
