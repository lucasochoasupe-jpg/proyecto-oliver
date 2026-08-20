import { NextRequest, NextResponse } from "next/server";
import { calcularCumplimiento } from "@/lib/db";

export const dynamic = "force-dynamic";

const AR_TZ = "America/Argentina/Buenos_Aires";

function hoyISO() {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

function inicioDeMesISO() {
  const hoy = hoyISO();
  return `${hoy.slice(0, 7)}-01`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filas = calcularCumplimiento({ desde, hasta, sucursal, nombres });
  return NextResponse.json({ desde, hasta, filas });
}
