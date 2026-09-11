import { NextRequest, NextResponse } from "next/server";
import { updateEmpleado, deleteEmpleado } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    nombre?: string;
    celular?: string | null;
    activo?: number;
    tipo_pago?: "mensual" | "hora" | "dia" | null;
    sueldo_mensual?: number | null;
    valor_hora?: number | null;
    valor_dia?: number | null;
    fecha_ingreso?: string | null;
    sueldo_estimado?: number | null;
  };
  updateEmpleado(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteEmpleado(Number(id));
  return NextResponse.json({ ok: true });
}
