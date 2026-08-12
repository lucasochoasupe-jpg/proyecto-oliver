import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

function clasificarMotivo(motivo: string): string {
  const m = motivo.toLowerCase();
  if (m.includes("urgencia")) return "Urgencia";
  if (m.includes("licencia")) return "Licencia";
  if (m.includes("enfermedad")) return "Enfermedad";
  if (m.includes("personal")) return "Motivo Personal";
  return "Otro";
}

function parseAdminBlock(content: string) {
  const tagMatch = content.match(/<ADMIN>([\s\S]*?)<\/ADMIN>/i);
  const raw = tagMatch
    ? tagMatch[1].trim()
    : (() => {
        const bare = content.match(/Aviso de Sanca:[\s\S]*?(?=\n\n|\n✅|\nAvisé|$)/i);
        return bare ? bare[0].trim() : null;
      })();

  if (!raw) return null;
  const nombreMatch = raw.match(/Aviso de Sanca:\s*(.+?)\s+de sucursal/i);
  const sucursalMatch = raw.match(/de sucursal\s+(.+?)\s+comunica/i);
  const motivoMatch = raw.match(/comunica\s+(.+?)\.\s+Detalle:/i);
  const detalleMatch = raw.match(/Detalle:\s*([\s\S]+?)(?:\.\s*Contacto:|Contacto:|$)/i);
  const contactoMatch = raw.match(/Contacto:\s*(.+?)$/im);
  return {
    nombre: nombreMatch?.[1]?.trim() ?? "Desconocido",
    sucursal: sucursalMatch?.[1]?.trim() ?? "Desconocida",
    motivo: motivoMatch?.[1]?.trim() ?? "Sin especificar",
    detalle: detalleMatch?.[1]?.trim().replace(/\.$/, "") ?? raw,
    contacto: contactoMatch?.[1]?.trim() ?? "—",
    certificadoPendiente: raw.includes("CERTIFICADO PENDIENTE"),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sucursal = searchParams.get("sucursal") ?? "Todas";
  const motivo = searchParams.get("motivo") ?? "Todos";
  const fecha = searchParams.get("fecha") ?? "";
  const soloCert = searchParams.get("cert") === "1";

  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, c.phone
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'assistant' AND (m.content LIKE '%<ADMIN>%' OR m.content LIKE '%Aviso de Sanca:%')
       ORDER BY m.created_at DESC`
    )
    .all() as { id: number; content: string; created_at: number; phone: string }[];

  const ausencias = rows
    .map((r) => {
      const p = parseAdminBlock(r.content);
      if (!p) return null;
      return { id: r.id, phone: r.phone, fecha: r.created_at, ...p };
    })
    .filter(Boolean)
    .filter((a) => {
      if (!a) return false;
      if (sucursal !== "Todas" && a.sucursal !== sucursal) return false;
      if (motivo !== "Todos" && clasificarMotivo(a.motivo) !== motivo) return false;
      if (soloCert && !a.certificadoPendiente) return false;
      if (fecha) {
        const d = new Date(a.fecha * 1000);
        const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (isoDay !== fecha) return false;
      }
      return true;
    }) as NonNullable<ReturnType<typeof parseAdminBlock> & { id: number; phone: string; fecha: number }>[];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sanca RRHH";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Ausentismo");

  // Columnas con anchos fijos
  ws.columns = [
    { header: "Empleado",              key: "nombre",               width: 26 },
    { header: "Sucursal",              key: "sucursal",             width: 16 },
    { header: "Tipo",                  key: "tipo",                 width: 18 },
    { header: "Motivo",                key: "motivo",               width: 30 },
    { header: "Fecha",                 key: "fecha",                width: 14 },
    { header: "Hora",                  key: "hora",                 width: 10 },
    { header: "Cert. Pendiente",       key: "cert",                 width: 16 },
    { header: "Detalle",               key: "detalle",              width: 50 },
    { header: "Contacto",              key: "contacto",             width: 36 },
  ];

  // Estilo del header
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C1810" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFD4A843" } },
    };
  });
  headerRow.height = 22;

  // Filas de datos
  ausencias.forEach((a, i) => {
    const d = new Date(a.fecha * 1000);
    const fechaStr = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
    const horaStr = d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
    const row = ws.addRow({
      nombre:   a.nombre,
      sucursal: a.sucursal,
      tipo:     clasificarMotivo(a.motivo),
      motivo:   a.motivo,
      fecha:    fechaStr,
      hora:     horaStr,
      cert:     a.certificadoPendiente ? "⚠ Pendiente" : "—",
      detalle:  a.detalle,
      contacto: a.contacto,
    });

    const bg = i % 2 === 0 ? "FFFAF7F2" : "FFFFFFFF";
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.font = { size: 10 };
    });

    // Resaltar cert pendiente
    const certCell = row.getCell("cert");
    if (a.certificadoPendiente) {
      certCell.font = { bold: true, color: { argb: "FFB45309" }, size: 10 };
      certCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    }

    row.height = 18;
  });

  // Bordes exteriores de la tabla
  const lastRow = ws.lastRow?.number ?? 1;
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.getCell(1).border = { ...row.getCell(1).border, left: { style: "thin", color: { argb: "FFDDD0BC" } } };
    row.getCell(9).border = { ...row.getCell(9).border, right: { style: "thin", color: { argb: "FFDDD0BC" } } };
  }

  // Fila de resumen al final
  ws.addRow({});
  const totalRow = ws.addRow({ nombre: `Total: ${ausencias.length} registros`, cert: `Cert. pendientes: ${ausencias.filter((a) => a.certificadoPendiente).length}` });
  totalRow.getCell(1).font = { bold: true, italic: true, color: { argb: "FF8B6347" }, size: 10 };
  totalRow.getCell(7).font = { bold: true, italic: true, color: { argb: "FFB45309" }, size: 10 };

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rrhh-ausencias-${today}.xlsx"`,
    },
  });
}
