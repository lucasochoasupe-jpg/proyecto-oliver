import { NextRequest, NextResponse } from "next/server";
import { cargarAdelantoDesdeCaja, detectarAdelantosCaja, marcarNoAdelanto } from "@/lib/adelantos-caja";

export const dynamic = "force-dynamic";

// Pagos de "Sueldos" de la planilla de Caja que parecen adelantos (ver
// adelantos-caja.ts), del mes pedido (YYYY-MM).
export async function GET(req: NextRequest) {
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  return NextResponse.json(detectarAdelantosCaja(mes));
}

// { movimientoId, empleadoId } carga el adelanto;
// { movimientoId, noEsAdelanto: true | false } lo descarta o lo vuelve a mostrar.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const movimientoId = Number(body?.movimientoId);
  if (!movimientoId) return NextResponse.json({ error: "Falta el movimiento" }, { status: 400 });

  if (typeof body?.noEsAdelanto === "boolean") {
    marcarNoAdelanto(movimientoId, body.noEsAdelanto);
    return NextResponse.json({ ok: true });
  }

  const empleadoId = Number(body?.empleadoId);
  if (!empleadoId) return NextResponse.json({ error: "Elegí el empleado" }, { status: 400 });
  const r = cargarAdelantoDesdeCaja(movimientoId, empleadoId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
