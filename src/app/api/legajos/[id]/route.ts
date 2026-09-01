import { NextRequest, NextResponse } from "next/server";
import { getEmpleadoById, listLegajoArchivos, guardarLegajoArchivo } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empleado = getEmpleadoById(Number(id));
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
  const archivos = listLegajoArchivos(empleado.id);
  return NextResponse.json({ empleado, archivos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empleado = getEmpleadoById(Number(id));
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera el límite de 20 MB" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const archivo = guardarLegajoArchivo({
    empleadoId: empleado.id,
    nombreOriginal: file.name || "archivo",
    buffer,
    mimetype: file.type || "application/octet-stream",
    origen: "manual",
    subidoPor: process.env.DASHBOARD_USER ?? null,
  });

  return NextResponse.json(archivo, { status: 201 });
}
