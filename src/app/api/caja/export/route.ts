import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularResumenCaja, listCajaMovimientos } from "@/lib/db";
import {
  zebraFill,
  configurarColumnas,
  estilarHeader,
  aplicarGrilla,
  agregarBranding,
  ajustarAnchoContenido,
  estilarFilaTotal,
} from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const movimientos = listCajaMovimientos({ desde, hasta });
  const resumen = calcularResumenCaja({ desde, hasta });
  const wb = new ExcelJS.Workbook();

  const titulo =
    desde && hasta ? `Caja (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})` : "Caja (histórico completo)";

  // ── Hoja 1: movimientos ────────────────────────────────────────────────
  const wsMov = wb.addWorksheet("Movimientos");
  const columnasMov = [
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Nombre", key: "nombre", width: 22 },
    { header: "Concepto", key: "concepto", width: 20 },
    { header: "Corresponde a", key: "corresponde_a", width: 14 },
    { header: "Importe neto", key: "importe_neto", width: 16 },
    { header: "IVA", key: "iva", width: 14 },
    { header: "Otros conceptos", key: "otros_conceptos", width: 16 },
    { header: "Importe total", key: "importe_total", width: 16 },
    { header: "Movimiento", key: "tipo_movimiento", width: 12 },
    { header: "Cuenta", key: "cuenta", width: 20 },
    { header: "Nota", key: "nota", width: 26 },
  ];
  configurarColumnas(wsMov, columnasMov, 2);
  agregarBranding(wb, wsMov, titulo, columnasMov.length);

  movimientos.forEach((m, i) => {
    const row = wsMov.addRow({
      fecha: formatFechaISO(m.fecha),
      nombre: m.nombre,
      concepto: m.concepto_nombre,
      corresponde_a: m.corresponde_a,
      importe_neto: Number(m.importe_neto.toFixed(2)),
      iva: Number(m.iva.toFixed(2)),
      otros_conceptos: Number(m.otros_conceptos.toFixed(2)),
      importe_total: Number(m.importe_total.toFixed(2)),
      tipo_movimiento: m.tipo_movimiento === "ingreso" ? "Ingreso" : "Salida",
      cuenta: m.cuenta_nombre,
      nota: m.nota ?? "",
    });
    for (const key of ["importe_neto", "iva", "otros_conceptos", "importe_total"]) row.getCell(key).numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });
  ajustarAnchoContenido(wsMov, { desdeFila: 2, max: 60 });
  estilarHeader(wsMov, 2);
  aplicarGrilla(wsMov, 2);

  // ── Hoja 2: saldo por cuenta ─────────────────────────────────────────────
  const wsCuentas = wb.addWorksheet("Saldo por cuenta");
  const columnasCuentas = [
    { header: "Cuenta", key: "cuenta", width: 26 },
    { header: "Total", key: "total", width: 18 },
  ];
  configurarColumnas(wsCuentas, columnasCuentas, 2);
  agregarBranding(wb, wsCuentas, titulo, columnasCuentas.length);
  resumen.porCuenta.forEach((c, i) => {
    const row = wsCuentas.addRow({ cuenta: c.cuenta_nombre, total: Number(c.total.toFixed(2)) });
    row.getCell("total").numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });
  const totalRow = wsCuentas.addRow({ cuenta: "TOTAL GENERAL", total: Number(resumen.totalGeneral.toFixed(2)) });
  totalRow.getCell("total").numFmt = "#,##0.00";
  estilarFilaTotal(totalRow);
  ajustarAnchoContenido(wsCuentas, { desdeFila: 2, max: 60 });
  estilarHeader(wsCuentas, 2);
  aplicarGrilla(wsCuentas, 2);

  // ── Hoja 3: concepto × cuenta ──────────────────────────────────────────
  const wsConceptos = wb.addWorksheet("Concepto x cuenta");
  const columnasConceptos = [
    { header: "Concepto", key: "concepto", width: 22 },
    ...resumen.cuentas.map((c) => ({ header: c.nombre, key: `cuenta_${c.id}`, width: 18 })),
    { header: "Total", key: "total", width: 18 },
  ];
  configurarColumnas(wsConceptos, columnasConceptos, 2);
  agregarBranding(wb, wsConceptos, titulo, columnasConceptos.length);
  resumen.porConcepto.forEach((cn, i) => {
    const valores: Record<string, string | number> = { concepto: cn.concepto_nombre, total: Number(cn.total.toFixed(2)) };
    for (const c of resumen.cuentas) valores[`cuenta_${c.id}`] = Number((cn.porCuenta[c.id] ?? 0).toFixed(2));
    const row = wsConceptos.addRow(valores);
    row.getCell("total").numFmt = "#,##0.00";
    for (const c of resumen.cuentas) row.getCell(`cuenta_${c.id}`).numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });
  ajustarAnchoContenido(wsConceptos, { desdeFila: 2, max: 60 });
  estilarHeader(wsConceptos, 2);
  aplicarGrilla(wsConceptos, 2);

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="caja${desde && hasta ? `-${desde}_a_${hasta}` : ""}.xlsx"`,
    },
  });
}
