import { NextRequest, NextResponse } from "next/server";
import { calcularLiquidacion, getConfiguracionLiquidacion, getEmpleadoById } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { generarReciboPdf } from "@/lib/recibo-pdf";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Antigüedad en "X años y Y meses" al final del período, como en el recibo real.
function antiguedadTexto(fechaIngreso: string | null, hastaISO: string): string {
  if (!fechaIngreso) return "—";
  const ingreso = new Date(`${fechaIngreso}T00:00:00Z`);
  const hasta = new Date(`${hastaISO}T00:00:00Z`);
  let meses = (hasta.getUTCFullYear() - ingreso.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - ingreso.getUTCMonth());
  if (hasta.getUTCDate() < ingreso.getUTCDate()) meses -= 1;
  if (meses < 0) meses = 0;
  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  return `${anios} año${anios === 1 ? "" : "s"} y ${mesesRestantes} mes${mesesRestantes === 1 ? "" : "es"}`;
}

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
  if (!fila || fila.tipo_pago === null || !fila.legal) {
    return NextResponse.json({ error: "El empleado no tiene un tipo de pago (blanco) configurado" }, { status: 400 });
  }

  const config = getConfiguracionLiquidacion();
  const sueldoONormal =
    fila.tipo_pago === "mensual" ? fila.sueldo_mensual ?? 0 : fila.tipo_pago === "hora" ? fila.valor_hora ?? 0 : fila.valor_dia ?? 0;

  const buffer = await generarReciboPdf({
    empresa: {
      razon_social: config.empresa_razon_social,
      domicilio: config.empresa_domicilio,
      cuit: config.empresa_cuit,
      obra_social_codigo: config.obra_social_codigo,
      obra_social_nombre: config.obra_social_nombre,
    },
    empleado: {
      nombre: empleado.nombre,
      legajo: empleado.legajo,
      cuil: empleado.cuil,
      categoria_laboral: empleado.categoria_laboral,
      banco: empleado.banco ?? config.banco_default,
      fecha_ingreso: empleado.fecha_ingreso,
      antiguedad: antiguedadTexto(empleado.fecha_ingreso, hasta),
    },
    desde: formatFechaISO(desde),
    hasta: formatFechaISO(hasta),
    tipo_pago: fila.tipo_pago,
    sueldo_o_jornal: sueldoONormal,
    legal: fila.legal,
    adelantos: fila.adelantos,
    total_a_depositar: fila.total_blanco,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${empleado.nombre.replace(/\s+/g, "_")}-${desde}_a_${hasta}.pdf"`,
    },
  });
}
