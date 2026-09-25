import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { COLOR, fill, zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, estilarFilaTotal, agregarBranding, ajustarAnchoContenido } from "@/lib/excel-style";
import { listarRegistrosRRHH } from "@/lib/rrhh-registros";
import { estadoTexto, filtrarRegistros, paramsAFiltros, rangoTexto } from "@/lib/rrhh-shared";

export const dynamic = "force-dynamic";

// Mismos registros y mismos filtros que el panel (ver rrhh-shared.ts) — el
// Excel sale igual a lo que se está viendo en pantalla.
export async function GET(req: NextRequest) {
  const ausencias = filtrarRegistros(listarRegistrosRRHH(), paramsAFiltros(req.nextUrl.searchParams));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sanca RRHH";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Ausentismo");

  // Columnas con anchos fijos
  const columnas = [
    { header: "Empleado",              key: "nombre",               width: 26 },
    { header: "Sucursal",              key: "sucursal",             width: 16 },
    { header: "Tipo",                  key: "tipo",                 width: 18 },
    { header: "Motivo",                key: "motivo",               width: 30 },
    { header: "Días de ausencia",      key: "rango",                width: 24 },
    { header: "Estado",                key: "estado",               width: 16 },
    { header: "Fecha aviso",           key: "fecha",                width: 14 },
    { header: "Hora",                  key: "hora",                 width: 10 },
    { header: "Certificado",           key: "cert",                 width: 16 },
    { header: "Detalle",               key: "detalle",              width: 50 },
    { header: "Contacto",              key: "contacto",             width: 36 },
  ];
  configurarColumnas(ws, columnas, 2);
  agregarBranding(workbook, ws, "RRHH — Ausentismo", columnas.length);

  // Filas de datos
  ausencias.forEach((a, i) => {
    const d = new Date(a.fecha * 1000);
    const fechaStr = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
    const horaStr = d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
    const row = ws.addRow({
      nombre:   a.nombre,
      sucursal: a.sucursal,
      tipo:     a.tipo,
      motivo:   a.motivo,
      rango:    rangoTexto(a) ?? "—",
      estado:   a.estado ? estadoTexto(a.estado, a.goceSueldo) : "—",
      fecha:    fechaStr,
      hora:     horaStr,
      cert:     a.certificadoPendiente ? "⚠ Pendiente" : a.certificadoRecibidoEn ? "Recibido" : "—",
      detalle:  a.detalle,
      contacto: a.contacto,
    });

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = zebraFill(i);
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.font = { size: 10 };
    });

    // Resaltar cert pendiente
    const certCell = row.getCell("cert");
    if (a.certificadoPendiente) {
      certCell.font = { bold: true, color: { argb: `FF${COLOR.pendienteTexto}` }, size: 10 };
      certCell.fill = fill(COLOR.pendiente);
    }

    row.height = 18;
  });

  ajustarAnchoContenido(ws, { desdeFila: 2, max: 60 });
  estilarHeader(ws, 2);
  aplicarGrilla(ws, 2);

  // Fila de resumen al final
  ws.addRow({});
  const totalRow = ws.addRow({ nombre: `Total: ${ausencias.length} registros`, cert: `Cert. pendientes: ${ausencias.filter((a) => a.certificadoPendiente).length}` });
  estilarFilaTotal(totalRow);
  totalRow.getCell("cert").font = { bold: true, italic: true, color: { argb: `FF${COLOR.pendienteTexto}` }, size: 10 };

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rrhh-ausencias-${today}.xlsx"`,
    },
  });
}
