import { NextRequest, NextResponse } from "next/server";
import { crearCajaConcepto, listCajaConceptos } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listCajaConceptos());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  try {
    const concepto = crearCajaConcepto(nombre);
    return NextResponse.json(concepto, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe un concepto con ese nombre" }, { status: 409 });
  }
}
