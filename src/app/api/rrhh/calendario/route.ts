import { NextRequest, NextResponse } from "next/server";
import { eventosCalendario } from "@/lib/rrhh-registros";

export const dynamic = "force-dynamic";

// Días de falta de un mes (?mes=YYYY-MM): pedidos/avisos con fechas y faltas
// a turnos sin aviso.
export async function GET(req: NextRequest) {
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    return NextResponse.json({ error: "Mes inválido (formato YYYY-MM)" }, { status: 400 });
  }
  const anio = Number(m[1]);
  const numMes = Number(m[2]);
  if (numMes < 1 || numMes > 12) {
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  }
  const ultimoDia = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const desde = `${mes}-01`;
  const hasta = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  try {
    return NextResponse.json({ desde, hasta, eventos: eventosCalendario(desde, hasta) });
  } catch (err) {
    console.error("[api/rrhh/calendario]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
