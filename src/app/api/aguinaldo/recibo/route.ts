import { NextRequest, NextResponse } from "next/server";
import { calcularAguinaldo, getConfiguracionLiquidacion, getEmpleadoById, rangoSemestre, semestreActual, type Semestre } from "@/lib/db";
import { generarReciboAguinaldoPdf } from "@/lib/recibo-pdf";
import { construirReciboAguinaldo } from "@/lib/recibo-builder";

export const dynamic = "force-dynamic";

function parseSemestre(searchParams: URLSearchParams): Semestre {
  const anio = Number(searchParams.get("anio"));
  const numero = Number(searchParams.get("numero"));
  if (Number.isInteger(anio) && (numero === 1 || numero === 2)) return { anio, numero };
  return semestreActual();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empleadoId = Number(searchParams.get("empleadoId"));
  const semestre = parseSemestre(searchParams);

  if (!Number.isInteger(empleadoId)) {
    return NextResponse.json({ error: "empleadoId inválido" }, { status: 400 });
  }
  const empleado = getEmpleadoById(empleadoId);
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const rango = rangoSemestre(semestre);
  const filas = calcularAguinaldo(semestre, [empleado.nombre]);
  const fila = filas.find((f) => f.empleado_id === empleadoId);
  const config = getConfiguracionLiquidacion();
  const reciboData = fila ? construirReciboAguinaldo(fila, empleado, config, semestre, rango) : null;
  if (!reciboData) {
    return NextResponse.json({ error: "El empleado no tiene un tipo de pago (blanco) configurado" }, { status: 400 });
  }

  const buffer = await generarReciboAguinaldoPdf(reciboData);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="aguinaldo-${empleado.nombre.replace(/\s+/g, "_")}-${semestre.numero}S${semestre.anio}.pdf"`,
    },
  });
}
