import { NextRequest, NextResponse } from "next/server";
import { listPuestos, crearPuesto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listPuestos());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | {
        nombre?: string;
        departamento?: string | null;
        reporta_a?: string | null;
        objetivo?: string | null;
        funciones?: string | null;
        requisitos?: string | null;
        competencias?: string | null;
      }
    | null;

  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre del puesto es requerido" }, { status: 400 });
  }

  try {
    const id = crearPuesto({
      nombre: body.nombre.trim(),
      departamento: body.departamento?.trim() || null,
      reporta_a: body.reporta_a?.trim() || null,
      objetivo: body.objetivo?.trim() || null,
      funciones: body.funciones?.trim() || null,
      requisitos: body.requisitos?.trim() || null,
      competencias: body.competencias?.trim() || null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe un puesto con ese nombre" }, { status: 409 });
  }
}
