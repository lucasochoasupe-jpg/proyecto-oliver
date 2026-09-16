import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calcularCumplimiento, calcularAusencias, listMarcacionesHuerfanas, type CumplimientoRow } from "@/lib/db";
import { AR_TZ, hoyISO, inicioDeMesISO } from "@/lib/date-ar";
import { COLOR, fill, zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, agregarBranding } from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatHora(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

const ESTADO_LABEL: Record<CumplimientoRow["estado"], string> = {
  a_horario: "A horario",
  tarde: "Tarde",
  salida_anticipada: "Salida anticipada",
  tarde_y_anticipada: "Tarde y salida anticipada",
  sin_horario: "Sin horario definido",
};

function colorTurno(estado: CumplimientoRow["estado"], enCurso: boolean): string {
  if (enCurso) return COLOR.pendiente;
  if (estado === "a_horario") return COLOR.aHorario;
  if (estado === "sin_horario") return COLOR.sinHorario;
  return COLOR.tarde;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;

  const filters = { desde, hasta, sucursal, nombres };
  const cumplimiento = calcularCumplimiento(filters);
  const ausencias = calcularAusencias(filters).filter((a) => !sucursal || a.sucursal_nombre === sucursal);
  const huerfanas = listMarcacionesHuerfanas(filters);

  // ── Resumen por empleado ────────────────────────────────────────────────
  interface ResumenEmpleado {
    nombre: string;
    horas: number;
    tardanzas: number;
    salidasAnticipadas: number;
    ausenciasJustificadas: number;
    ausenciasInjustificadas: number;
    sinPar: number;
  }
  const porEmpleado = new Map<string, ResumenEmpleado>();
  function empleado(nombre: string): ResumenEmpleado {
    let e = porEmpleado.get(nombre);
    if (!e) {
      e = { nombre, horas: 0, tardanzas: 0, salidasAnticipadas: 0, ausenciasJustificadas: 0, ausenciasInjustificadas: 0, sinPar: 0 };
      porEmpleado.set(nombre, e);
    }
    return e;
  }
  for (const c of cumplimiento) {
    const e = empleado(c.nombre);
    if (c.salida_real !== null) e.horas += (c.salida_real - c.entrada_real) / 3600;
    if (c.estado === "tarde" || c.estado === "tarde_y_anticipada") e.tardanzas++;
    if (c.estado === "salida_anticipada" || c.estado === "tarde_y_anticipada") e.salidasAnticipadas++;
  }
  for (const a of ausencias) {
    const e = empleado(a.empleado_nombre);
    if (a.justificada) e.ausenciasJustificadas++;
    else e.ausenciasInjustificadas++;
  }
  for (const h of huerfanas) {
    const e = empleado(h.nombre ?? h.phone);
    e.sinPar++;
  }
  const resumen = Array.from(porEmpleado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // ── Filas de detalle unificadas (turnos + ausencias + huérfanas) ────────
  interface FilaDetalle {
    nombre: string;
    sucursal: string | null;
    fecha: string;
    orden: number; // unix sec para ordenar dentro del mismo día
    tipo: "Asistencia" | "Inasistencia" | "Sin par";
    entradaReal: string;
    entradaEsperada: string;
    diffEntrada: number | null;
    salidaReal: string;
    salidaEsperada: string;
    diffSalida: number | null;
    horas: number | null;
    estado: string;
    color: string;
  }
  const filas: FilaDetalle[] = [];
  for (const c of cumplimiento) {
    filas.push({
      nombre: c.nombre,
      sucursal: c.sucursal_nombre,
      fecha: c.fecha,
      orden: c.entrada_real,
      tipo: "Asistencia",
      entradaReal: formatHora(c.entrada_real),
      entradaEsperada: c.entrada_esperada ?? "",
      diffEntrada: c.diff_entrada_min,
      salidaReal: c.salida_real !== null ? formatHora(c.salida_real) : c.en_curso ? "En curso" : "",
      salidaEsperada: c.salida_esperada ?? "",
      diffSalida: c.diff_salida_min,
      horas: c.salida_real !== null ? (c.salida_real - c.entrada_real) / 3600 : null,
      estado: ESTADO_LABEL[c.estado],
      color: colorTurno(c.estado, c.en_curso),
    });
  }
  for (const a of ausencias) {
    filas.push({
      nombre: a.empleado_nombre,
      sucursal: a.sucursal_nombre,
      fecha: a.fecha,
      orden: new Date(`${a.fecha}T00:00:00Z`).getTime() / 1000,
      tipo: "Inasistencia",
      entradaReal: "",
      entradaEsperada: a.hora_inicio,
      diffEntrada: null,
      salidaReal: "",
      salidaEsperada: a.hora_fin,
      diffSalida: null,
      horas: a.horas,
      estado: a.justificada ? "Ausencia justificada" : "Ausencia injustificada",
      color: a.justificada ? COLOR.justificada : COLOR.injustificada,
    });
  }
  for (const h of huerfanas) {
    filas.push({
      nombre: h.nombre ?? h.phone,
      sucursal: h.sucursal_nombre,
      fecha: new Date(h.created_at * 1000).toLocaleDateString("sv", { timeZone: AR_TZ }),
      orden: h.created_at,
      tipo: "Sin par",
      entradaReal: h.tipo === "entrada" ? formatHora(h.created_at) : "",
      entradaEsperada: "",
      diffEntrada: null,
      salidaReal: h.tipo === "salida" ? formatHora(h.created_at) : "",
      salidaEsperada: "",
      diffSalida: null,
      horas: null,
      estado: `Marcación de ${h.tipo} sin par`,
      color: COLOR.pendiente,
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

  // ── Workbook ─────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();

  const wsResumen = wb.addWorksheet("Resumen");
  const columnasResumen = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Horas trabajadas", key: "horas", width: 16 },
    { header: "Tardanzas", key: "tardanzas", width: 12 },
    { header: "Salidas anticipadas", key: "salidasAnticipadas", width: 16 },
    { header: "Ausencias justificadas", key: "ausenciasJustificadas", width: 18 },
    { header: "Ausencias injustificadas", key: "ausenciasInjustificadas", width: 18 },
    { header: "Marcaciones sin par", key: "sinPar", width: 16 },
  ];
  configurarColumnas(wsResumen, columnasResumen, 2);
  agregarBranding(wb, wsResumen, `Asistencia — Resumen (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})`, columnasResumen.length);
  resumen.forEach((e, i) => {
    const row = wsResumen.addRow({
      nombre: e.nombre,
      horas: Number(e.horas.toFixed(2)),
      tardanzas: e.tardanzas,
      salidasAnticipadas: e.salidasAnticipadas,
      ausenciasJustificadas: e.ausenciasJustificadas,
      ausenciasInjustificadas: e.ausenciasInjustificadas,
      sinPar: e.sinPar,
    });
    row.getCell("horas").numFmt = "0.00";
    row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; cell.fill = zebraFill(i); });
    if (e.ausenciasInjustificadas > 0) {
      row.getCell("ausenciasInjustificadas").fill = fill(COLOR.injustificada);
    }
  });
  estilarHeader(wsResumen, 2);
  aplicarGrilla(wsResumen, 2);

  const wsDetalle = wb.addWorksheet("Detalle");
  const columnasDetalle = [
    { header: "Empleado", key: "nombre", width: 28 },
    { header: "Sucursal", key: "sucursal", width: 16 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Tipo", key: "tipo", width: 10 },
    { header: "Entrada real", key: "entradaReal", width: 12 },
    { header: "Entrada esperada", key: "entradaEsperada", width: 14 },
    { header: "Diferencia entrada (min)", key: "diffEntrada", width: 20 },
    { header: "Salida real", key: "salidaReal", width: 12 },
    { header: "Salida esperada", key: "salidaEsperada", width: 14 },
    { header: "Diferencia salida (min)", key: "diffSalida", width: 20 },
    { header: "Horas", key: "horas", width: 10 },
    { header: "Estado", key: "estado", width: 26 },
  ];
  configurarColumnas(wsDetalle, columnasDetalle, 2);
  agregarBranding(wb, wsDetalle, `Asistencia — Detalle (${formatFechaISO(desde)} a ${formatFechaISO(hasta)})`, columnasDetalle.length);
  for (const f of filas) {
    const row = wsDetalle.addRow({
      nombre: f.nombre,
      sucursal: f.sucursal ?? "",
      fecha: formatFechaISO(f.fecha),
      tipo: f.tipo,
      entradaReal: f.entradaReal,
      entradaEsperada: f.entradaEsperada,
      diffEntrada: f.diffEntrada,
      salidaReal: f.salidaReal,
      salidaEsperada: f.salidaEsperada,
      diffSalida: f.diffSalida,
      horas: f.horas !== null ? Number(f.horas.toFixed(2)) : "",
      estado: f.estado,
    });
    if (f.horas !== null) row.getCell("horas").numFmt = "0.00";
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = fill(f.color);
    });
  }
  estilarHeader(wsDetalle, 2);
  aplicarGrilla(wsDetalle, 2);

  const buffer = await wb.xlsx.writeBuffer();
  const rango = `${desde}_a_${hasta}`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="asistencia-${rango}.xlsx"`,
    },
  });
}
