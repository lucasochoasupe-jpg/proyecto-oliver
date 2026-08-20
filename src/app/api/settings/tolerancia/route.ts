import { NextRequest, NextResponse } from "next/server";
import { getTolerancia, setTolerancia } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tolerancia_min: getTolerancia() });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { tolerancia_min?: number };
  const min = Number(body.tolerancia_min);
  if (!Number.isFinite(min) || min < 0) {
    return NextResponse.json({ error: "tolerancia_min inválida" }, { status: 400 });
  }
  setTolerancia(Math.round(min));
  return NextResponse.json({ ok: true });
}
