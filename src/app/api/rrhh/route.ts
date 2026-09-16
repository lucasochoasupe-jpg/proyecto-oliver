import { NextRequest, NextResponse } from "next/server";
import db, { calcularSaldoVacaciones, crearAusenciaReportada, getEmpleadoById, listAusenciasManuales, eliminarAusenciasReportadasManuales, eliminarAvisosBotMany } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface AusenciaRecord {
  id: number;
  phone: string;
  nombre: string;
  sucursal: string;
  motivo: string;
  detalle: string;
  contacto: string;
  certificadoPendiente: boolean;
  certificadoRecibidoEn: number | null; // unix timestamp, si ya se resolvió
  fecha: number; // unix timestamp
  raw: string;
  origen?: "manual"; // ausente = viene del bot (aviso de WhatsApp)
}

const CATEGORIAS_MANUALES = ["Vacaciones", "Enfermedad", "Motivo Personal"] as const;
type CategoriaManual = (typeof CATEGORIAS_MANUALES)[number];

function formatFechaCorta(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseAdminBlock(
  content: string
): Omit<AusenciaRecord, "id" | "phone" | "fecha" | "certificadoRecibidoEn"> | null {
  // Intentar con etiquetas <ADMIN> primero, luego sin etiquetas
  const tagMatch = content.match(/<ADMIN>([\s\S]*?)<\/ADMIN>/i);
  const raw = tagMatch
    ? tagMatch[1].trim()
    : (() => {
        const bare = content.match(/Aviso de Sanca:[\s\S]*?(?=\n\n|\n✅|\nAvisé|$)/i);
        return bare ? bare[0].trim() : null;
      })();

  if (!raw) return null;

  // "Aviso de Sanca: [Nombre] de sucursal [Sucursal] comunica [Motivo]. Detalle: [Detalle]. Contacto: [Contacto]"
  const nombreMatch = raw.match(/Aviso de Sanca:\s*(.+?)\s+de sucursal/i);
  const sucursalMatch = raw.match(/de sucursal\s+(.+?)\s+comunica/i);
  const motivoMatch = raw.match(/comunica\s+(.+?)\.\s+Detalle:/i);
  const detalleMatch = raw.match(/Detalle:\s*([\s\S]+?)(?:\.\s*Contacto:|Contacto:|$)/i);
  const contactoMatch = raw.match(/Contacto:\s*(.+?)$/im);

  const certificadoPendiente = raw.includes("CERTIFICADO PENDIENTE");

  return {
    nombre: nombreMatch?.[1]?.trim() ?? "Desconocido",
    sucursal: sucursalMatch?.[1]?.trim() ?? "Desconocida",
    motivo: motivoMatch?.[1]?.trim() ?? "Sin especificar",
    detalle: detalleMatch?.[1]?.trim().replace(/\.$/, "") ?? raw,
    contacto: contactoMatch?.[1]?.trim() ?? "—",
    certificadoPendiente,
    raw,
  };
}

export async function GET() {
  try {
    // Traer todos los mensajes de assistant que contengan bloques ADMIN
    const rows = db
      .prepare(
        `SELECT m.id, m.content, m.created_at, c.phone
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.role = 'assistant' AND (m.content LIKE '%<ADMIN>%' OR m.content LIKE '%Aviso de Sanca:%')
         ORDER BY m.created_at DESC`
      )
      .all() as { id: number; content: string; created_at: number; phone: string }[];

    // certificadoPendiente sale de un texto fijo escrito al momento del aviso
    // (nunca cambia solo). Los certificados que ya llegaron por WhatsApp se
    // marcan resueltos en certificados_pendientes (ver resolverCertificadoPendiente
    // en baileys/handler.ts) — cruzamos por el id del mensaje de aviso a admin.
    const resueltos = db
      .prepare(
        `SELECT admin_message_id, resuelto_at
         FROM certificados_pendientes
         WHERE resuelto = 1 AND admin_message_id IS NOT NULL`
      )
      .all() as { admin_message_id: number; resuelto_at: number }[];
    const resueltoPorMensaje = new Map(resueltos.map((r) => [r.admin_message_id, r.resuelto_at]));

    const ausencias: AusenciaRecord[] = [];

    for (const row of rows) {
      const parsed = parseAdminBlock(row.content);
      if (!parsed) continue;
      const resueltoAt = resueltoPorMensaje.get(row.id) ?? null;
      ausencias.push({
        id: row.id,
        phone: row.phone,
        fecha: row.created_at,
        ...parsed,
        certificadoPendiente: parsed.certificadoPendiente && resueltoAt === null,
        certificadoRecibidoEn: resueltoAt,
      });
    }

    // Cargas manuales (admin, sin pasar por WhatsApp) — mismo `ausencias_reportadas`
    // que alimenta saldo de vacaciones y liquidación, ver [[crearAusenciaReportada]].
    // Se identifican con id negativo para no chocar con ids de mensajes.
    for (const a of listAusenciasManuales()) {
      const rango =
        a.fecha_inicio === a.fecha_fin
          ? ` el ${formatFechaCorta(a.fecha_inicio)}`
          : ` del ${formatFechaCorta(a.fecha_inicio)} al ${formatFechaCorta(a.fecha_fin)}`;
      ausencias.push({
        id: -a.id,
        phone: a.phone ?? "",
        nombre: a.empleado_nombre,
        sucursal: a.sucursal ?? "—",
        motivo: `${a.categoria}${rango}`,
        detalle: a.nota || "Cargado manualmente por administración",
        contacto: a.phone || "—",
        certificadoPendiente: a.categoria === "Enfermedad" && !!a.certificado_pendiente,
        certificadoRecibidoEn: null,
        fecha: a.created_at,
        raw: "",
        origen: "manual",
      });
    }
    ausencias.sort((a, b) => b.fecha - a.fecha);

    // Métricas resumen
    const totalAusencias = ausencias.length;
    const certificadosPendientes = ausencias.filter((a) => a.certificadoPendiente).length;

    const porSucursal: Record<string, number> = {};
    const porMotivo: Record<string, number> = {};
    for (const a of ausencias) {
      porSucursal[a.sucursal] = (porSucursal[a.sucursal] ?? 0) + 1;
      const tipoKey = a.motivo.toLowerCase().includes("urgencia")
        ? "Urgencia"
        : a.motivo.toLowerCase().includes("vacaciones") || a.motivo.toLowerCase().includes("licencia")
        ? "Vacaciones"
        : a.motivo.toLowerCase().includes("enfermedad")
        ? "Enfermedad"
        : a.motivo.toLowerCase().includes("personal")
        ? "Motivo Personal"
        : "Otro";
      porMotivo[tipoKey] = (porMotivo[tipoKey] ?? 0) + 1;
    }

    return NextResponse.json({
      ausencias,
      resumen: {
        total: totalAusencias,
        certificadosPendientes,
        porSucursal,
        porMotivo,
      },
    });
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

  const id = crearAusenciaReportada({
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
