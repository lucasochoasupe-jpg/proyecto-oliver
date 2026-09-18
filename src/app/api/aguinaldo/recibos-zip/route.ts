import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { calcularAguinaldo, getConfiguracionLiquidacion, listEmpleados, rangoSemestre, semestreActual, type Semestre } from "@/lib/db";
import { generarComprobanteAguinaldoInformalPdf, generarReciboAguinaldoPdf } from "@/lib/recibo-pdf";
import { construirComprobanteAguinaldoInformal, construirReciboAguinaldo } from "@/lib/recibo-builder";

export const dynamic = "force-dynamic";

function parseSemestre(searchParams: URLSearchParams): Semestre {
  const anio = Number(searchParams.get("anio"));
  const numero = Number(searchParams.get("numero"));
  if (Number.isInteger(anio) && (numero === 1 || numero === 2)) return { anio, numero };
  return semestreActual();
}

function nombreArchivo(nombre: string): string {
  return nombre.replace(/\s+/g, "_");
}

// Igual que /api/liquidacion/recibos-zip pero para el aguinaldo: un .zip con
// el recibo de SAC (PDF) de cada empleado del semestre — y, cuando
// corresponde, el comprobante interno de la parte informal aparte.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;
  const semestre = parseSemestre(searchParams);
  const rango = rangoSemestre(semestre);

  const filas = calcularAguinaldo(semestre, nombres);
  const config = getConfiguracionLiquidacion();
  const empleadosPorId = new Map(listEmpleados().map((e) => [e.id, e]));

  const zip = new JSZip();
  let generados = 0;

  for (const fila of filas) {
    const empleado = empleadosPorId.get(fila.empleado_id);
    if (!empleado) continue;

    const reciboData = construirReciboAguinaldo(fila, empleado, config, semestre, rango);
    if (reciboData) {
      const buffer = await generarReciboAguinaldoPdf(reciboData);
      zip.file(`aguinaldo-${nombreArchivo(empleado.nombre)}.pdf`, buffer);
      generados++;
    }

    const informalData = construirComprobanteAguinaldoInformal(fila, empleado, config, semestre, rango);
    if (informalData) {
      const buffer = await generarComprobanteAguinaldoInformalPdf(informalData);
      zip.file(`informal (no legal)/aguinaldo-informal-${nombreArchivo(empleado.nombre)}.pdf`, buffer);
    }
  }

  if (generados === 0) {
    return NextResponse.json(
      { error: "Ningún empleado del semestre tiene un tipo de pago (blanco) configurado" },
      { status: 400 }
    );
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aguinaldos-${semestre.numero}S${semestre.anio}.zip"`,
    },
  });
}
