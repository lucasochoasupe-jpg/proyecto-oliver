import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularLiquidacion } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, agregarBranding } from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filas = calcularLiquidacion({ desde, hasta, nombres });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación");

  const columnas = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Tipo de pago", key: "tipo_pago", width: 14 },
    { header: "Base", key: "base", width: 14 },
    { header: "Horas trabajadas", key: "horas_trabajadas", width: 16 },
    { header: "Horas pactadas", key: "horas_pactadas", width: 16 },
    { header: "Minutos perdidos", key: "minutos_perdidos", width: 16 },
    { header: "Descuento tardanza", key: "descuento_tardanza", width: 18 },
    { header: "Días ausencia (sin aviso)", key: "dias_ausencia", width: 20 },
    { header: "Descuento ausencias", key: "descuento_ausencia", width: 18 },
    { header: "Días ausencia justificada", key: "dias_ausencia_justificada", width: 22 },
    { header: "Días trabajados (jornal)", key: "dias_trabajados", width: 20 },
    { header: "Horas extra", key: "horas_extra", width: 14 },
    { header: "Según horas trabajadas", key: "total_por_horas", width: 20 },
    { header: "Adelantos", key: "adelantos", width: 16 },
    { header: "Total", key: "total", width: 16 },
    { header: "Alertas", key: "advertencias", width: 30 },
  ];
  configurarColumnas(ws, columnas, 2);
  agregarBranding(wb, ws, `Liquidación de sueldos (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})`, columnas.length);

  filas.forEach((f, i) => {
    const row = ws.addRow({
      nombre: f.nombre,
      tipo_pago:
        f.tipo_pago === "mensual" ? "Mensual" : f.tipo_pago === "hora" ? "Por hora" : f.tipo_pago === "dia" ? "Por día" : "Sin definir",
      base:
        f.tipo_pago === "mensual"
          ? f.sueldo_mensual ?? ""
          : f.tipo_pago === "hora"
          ? f.valor_hora ?? ""
          : f.tipo_pago === "dia"
          ? f.valor_dia ?? ""
          : "",
      horas_trabajadas: f.horas_trabajadas !== null ? Number(f.horas_trabajadas.toFixed(2)) : "",
      horas_pactadas: f.horas_pactadas !== null ? Number(f.horas_pactadas.toFixed(2)) : "",
      minutos_perdidos: f.tipo_pago === "mensual" ? f.minutos_perdidos : "",
      descuento_tardanza: f.tipo_pago === "mensual" ? Number(f.descuento_tardanza.toFixed(2)) : "",
      dias_ausencia: f.tipo_pago === "mensual" || f.tipo_pago === "dia" ? f.dias_ausencia : "",
      descuento_ausencia: f.tipo_pago === "mensual" ? Number(f.descuento_ausencia.toFixed(2)) : "",
      dias_ausencia_justificada: f.tipo_pago === "mensual" || f.tipo_pago === "dia" ? f.dias_ausencia_justificada : "",
      dias_trabajados: f.dias_trabajados ?? "",
      horas_extra: f.horas_extra !== null ? Number(f.horas_extra.toFixed(2)) : "",
      total_por_horas: f.total_por_horas !== null ? Number(f.total_por_horas.toFixed(2)) : "",
      adelantos: f.adelantos > 0 ? Number(f.adelantos.toFixed(2)) : "",
      total: Number(f.total.toFixed(2)),
      advertencias: f.advertencias.join(" · "),
    });
    for (const key of ["horas_trabajadas", "horas_pactadas", "horas_extra"]) row.getCell(key).numFmt = "0.00";
    for (const key of ["base", "descuento_tardanza", "descuento_ausencia", "total_por_horas", "adelantos", "total"]) row.getCell(key).numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });

  estilarHeader(ws, 2);
  aplicarGrilla(ws, 2);

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liquidacion-${desde}_a_${hasta}.xlsx"`,
    },
  });
}
