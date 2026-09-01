import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { getLegajoArchivo, rutaLegajoArchivo, eliminarLegajoArchivo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
  const { id, archivoId } = await params;
  const archivo = getLegajoArchivo(Number(archivoId));
  if (!archivo || archivo.empleado_id !== Number(id)) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  const ruta = rutaLegajoArchivo(archivo);
  if (!fs.existsSync(ruta)) {
    return NextResponse.json({ error: "El archivo ya no está disponible en el servidor" }, { status: 410 });
  }

  const buffer = fs.readFileSync(ruta);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": archivo.mimetype,
      "Content-Disposition": `inline; filename="${encodeURIComponent(archivo.nombre_original)}"`,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
  const { id, archivoId } = await params;
  const archivo = getLegajoArchivo(Number(archivoId));
  if (!archivo || archivo.empleado_id !== Number(id)) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  eliminarLegajoArchivo(archivo.id);
  return NextResponse.json({ ok: true });
}
