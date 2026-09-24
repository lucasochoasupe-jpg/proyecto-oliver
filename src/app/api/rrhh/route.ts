import { NextRequest, NextResponse } from "next/server";
import {
  calcularSaldoVacaciones,
  crearAusenciaReportada,
  getEmpleadoById,
  eliminarAusenciasReportadasManuales,
  eliminarAvisosBotMany,
  type EstadoAusencia,
} from "@/lib/db";
import { listarRegistrosRRHH } from "@/lib/rrhh-registros";

export const dynamic = "force-dynamic";

const CATEGORIAS_MANUALES = ["Vacaciones", "Enfermedad", "Motivo Personal"] as const;
type CategoriaManual = (typeof CATEGORIAS_MANUALES)[number];

// Los registros se filtran y resumen en el cliente (ver rrhh-shared.ts), así
// las tarjetas y el export reflejan siempre lo que se está viendo.
export async function GET() {
  try {
    return NextResponse.json({ ausencias: listarRegistrosRRHH() });
  } catch (err) {
    console.error("[api/rrhh]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const empleadoId = Number(body?.empleadoId);
  const categoria = body?.categoria as string;
  const fechaInicio = body?.fechaInicio as string;
  const fechaFin = body?.fechaFin as string;
  const sucursal = typeof body?.sucursal === "string" && body.sucursal.trim() ? body.sucursal.trim() : null;
  const nota = typeof body?.nota === "string" && body.nota.trim() ? body.nota.trim() : null;
  const certificadoPendiente = categoria === "Enfermedad" && body?.certificadoPendiente === true;

  if (!empleadoId || !Number.isFinite(empleadoId)) {
    return NextResponse.json({ error: "Falta el empleado" }, { status: 400 });
  }
  const empleado = getEmpleadoById(empleadoId);
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
  if (!CATEGORIAS_MANUALES.includes(categoria as CategoriaManual)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }
  if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
    return NextResponse.json({ error: "El rango de fechas es inválido" }, { status: 400 });
  }

  // Lo carga el propio admin, así que ya entra decidido: Vacaciones aprobadas;
  // Enfermedad aprobada si ya trajo el certificado, si no queda pendiente
  // hasta que lo presente; Motivo Personal es solo informativo.
  const estado: EstadoAusencia =
    categoria === "Motivo Personal" ? "informativo" : certificadoPendiente ? "pendiente" : "aprobado";

  const id = crearAusenciaReportada({
    estado,
    empleadoNombre: empleado.nombre,
    categoria,
    fechaInicio,
    fechaFin,
    certificadoPendiente,
    phone: empleado.celular ?? "",
    adminMessageId: null,
    sucursal,
    nota,
  });

  // Mismo chequeo no bloqueante que hace el bot al recibir un pedido de
  // vacaciones — avisa si excede el saldo, pero igual carga el registro.
  let advertencia: string | null = null;
  if (categoria === "Vacaciones") {
    const diasPedidos = new Date(`${fechaFin}T00:00:00Z`).getTime() >= new Date(`${fechaInicio}T00:00:00Z`).getTime()
      ? Math.round((new Date(`${fechaFin}T00:00:00Z`).getTime() - new Date(`${fechaInicio}T00:00:00Z`).getTime()) / 86400000) + 1
      : 0;
    const anioPedido = Number(fechaInicio.slice(0, 4));
    const saldoInfo = calcularSaldoVacaciones(anioPedido).find((s) => s.nombre === empleado.nombre);
    if (saldoInfo && saldoInfo.saldo !== null && diasPedidos > saldoInfo.saldo) {
      advertencia = `${empleado.nombre} pide ${diasPedidos} días pero le quedan ${saldoInfo.saldo} de saldo en ${anioPedido}.`;
    }
  }

  return NextResponse.json({ id: -id, advertencia }, { status: 201 });
}

// Borra varios registros a la vez. Los ids positivos son mensajes del bot
// (messages.id); los negativos son cargas manuales (-ausencias_reportadas.id),
// mismo criterio que DELETE /api/rrhh/[id].
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n !== 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No se recibieron IDs válidos." }, { status: 400 });
  }

  const messageIds = ids.filter((id) => id > 0);
  const manualIds = ids.filter((id) => id < 0).map((id) => -id);

  eliminarAvisosBotMany(messageIds);
  eliminarAusenciasReportadasManuales(manualIds);

  return NextResponse.json({ ok: true, deleted: ids.length });
}
