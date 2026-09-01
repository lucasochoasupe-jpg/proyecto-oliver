import { NextResponse } from "next/server";
import db from "@/lib/db";

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
