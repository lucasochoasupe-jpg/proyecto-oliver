import { NextRequest, NextResponse } from "next/server";
import { calcularLiquidacion, getConfiguracionLiquidacion, getEmpleadoById } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { generarReciboPdf } from "@/lib/recibo-pdf";
import { construirReciboBlanco } from "@/lib/recibo-builder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empleadoId = Number(searchParams.get("empleadoId"));
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();

  if (!Number.isInteger(empleadoId)) {
    return NextResponse.json({ error: "empleadoId inválido" }, { status: 400 });
  }
  const empleado = getEmpleadoById(empleadoId);
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const filas = calcularLiquidacion({ desde, hasta, nombres: [empleado.nombre] });
  const fila = filas.find((f) => f.empleado_id === empleadoId);
  const config = getConfiguracionLiquidacion();
  const reciboData = fila ? construirReciboBlanco(fila, empleado, config, desde, hasta) : null;
  if (!reciboData) {
    return NextResponse.json({ error: "El empleado no tiene un tipo de pago (blanco) configurado" }, { status: 400 });
  }

  const buffer = await generarReciboPdf(reciboData);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${empleado.nombre.replace(/\s+/g, "_")}-${desde}_a_${hasta}.pdf"`,
    },
  });
}
