import { NextRequest, NextResponse } from "next/server";
import { insertHorariosBulk } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    empleado_ids?: number[];
    dias_semana?: number[];
    hora_inicio?: string;
    hora_fin?: string;
    tolerancia_min?: number | null;
  };

  if (!body.empleado_ids?.length || !body.dias_semana?.length || !body.hora_inicio || !body.hora_fin) {
    return NextResponse.json({ error: "Faltan datos para asignar el turno" }, { status: 400 });
  }

  insertHorariosBulk({
    empleado_ids: body.empleado_ids,
    dias_semana: body.dias_semana,
    hora_inicio: body.hora_inicio,
    hora_fin: body.hora_fin,
    tolerancia_min: body.tolerancia_min,
  });
  return NextResponse.json({ ok: true });
}
