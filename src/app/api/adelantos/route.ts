import { NextRequest, NextResponse } from "next/server";
import { calcularTopeAdelanto, crearAdelantoConCuotas, getEmpleadoById, listAdelantos } from "@/lib/db";

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

// Acepta tanto un adelanto simple ({ fecha, monto }) como uno dividido en
// cuotas ({ cuotas: [{ fecha, monto }, ...] }) — la nota es una sola y se
// comparte entre todas las cuotas del grupo.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const empleadoId = Number(body?.empleadoId);
  const nota = typeof body?.nota === "string" && body.nota.trim() ? body.nota.trim() : null;

  if (!empleadoId || !Number.isFinite(empleadoId)) {
    return NextResponse.json({ error: "Falta el empleado" }, { status: 400 });
  }
  if (!getEmpleadoById(empleadoId)) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const cuotasBody: unknown[] = Array.isArray(body?.cuotas) ? body.cuotas : [{ fecha: body?.fecha, monto: body?.monto }];
  const cuotas: { fecha: string; monto: number }[] = [];
  for (const c of cuotasBody) {
    const fecha = (c as { fecha?: unknown } | null)?.fecha;
    const monto = Number((c as { monto?: unknown } | null)?.monto);
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: "Cada cuota necesita una fecha válida" }, { status: 400 });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: "Cada cuota necesita un monto mayor a 0" }, { status: 400 });
    }
    cuotas.push({ fecha, monto });
  }

  const creados = crearAdelantoConCuotas({ empleadoId, nota, cuotas });

  // El tope del 20% se valida de referencia sobre el mes de la primera cuota.
  const tope = calcularTopeAdelanto(empleadoId, cuotas[0].fecha);
  let advertencia: string | null = null;
  if (tope.limite !== null && tope.usado > tope.limite) {
    const formatARS = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
    advertencia = `Supera el tope del 20% del sueldo: lleva ${formatARS(tope.usado)} adelantados este mes sobre un tope de ${formatARS(tope.limite)}.`;
  } else if (tope.base === null) {
    advertencia = "No se pudo validar el tope del 20% porque el empleado no tiene sueldo (mensual o estimado) configurado en Empleados.";
  }

  return NextResponse.json({ creados, advertencia }, { status: 201 });
}
