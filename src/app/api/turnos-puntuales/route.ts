import { NextRequest, NextResponse } from "next/server";
import { crearTurnoPuntual, getEmpleadoById, listTurnosPuntuales } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empleadoIdParam = searchParams.get("empleadoId");
  const empleadoId = empleadoIdParam ? Number(empleadoIdParam) : undefined;
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  return NextResponse.json(listTurnosPuntuales({ empleadoId, desde, hasta }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const empleadoId = Number(body?.empleadoId);
  const fecha = body?.fecha;
  const horaInicio = body?.horaInicio;
  const horaFin = body?.horaFin;
  const sucursalId = body?.sucursalId ? Number(body.sucursalId) : null;
  const toleranciaMin = body?.toleranciaMin !== undefined && body?.toleranciaMin !== null && body.toleranciaMin !== ""
    ? Number(body.toleranciaMin)
    : null;
  const nota = typeof body?.nota === "string" && body.nota.trim() ? body.nota.trim() : null;

  if (!empleadoId || !Number.isFinite(empleadoId)) {
    return NextResponse.json({ error: "Falta el empleado" }, { status: 400 });
  }
  if (!getEmpleadoById(empleadoId)) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  }
  if (typeof horaInicio !== "string" || typeof horaFin !== "string" || !horaInicio || !horaFin) {
    return NextResponse.json({ error: "Falta el horario" }, { status: 400 });
  }

  const turno = crearTurnoPuntual({
    empleadoId,
    sucursalId,
    fecha,
    horaInicio,
    horaFin,
    toleranciaMin,
    nota,
  });
  return NextResponse.json(turno, { status: 201 });
}
