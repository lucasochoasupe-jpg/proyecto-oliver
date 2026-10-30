import { NextRequest, NextResponse } from "next/server";
import { calcularAusencias, decidirFranco } from "@/lib/db";

export const dynamic = "force-dynamic";

// Días que pueden ser el franco semanal (ver calcularAusencias): los que
// esperan respuesta y los ya confirmados, uno por empleado y fecha.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const desde = p.get("desde") ?? "";
  const hasta = p.get("hasta") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  const vistos = new Set<string>();
  const francos = calcularAusencias({ desde, hasta }, { conFrancos: true })
    .filter((a) => a.franco !== null && a.empleado_id !== null)
    .filter((a) => {
      const k = `${a.empleado_id}|${a.fecha}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map((a) => ({ empleado_id: a.empleado_id, empleado_nombre: a.empleado_nombre, fecha: a.fecha, estado: a.franco }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.empleado_nombre.localeCompare(b.empleado_nombre, "es"));
  return NextResponse.json(francos);
}

// { empleadoId, fecha, decision: "franco" | "falta" | null } (null = deshacer),
// o { francos: [{ empleadoId, fecha }, ...] } para confirmar varios de una vez.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (Array.isArray(body?.francos)) {
    const lote = (body.francos as { empleadoId?: unknown; fecha?: unknown }[])
      .map((f) => ({ empleadoId: Number(f?.empleadoId), fecha: String(f?.fecha ?? "") }))
      .filter((f) => f.empleadoId && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha));
    for (const f of lote) decidirFranco(f.empleadoId, f.fecha, "franco");
    return NextResponse.json({ ok: true, confirmados: lote.length });
  }
  const empleadoId = Number(body?.empleadoId);
  const fecha = String(body?.fecha ?? "");
  const decision = body?.decision === "franco" || body?.decision === "falta" ? body.decision : body?.decision === null ? null : undefined;
  if (!empleadoId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || decision === undefined) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  decidirFranco(empleadoId, fecha, decision);
  return NextResponse.json({ ok: true });
}
