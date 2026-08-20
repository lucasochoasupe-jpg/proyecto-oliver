import { NextRequest, NextResponse } from "next/server";
import { listTurnoTemplates, insertTurnoTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listTurnoTemplates());
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    nombre?: string;
    hora_inicio?: string;
    hora_fin?: string;
    dias_semana?: number[];
    tolerancia_min?: number | null;
  };
  if (!body.nombre?.trim() || !body.hora_inicio || !body.hora_fin) {
    return NextResponse.json({ error: "Faltan datos de la plantilla" }, { status: 400 });
  }
  try {
    insertTurnoTemplate(
      body.nombre.trim(),
      body.hora_inicio,
      body.hora_fin,
      body.dias_semana ?? [],
      body.tolerancia_min ?? null
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ya existe una plantilla con ese nombre" }, { status: 409 });
  }
}
