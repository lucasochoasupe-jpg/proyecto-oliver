import { NextResponse } from "next/server";
import {
  calcularAusencias,
  calcularCumplimiento,
  calcularLiquidacion,
  getConnectionState,
  listAdelantos,
  listAsistenciaRechazada,
  listAttendancePendientes,
  listCajaMovimientos,
  listEmpleados,
  listParitariasPendientes,
  listPedidosAdelanto,
} from "@/lib/db";
import { listarRegistrosRRHH } from "@/lib/rrhh-registros";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";

export const dynamic = "force-dynamic";

// Resumen para la página de Inicio: todo en una sola consulta, reutilizando
// los mismos cálculos que Asistencia, RRHH, Liquidación y Caja.
export async function GET() {
  const hoy = hoyISO();
  const inicioMes = inicioDeMesISO();

  // ── Asistencia de hoy ──
  const turnosHoy = calcularCumplimiento({ desde: hoy, hasta: hoy });
  const trabajando = turnosHoy
    .filter((t) => t.en_curso)
    .map((t) => ({ nombre: t.nombre, sucursal: t.sucursal_nombre, entrada: t.entrada_real }))
    .sort((a, b) => a.entrada - b.entrada);
  const tarde = turnosHoy
    .filter((t) => t.estado === "tarde" || t.estado === "tarde_y_anticipada")
    .map((t) => ({ nombre: t.nombre, sucursal: t.sucursal_nombre, minutos: t.diff_entrada_min ?? 0 }));
  const faltas = calcularAusencias({ desde: hoy, hasta: hoy })
    .filter((a) => !a.feriado)
    .map((a) => ({ nombre: a.empleado_nombre, sucursal: a.sucursal_nombre, horario: `${a.hora_inicio}–${a.hora_fin}`, justificada: a.justificada }));
  const porSucursal: Record<string, { trabajando: number; fichadas: number }> = {};
  for (const t of turnosHoy) {
    const s = (porSucursal[t.sucursal_nombre] ??= { trabajando: 0, fichadas: 0 });
    s.fichadas++;
    if (t.en_curso) s.trabajando++;
  }

  // ── Pendientes por resolver ──
  const registros = listarRegistrosRRHH();
  const pedidosRRHH = registros
    .filter((r) => r.estado === "pendiente")
    .map((r) => ({ nombre: r.nombre, tipo: r.tipo, desde: r.fechaInicio, hasta: r.fechaFin }));
  const certificados = registros
    .filter((r) => r.certificadoPendiente && !r.certificadoRecibidoEn)
    .map((r) => ({ nombre: r.nombre, desde: r.fechaInicio }));
  const adelantosPedidos = listPedidosAdelanto()
    .filter((p) => p.estado === "pendiente")
    .map((p) => ({ nombre: p.empleado_nombre, monto: p.monto, fechaPago: p.fecha_pago }));
  const marcacionesConProblemas = listAsistenciaRechazada(true).length + listAttendancePendientes().length;

  // ── Avisos del sistema ──
  const conexion = getConnectionState();
  const activos = listEmpleados().filter((e) => e.activo === 1);
  const liquidacionMes = calcularLiquidacion({ desde: inicioMes, hasta: hoy });
  const sinHorario = liquidacionMes.filter((f) => f.advertencias.some((a) => a.startsWith("Sin horario cargado"))).length;
  // Mismo criterio que la advertencia de Liquidación (alguien con solo la
  // parte informal configurada sí se puede liquidar).
  const sinTipoPago = liquidacionMes.filter((f) => f.advertencias.some((a) => a.startsWith("Sin tipo de pago"))).length;
  const sinCelular = activos.filter((e) => !e.celular).length;
  const paritarias = listParitariasPendientes().map((p) => ({ convenio: p.convenio_nombre }));

  // ── Números del mes ──
  const adelantosMes = listAdelantos({ desde: inicioMes, hasta: hoy });
  const caja = listCajaMovimientos({ desde: inicioMes, hasta: hoy });
  const ingresos = caja.filter((m) => m.tipo_movimiento === "ingreso").reduce((acc, m) => acc + m.importe_total, 0);
  const egresos = caja.filter((m) => m.tipo_movimiento !== "ingreso").reduce((acc, m) => acc + m.importe_total, 0);

  return NextResponse.json({
    hoy,
    inicioMes,
    asistencia: { trabajando, tarde, faltas, porSucursal, fichadas: turnosHoy.length },
    pendientes: { pedidosRRHH, certificados, adelantosPedidos, marcacionesConProblemas },
    avisos: {
      whatsapp: { status: conexion.status, phone: conexion.phone },
      sinHorario,
      sinTipoPago,
      sinCelular,
      paritarias,
      empleadosActivos: activos.length,
    },
    mes: {
      liquidacion: liquidacionMes.reduce((acc, f) => acc + f.total, 0),
      adelantos: adelantosMes.reduce((acc, a) => acc + a.monto, 0),
      adelantosCantidad: adelantosMes.length,
      cajaIngresos: ingresos,
      cajaEgresos: egresos,
    },
  });
}
