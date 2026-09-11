import { NextRequest, NextResponse } from "next/server";
import { calcularTopeAdelanto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empleadoId = Number(searchParams.get("empleadoId"));
  const fecha = searchParams.get("fecha");

  if (!empleadoId || !fecha) {
    return NextResponse.json({ error: "Faltan empleadoId y fecha" }, { status: 400 });
  }

  return NextResponse.json(calcularTopeAdelanto(empleadoId, fecha));
}
