import { NextRequest, NextResponse } from "next/server";
import { listHorarios, insertHorario } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get("empleado_id");
  return NextResponse.json(listHorarios(empleadoId ? Number(empleadoId) : undefined));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    empleado_id: number;
    sucursal_id?: number | null;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    tolerancia_min?: number | null;
  };
  if (!body.empleado_id || body.dia_semana === undefined || !body.hora_inicio || !body.hora_fin) {
    return NextResponse.json({ error: "Faltan datos del turno" }, { status: 400 });
  }
  insertHorario(body);
  return NextResponse.json({ ok: true });
}
