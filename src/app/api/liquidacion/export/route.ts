import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularLiquidacion } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filas = calcularLiquidacion({ desde, hasta, nombres });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación");

  ws.columns = [
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

  const HEADER_COLOR = "2C1810";
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_COLOR}` } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  for (const f of filas) {
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
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liquidacion-${desde}_a_${hasta}.xlsx"`,
    },
  });
}
