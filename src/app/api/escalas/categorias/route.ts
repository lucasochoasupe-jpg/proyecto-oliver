import { NextRequest, NextResponse } from "next/server";
import { crearCategoriaConvenio, listCategoriasConvenio } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listCategoriasConvenio());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { convenio_id?: number; nombre?: string } | null;
  const nombre = body?.nombre?.trim();
  if (!body?.convenio_id || !nombre) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  try {
    return NextResponse.json({ id: crearCategoriaConvenio(Number(body.convenio_id), nombre) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
  }
}
