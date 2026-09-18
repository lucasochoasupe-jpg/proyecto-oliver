import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularAguinaldo, rangoSemestre, semestreActual, type Semestre } from "@/lib/db";
import { zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, agregarBranding, ajustarAnchoContenido } from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function parseSemestre(searchParams: URLSearchParams): Semestre {
  const anio = Number(searchParams.get("anio"));
  const numero = Number(searchParams.get("numero"));
  if (Number.isInteger(anio) && (numero === 1 || numero === 2)) return { anio, numero };
  return semestreActual();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;
  const semestre = parseSemestre(searchParams);

  const filas = calcularAguinaldo(semestre, nombres);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aguinaldo");

  const columnas = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Mejor remuneración (blanco)", key: "mejor_remuneracion", width: 22 },
    { header: "Mes de referencia", key: "mes_referencia", width: 16 },
    { header: "Meses computados", key: "meses_computados", width: 16 },
    { header: "S.A.C. bruto (blanco)", key: "aguinaldo_blanco", width: 18 },
    { header: "Aporte jubilación", key: "aporte_jubilacion", width: 16 },
    { header: "Aporte ley 19032", key: "aporte_ley19032", width: 16 },
    { header: "Aporte obra social", key: "aporte_obra_social", width: 16 },
    { header: "Aporte sindical", key: "aporte_sindical", width: 16 },
    { header: "Costo empleador total", key: "costo_empleador_total", width: 18 },
    { header: "Neto blanco", key: "neto_blanco", width: 16 },
    { header: "Mejor remuneración (informal)", key: "mejor_remuneracion_informal", width: 24 },
    { header: "S.A.C. informal (estimado)", key: "aguinaldo_informal", width: 20 },
    { header: "Total neto", key: "total_neto", width: 16 },
    { header: "Alertas", key: "advertencias", width: 30 },
  ];
  configurarColumnas(ws, columnas, 2);
  agregarBranding(wb, ws, `Aguinaldo — ${semestre.numero}° Semestre ${semestre.anio}`, columnas.length);

  filas.forEach((f, i) => {
    const row = ws.addRow({
      nombre: f.nombre,
      mejor_remuneracion: f.blanco ? Number(f.blanco.mejor_remuneracion.toFixed(2)) : "",
      mes_referencia: f.blanco?.mes_mejor_remuneracion ?? "",
      meses_computados: f.blanco?.meses_computados ?? f.informal?.meses_computados ?? "",
      aguinaldo_blanco: Number(f.aguinaldo_blanco.toFixed(2)),
      aporte_jubilacion: f.legal ? Number(f.legal.aporte_jubilacion.toFixed(2)) : "",
      aporte_ley19032: f.legal ? Number(f.legal.aporte_ley19032.toFixed(2)) : "",
      aporte_obra_social: f.legal ? Number(f.legal.aporte_obra_social.toFixed(2)) : "",
      aporte_sindical: f.legal ? Number(f.legal.aporte_sindical.toFixed(2)) : "",
      costo_empleador_total: f.legal ? Number(f.legal.costo_empleador_total.toFixed(2)) : "",
      neto_blanco: Number(f.neto_blanco.toFixed(2)),
      mejor_remuneracion_informal: f.informal ? Number(f.informal.mejor_remuneracion.toFixed(2)) : "",
      aguinaldo_informal: f.informal ? Number(f.aguinaldo_informal.toFixed(2)) : "",
      total_neto: Number(f.total_neto.toFixed(2)),
      advertencias: f.advertencias.join(" · "),
    });
    for (const key of [
      "mejor_remuneracion",
      "aguinaldo_blanco",
      "aporte_jubilacion",
      "aporte_ley19032",
      "aporte_obra_social",
      "aporte_sindical",
      "costo_empleador_total",
      "neto_blanco",
      "mejor_remuneracion_informal",
      "aguinaldo_informal",
      "total_neto",
    ])
      row.getCell(key).numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });

  ajustarAnchoContenido(ws, { desdeFila: 2, max: 60 });
  estilarHeader(ws, 2);
  aplicarGrilla(ws, 2);

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aguinaldo-${semestre.numero}S${semestre.anio}.xlsx"`,
    },
  });
}
