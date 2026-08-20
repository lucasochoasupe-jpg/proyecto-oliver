import { NextRequest, NextResponse } from "next/server";
import { updateHorario, deleteHorario } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    sucursal_id?: number;
    dia_semana?: number;
    hora_inicio?: string;
    hora_fin?: string;
    tolerancia_min?: number | null;
  };
  updateHorario(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteHorario(Number(id));
  return NextResponse.json({ ok: true });
}
