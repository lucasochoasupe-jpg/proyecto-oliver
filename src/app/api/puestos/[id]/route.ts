import { NextRequest, NextResponse } from "next/server";
import { getPuestoById, actualizarPuesto, eliminarPuesto, listEmpleadosPorPuesto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const puesto = getPuestoById(Number(id));
  if (!puesto) return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
  const empleados = listEmpleadosPorPuesto(puesto.id);
  return NextResponse.json({ puesto, empleados });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  actualizarPuesto(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  eliminarPuesto(Number(id));
  return NextResponse.json({ ok: true });
}
