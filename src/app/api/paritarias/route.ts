import { NextRequest, NextResponse } from "next/server";
import { listParitariasPendientes, marcarParitaria } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listParitariasPendientes());
}

// Marcar a mano una paritaria pendiente como cargada o descartada.
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { url?: string; estado?: string } | null;
  if (!body?.url || (body.estado !== "cargada" && body.estado !== "descartada")) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  marcarParitaria(body.url, body.estado);
  return NextResponse.json({ ok: true });
}
