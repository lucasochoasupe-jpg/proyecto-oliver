import { NextRequest, NextResponse } from "next/server";
import { calcularTopeAdelanto, crearAdelanto, getEmpleadoById, listAdelantos } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const empleadoIdParam = searchParams.get("empleadoId");
  const empleadoId = empleadoIdParam ? Number(empleadoIdParam) : undefined;

  const adelantos = listAdelantos({ desde, hasta, empleadoId });
  return NextResponse.json(adelantos);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const empleadoId = Number(body?.empleadoId);
  const fecha = body?.fecha;
  const monto = Number(body?.monto);
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
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
  }

  const adelanto = crearAdelanto({ empleadoId, fecha, monto, nota });

  const tope = calcularTopeAdelanto(empleadoId, fecha);
  let advertencia: string | null = null;
  if (tope.limite !== null && tope.usado > tope.limite) {
    const formatARS = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
    advertencia = `Supera el tope del 20% del sueldo: lleva ${formatARS(tope.usado)} adelantados este mes sobre un tope de ${formatARS(tope.limite)}.`;
  } else if (tope.base === null) {
    advertencia = "No se pudo validar el tope del 20% porque el empleado no tiene sueldo (mensual o estimado) configurado en Empleados.";
  }

  return NextResponse.json({ ...adelanto, advertencia }, { status: 201 });
}
