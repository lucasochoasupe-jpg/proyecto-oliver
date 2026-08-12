import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularHorasTrabajadas } from "@/lib/db";

export const dynamic = "force-dynamic";

const AR_TZ = "America/Argentina/Buenos_Aires";

function hoyISO() {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

function inicioDeMesISO() {
  const hoy = hoyISO();
  return `${hoy.slice(0, 7)}-01`;
}

const HEADER_COLOR = "2C1810";
const EN_CURSO_COLOR = "FEF3C7";

function estilarHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_COLOR}` } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
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
  wsResumen.columns = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Total horas", key: "totalHoras", width: 14 },
    { header: "En curso", key: "enCurso", width: 12 },
  ];
  for (const e of resumen) {
    const row = wsResumen.addRow({
      nombre: e.nombre,
      totalHoras: Number(e.totalHoras.toFixed(2)),
      enCurso: e.enCurso ? "Sí" : "",
    });
    row.getCell("totalHoras").numFmt = "0.00";
    if (e.enCurso) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EN_CURSO_COLOR}` } };
      });
    }
    row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; });
  }
  estilarHeader(wsResumen);

  // ── Hoja Detalle (un turno por fila) ──
  const wsDetalle = wb.addWorksheet("Detalle");
  wsDetalle.columns = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Sucursal", key: "sucursal_nombre", width: 16 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Entrada", key: "entrada", width: 10 },
    { header: "Salida", key: "salida", width: 10 },
    { header: "Horas", key: "horas", width: 12 },
  ];
  for (const t of turnos) {
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
    if (t.horas === null) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EN_CURSO_COLOR}` } };
      });
    }
    row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; });
  }
  estilarHeader(wsDetalle);

  const buffer = await wb.xlsx.writeBuffer();
  const rango = `${desde}_a_${hasta}`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="horas-trabajadas-${rango}.xlsx"`,
    },
  });
}
