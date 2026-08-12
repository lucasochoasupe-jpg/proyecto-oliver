import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listAsistencia } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const tipo = searchParams.get("tipo") ?? undefined;
  const fecha = searchParams.get("fecha") ?? undefined;
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const records = listAsistencia({ sucursal, tipo, fecha, desde, hasta, nombres });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Asistencia");

  ws.columns = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Teléfono", key: "phone", width: 18 },
    { header: "Sucursal", key: "sucursal_nombre", width: 16 },
    { header: "Tipo", key: "tipo", width: 10 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Hora", key: "hora", width: 10 },
  ];

  const HEADER_COLOR = "2C1810";
  const ENTRADA_COLOR = "D1FAE5";
  const SALIDA_COLOR = "DBEAFE";

  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_COLOR}` } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  for (const r of records) {
    const d = new Date(r.created_at * 1000);
    const fecha = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
    const hora = d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
    const row = ws.addRow({
      nombre: r.nombre ?? r.phone,
      phone: r.celular ?? "",
      sucursal_nombre: r.sucursal_nombre,
      tipo: r.tipo === "entrada" ? "Entrada" : "Salida",
      fecha,
      hora,
    });
    const bgColor = r.tipo === "entrada" ? ENTRADA_COLOR : SALIDA_COLOR;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
      cell.alignment = { vertical: "middle" };
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const fechaHoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }).replace(/\//g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="asistencia-${fechaHoy}.xlsx"`,
    },
  });
}
