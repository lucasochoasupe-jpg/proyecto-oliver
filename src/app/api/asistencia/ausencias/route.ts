import { NextRequest, NextResponse } from "next/server";
import { calcularAusencias } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filas = calcularAusencias({ desde, hasta, nombres });
  return NextResponse.json({ desde, hasta, filas });
}
