import { NextRequest, NextResponse } from "next/server";
import { listMarcacionesHuerfanas } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const records = listMarcacionesHuerfanas({ desde, hasta, sucursal, nombres });
  return NextResponse.json({ desde, hasta, records });
}
