import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { calcularLiquidacion, getConfiguracionLiquidacion, listEmpleados } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { generarComprobanteInformalPdf, generarReciboPdf } from "@/lib/recibo-pdf";
import { construirComprobanteInformal, construirReciboBlanco } from "@/lib/recibo-builder";

export const dynamic = "force-dynamic";

function nombreArchivo(nombre: string): string {
  return nombre.replace(/\s+/g, "_");
}

// Exporta, en un único .zip, el recibo (PDF) de la parte blanca de cada
// empleado del período — y, cuando corresponde, el comprobante interno de
// la parte informal en una subcarpeta aparte, claramente separada porque no
// es un documento legal. Pensado para armar de una vez la tanda mensual de
// recibos en lugar de bajarlos uno por uno.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filas = calcularLiquidacion({ desde, hasta, nombres });
  const config = getConfiguracionLiquidacion();
  const empleadosPorId = new Map(listEmpleados().map((e) => [e.id, e]));

  const zip = new JSZip();
  let generados = 0;

  for (const fila of filas) {
    const empleado = empleadosPorId.get(fila.empleado_id);
    if (!empleado) continue;

    const reciboData = construirReciboBlanco(fila, empleado, config, desde, hasta);
    if (reciboData) {
      const buffer = await generarReciboPdf(reciboData);
      zip.file(`recibo-${nombreArchivo(empleado.nombre)}.pdf`, buffer);
      generados++;
    }

    const informalData = construirComprobanteInformal(fila, empleado, config, desde, hasta);
    if (informalData) {
      const buffer = await generarComprobanteInformalPdf(informalData);
      zip.file(`informal (no legal)/comprobante-informal-${nombreArchivo(empleado.nombre)}.pdf`, buffer);
    }
  }

  if (generados === 0) {
    return NextResponse.json(
      { error: "Ningún empleado del período tiene un tipo de pago (blanco) configurado" },
      { status: 400 }
    );
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="recibos-${desde}_a_${hasta}.zip"`,
    },
  });
}
