import { NextRequest, NextResponse } from "next/server";
import { calcularResumenCaja } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  return NextResponse.json(calcularResumenCaja({ desde, hasta }));
}
