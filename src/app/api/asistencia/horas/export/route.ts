import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularHorasTrabajadas } from "@/lib/db";
import { AR_TZ, hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { COLOR, fill, zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, agregarBranding, ajustarAnchoContenido } from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;
  const estado = searchParams.get("estado") ?? "todos"; // todos | terminados | encurso

  const todosLosTurnos = calcularHorasTrabajadas({ desde, hasta, sucursal, nombres });
  const turnos =
    estado === "terminados" ? todosLosTurnos.filter((t) => t.horas !== null)
    : estado === "encurso" ? todosLosTurnos.filter((t) => t.horas === null)
    : todosLosTurnos;

  interface ResumenEmpleado {
    nombre: string;
    totalHoras: number;
    enCurso: boolean;
  }
  const porEmpleado = new Map<string, ResumenEmpleado>();
  for (const t of turnos) {
    let e = porEmpleado.get(t.nombre);
    if (!e) {
      e = { nombre: t.nombre, totalHoras: 0, enCurso: false };
      porEmpleado.set(t.nombre, e);
    }
    if (t.horas !== null) {
      e.totalHoras += t.horas;
    } else {
      e.enCurso = true;
    }
  }
  const resumen = Array.from(porEmpleado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const wb = new ExcelJS.Workbook();

  // ── Hoja Resumen ──
  const wsResumen = wb.addWorksheet("Resumen");
  const columnasResumen = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Total horas", key: "totalHoras", width: 14 },
    { header: "En curso", key: "enCurso", width: 12 },
  ];
  configurarColumnas(wsResumen, columnasResumen, 2);
  agregarBranding(wb, wsResumen, `Horas trabajadas — Resumen (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})`, columnasResumen.length);
  resumen.forEach((e, i) => {
    const row = wsResumen.addRow({
      nombre: e.nombre,
      totalHoras: Number(e.totalHoras.toFixed(2)),
      enCurso: e.enCurso ? "Sí" : "",
    });
    row.getCell("totalHoras").numFmt = "0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = e.enCurso ? fill(COLOR.pendiente) : zebraFill(i);
    });
  });
  ajustarAnchoContenido(wsResumen, { desdeFila: 2 });
  estilarHeader(wsResumen, 2);
  aplicarGrilla(wsResumen, 2);

  // ── Hoja Detalle (un turno por fila) ──
  const wsDetalle = wb.addWorksheet("Detalle");
  const columnasDetalle = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Sucursal", key: "sucursal_nombre", width: 16 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Entrada", key: "entrada", width: 10 },
    { header: "Salida", key: "salida", width: 10 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  configurarColumnas(wsDetalle, columnasDetalle, 2);
  agregarBranding(wb, wsDetalle, `Horas trabajadas — Detalle (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})`, columnasDetalle.length);
  turnos.forEach((t, i) => {
    const d = new Date(t.entrada_at * 1000);
    const fecha = d.toLocaleDateString("es-AR", { timeZone: AR_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
    const entrada = d.toLocaleTimeString("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
    const salida = t.salida_at
      ? new Date(t.salida_at * 1000).toLocaleTimeString("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hour12: false })
      : "En curso";
    const row = wsDetalle.addRow({
      nombre: t.nombre,
      sucursal_nombre: t.sucursal_nombre,
      fecha,
      entrada,
      salida,
      horas: t.horas !== null ? Number(t.horas.toFixed(2)) : "",
    });
    if (t.horas !== null) row.getCell("horas").numFmt = "0.00";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = t.horas === null ? fill(COLOR.pendiente) : zebraFill(i);
    });
  });
  ajustarAnchoContenido(wsDetalle, { desdeFila: 2 });
  estilarHeader(wsDetalle, 2);
  aplicarGrilla(wsDetalle, 2);

  const buffer = await wb.xlsx.writeBuffer();
  const rango = `${desde}_a_${hasta}`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="horas-trabajadas-${rango}.xlsx"`,
    },
  });
}
