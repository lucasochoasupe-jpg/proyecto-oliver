import { NextRequest, NextResponse } from "next/server";
import { getConfiguracionLiquidacion, updateConfiguracionLiquidacion, ConfiguracionLiquidacion } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getConfiguracionLiquidacion());
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Partial<ConfiguracionLiquidacion>;
  updateConfiguracionLiquidacion(body);
  return NextResponse.json({ ok: true });
}
