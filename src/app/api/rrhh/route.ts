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
  fecha: number; // unix timestamp
  raw: string;
}

function parseAdminBlock(content: string): Omit<AusenciaRecord, "id" | "phone" | "fecha"> | null {
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

    const ausencias: AusenciaRecord[] = [];

    for (const row of rows) {
      const parsed = parseAdminBlock(row.content);
      if (!parsed) continue;
      ausencias.push({
        id: row.id,
        phone: row.phone,
        fecha: row.created_at,
        ...parsed,
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
        : a.motivo.toLowerCase().includes("licencia")
        ? "Licencia"
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
