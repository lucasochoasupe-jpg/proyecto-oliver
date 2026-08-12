import { NextRequest, NextResponse } from "next/server";
import { listAsistencia, deleteAsistenciaMany, insertAsistenciaManual } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const tipo = searchParams.get("tipo") ?? undefined;
  const fecha = searchParams.get("fecha") ?? undefined;
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const records = listAsistencia({ sucursal, tipo, fecha, desde, hasta, nombres });

  const hoy = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const todayISO = new Date().toLocaleDateString("sv", { timeZone: "America/Argentina/Buenos_Aires" });
  const hoyRecords = listAsistencia({ fecha: todayISO });

  const porSucursal: Record<string, { entrada: number; salida: number }> = {};
  for (const r of hoyRecords) {
    if (!porSucursal[r.sucursal_nombre]) porSucursal[r.sucursal_nombre] = { entrada: 0, salida: 0 };
    porSucursal[r.sucursal_nombre][r.tipo]++;
  }

  return NextResponse.json({
    records,
    resumen: {
      total: records.length,
      hoy: hoyRecords.length,
      fechaHoy: hoy,
      porSucursal,
    },
  });
}

// Convierte "YYYY-MM-DDTHH:mm" (interpretado como hora de Argentina, UTC-3 fijo,
// venga de la zona que venga el navegador) a unixepoch en UTC.
function arDateTimeLocalToUnix(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  return Math.floor(utcMs / 1000) + 3 * 3600;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { empleadoId?: number; sucursalId?: number; tipo?: "entrada" | "salida"; fechaHora?: string }
    | null;

  const empleadoId = Number(body?.empleadoId);
  const sucursalId = Number(body?.sucursalId);
  const tipo = body?.tipo;

  if (!empleadoId || !sucursalId || (tipo !== "entrada" && tipo !== "salida")) {
    return NextResponse.json({ error: "empleadoId, sucursalId y tipo son requeridos" }, { status: 400 });
  }

  let createdAt: number | undefined;
  if (body?.fechaHora) {
    const parsed = arDateTimeLocalToUnix(body.fechaHora);
    if (parsed === null) {
      return NextResponse.json({ error: "fechaHora inválida" }, { status: 400 });
    }
    createdAt = parsed;
  }

  try {
    insertAsistenciaManual(empleadoId, sucursalId, tipo, createdAt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al registrar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => !Number.isNaN(n)) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No se recibieron IDs válidos." }, { status: 400 });
  }

  deleteAsistenciaMany(ids);
  return NextResponse.json({ ok: true, deleted: ids.length });
}
