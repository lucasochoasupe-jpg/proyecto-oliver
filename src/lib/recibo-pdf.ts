import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { montoALetras } from "./numero-a-letras";
import type { AportesLegales } from "./db";

// Paleta compartida con los exports Excel (ver src/lib/excel-style.ts) para
// que todos los documentos generados por la app se vean consistentes.
const COLOR = {
  header: "#2C1810",
  accent: "#D4A843",
  border: "#DDD0BC",
  muted: "#8B6347",
  bg: "#FAF7F2",
};

const PIE_COLORES = ["#D4A843", "#2C1810", "#8B6347", "#B89070", "#5C3D2E", "#EDE0CC"];

export interface ReciboEmpresa {
  razon_social: string | null;
  domicilio: string | null;
  cuit: string | null;
  obra_social_codigo: string | null;
  obra_social_nombre: string | null;
}

export interface ReciboEmpleado {
  nombre: string;
  legajo: string | null;
  cuil: string | null;
  categoria_laboral: string | null;
  banco: string | null;
  fecha_ingreso: string | null;
  antiguedad: string;
}

export interface ReciboData {
  empresa: ReciboEmpresa;
  empleado: ReciboEmpleado;
  desde: string; // DD/MM/YYYY
  hasta: string; // DD/MM/YYYY
  tipo_pago: "mensual" | "hora" | "dia";
  sueldo_o_jornal: number; // valor nominal (sueldo_mensual / valor_hora / valor_dia)
  legal: AportesLegales;
  adelantos: number;
  total_a_depositar: number; // total_blanco (neto - adelantos)
}

function formatARS(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

function getLogoBuffer(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
  } catch {
    return null;
  }
}

// Dibuja una tabla simple de 3 columnas (concepto / base opcional / monto),
// con encabezado oscuro y filas separadas por una línea fina — mismo
// espíritu visual que las tablas de excel-style.ts, adaptado a pdfkit.
function dibujarTabla(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  columnas: { titulo: string; ancho: number; alinear?: "left" | "right" }[],
  filas: string[][]
): number {
  let cursorY = y;
  doc.rect(x, cursorY, width, 18).fill(COLOR.header);
  let cx = x;
  doc.fontSize(8).fillColor("#FFFFFF").font("Helvetica-Bold");
  columnas.forEach((c) => {
    doc.text(c.titulo, cx + 4, cursorY + 5, { width: c.ancho - 8, align: c.alinear ?? "left" });
    cx += c.ancho;
  });
  cursorY += 18;

  doc.font("Helvetica").fontSize(8.5).fillColor(COLOR.header);
  filas.forEach((fila) => {
    // Alto de fila dinámico: el mayor entre todas las celdas que envuelven a
    // más de una línea (ej. un banco largo o "0 años y 1 mes" en una columna
    // angosta), para no cortar texto ni pisar la fila siguiente.
    const alturaFila = Math.max(
      16,
      ...fila.map((valor, i) => doc.heightOfString(valor, { width: columnas[i].ancho - 8 }) + 8)
    );
    cx = x;
    fila.forEach((valor, i) => {
      doc.text(valor, cx + 4, cursorY + 4, { width: columnas[i].ancho - 8, align: columnas[i].alinear ?? "left" });
      cx += columnas[i].ancho;
    });
    cursorY += alturaFila;
    doc.moveTo(x, cursorY).lineTo(x + width, cursorY).strokeColor(COLOR.border).lineWidth(0.5).stroke();
  });

  doc.rect(x, y, width, cursorY - y).strokeColor(COLOR.border).lineWidth(0.5).stroke();
  return cursorY;
}

function dibujarGraficoTorta(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  radio: number,
  slices: { label: string; valor: number }[]
) {
  const total = slices.reduce((acc, s) => acc + s.valor, 0);
  if (total <= 0) return;

  let anguloActual = -Math.PI / 2;
  slices.forEach((s, i) => {
    if (s.valor <= 0) return;
    const anguloSlice = (s.valor / total) * Math.PI * 2;
    const anguloFin = anguloActual + anguloSlice;
    const color = PIE_COLORES[i % PIE_COLORES.length];

    const pasos = Math.max(2, Math.ceil(anguloSlice / (Math.PI / 60)));
    doc.moveTo(cx, cy);
    for (let p = 0; p <= pasos; p++) {
      const a = anguloActual + (anguloFin - anguloActual) * (p / pasos);
      doc.lineTo(cx + radio * Math.cos(a), cy + radio * Math.sin(a));
    }
    doc.closePath().fill(color);
    anguloActual = anguloFin;
  });

  // Leyenda a la derecha del gráfico
  const legendX = cx + radio + 20;
  let legendY = cy - radio;
  slices.forEach((s, i) => {
    if (s.valor <= 0) return;
    const pct = ((s.valor / total) * 100).toFixed(1);
    doc.rect(legendX, legendY, 8, 8).fill(PIE_COLORES[i % PIE_COLORES.length]);
    doc.fontSize(8).fillColor(COLOR.header).font("Helvetica").text(`${s.label} — ${pct}%`, legendX + 12, legendY - 1);
    legendY += 14;
  });
}

export function generarReciboPdf(data: ReciboData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 72;
    const left = 36;

    // ── Encabezado ────────────────────────────────────────────────────────
    const logo = getLogoBuffer();
    if (logo) doc.image(logo, left, 30, { width: 34, height: 34 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR.header).text(data.empresa.razon_social ?? "—", left + 44, 30);
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.muted);
    if (data.empresa.domicilio) doc.text(data.empresa.domicilio, left + 44, 46);
    if (data.empresa.cuit) doc.text(`C.U.I.T.: ${data.empresa.cuit}`, left + 44, 58);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.header).text("RECIBO DE HABERES", 0, 32, { align: "right", width: doc.page.width - 36 });
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.muted).text(`Período: ${data.desde} a ${data.hasta}`, 0, 48, { align: "right", width: doc.page.width - 36 });

    let y = 85;
    doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor(COLOR.accent).lineWidth(1.5).stroke();
    y += 10;

    // ── Datos del empleado ────────────────────────────────────────────────
    y = dibujarTabla(
      doc,
      left,
      y,
      pageWidth,
      [
        { titulo: "LEGAJO", ancho: pageWidth * 0.1 },
        { titulo: "APELLIDO Y NOMBRE", ancho: pageWidth * 0.28 },
        { titulo: "C.U.I.L.", ancho: pageWidth * 0.16 },
        { titulo: "CATEGORÍA LABORAL", ancho: pageWidth * 0.22 },
        { titulo: "ANTIGÜEDAD", ancho: pageWidth * 0.12 },
        { titulo: "BANCO", ancho: pageWidth * 0.12 },
      ],
      [
        [
          data.empleado.legajo ?? "—",
          data.empleado.nombre,
          data.empleado.cuil ?? "—",
          data.empleado.categoria_laboral ?? "—",
          data.empleado.antiguedad,
          data.empleado.banco ?? "—",
        ],
      ]
    );
    y += 14;

    // ── Costo total empleador ─────────────────────────────────────────────
    doc.rect(left, y, pageWidth, 20).fill(COLOR.accent);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.header).text("COSTO TOTAL EMPLEADOR", left + 8, y + 5);
    doc.text(formatARS(data.legal.costo_total_empleador), left, y + 5, { width: pageWidth - 8, align: "right" });
    y += 30;

    // ── Contribuciones del empleador ──────────────────────────────────────
    const filasContrib: string[][] = [
      ["ART", formatARS(data.legal.costo_art)],
      ["Contribución Jubilación", formatARS(data.legal.costo_jubilacion_patronal)],
      ["Contribución Obra Social", formatARS(data.legal.costo_obra_social_patronal)],
    ];
    if (data.legal.costo_seguro_vida > 0) filasContrib.push(["Seguro de vida", formatARS(data.legal.costo_seguro_vida)]);
    y = dibujarTabla(
      doc,
      left,
      y,
      pageWidth,
      [
        { titulo: "CONCEPTO", ancho: pageWidth * 0.7 },
        { titulo: "MONTO", ancho: pageWidth * 0.3, alinear: "right" },
      ],
      filasContrib
    );
    y += 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR.header);
    doc.text("SUB TOTAL CONTRIBUCIONES EMPLEADOR", left, y, { width: pageWidth * 0.7 });
    doc.text(formatARS(data.legal.costo_empleador_total), left, y, { width: pageWidth, align: "right" });
    y += 14;
    doc.text("SUELDO BRUTO", left, y, { width: pageWidth * 0.7 });
    doc.text(formatARS(data.legal.sueldo_bruto), left, y, { width: pageWidth, align: "right" });
    y += 20;

    // ── Conceptos del empleado ────────────────────────────────────────────
    const labelBase =
      data.tipo_pago === "mensual" ? "Sueldo Mensual" : data.tipo_pago === "hora" ? "Valor Hora" : "Jornal";
    const filasConceptos: string[][] = [[labelBase, formatARS(data.sueldo_o_jornal)]];
    if (data.legal.presentismo > 0) filasConceptos.push(["Presentismo", formatARS(data.legal.presentismo)]);
    filasConceptos.push(["Jubilación", `- ${formatARS(data.legal.aporte_jubilacion)}`]);
    filasConceptos.push(["Ley 19032 (INSSJP)", `- ${formatARS(data.legal.aporte_ley19032)}`]);
    filasConceptos.push([
      data.empresa.obra_social_nombre ? `Obra Social (${data.empresa.obra_social_nombre})` : "Obra Social",
      `- ${formatARS(data.legal.aporte_obra_social)}`,
    ]);
    if (data.legal.aporte_sindical > 0) filasConceptos.push(["Aporte Sindical", `- ${formatARS(data.legal.aporte_sindical)}`]);

    y = dibujarTabla(
      doc,
      left,
      y,
      pageWidth,
      [
        { titulo: "CONCEPTO", ancho: pageWidth * 0.7 },
        { titulo: "MONTO", ancho: pageWidth * 0.3, alinear: "right" },
      ],
      filasConceptos
    );
    y += 14;

    // ── Composición salarial / neto ───────────────────────────────────────
    const neto = data.legal.sueldo_bruto - data.legal.total_aportes_empleado;
    doc.rect(left, y, pageWidth, 24).fill(COLOR.header);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text("SUELDO NETO", left + 8, y + 7);
    doc.text(formatARS(neto), left, y + 7, { width: pageWidth - 8, align: "right" });
    y += 30;

    doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text(`Son pesos: ${montoALetras(neto)}`, left, y, { width: pageWidth });
    y += 20;

    if (data.adelantos > 0) {
      doc.font("Helvetica").fontSize(9).fillColor(COLOR.header);
      doc.text("Adelantos del período", left, y, { width: pageWidth * 0.7 });
      doc.text(`- ${formatARS(data.adelantos)}`, left, y, { width: pageWidth, align: "right" });
      y += 16;
      doc.font("Helvetica-Bold");
      doc.text("A DEPOSITAR", left, y, { width: pageWidth * 0.7 });
      doc.text(formatARS(data.total_a_depositar), left, y, { width: pageWidth, align: "right" });
      y += 20;
    }

    // ── Gráfico de composición del costo total ────────────────────────────
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR.header).text("Composición del costo total", left, y);
    y += 16;
    dibujarGraficoTorta(doc, left + 55, y + 55, 50, [
      { label: "Sindical", valor: data.legal.aporte_sindical },
      { label: "Jubilación", valor: data.legal.aporte_jubilacion + data.legal.costo_jubilacion_patronal },
      { label: "Ley 19032 / INSSJP", valor: data.legal.aporte_ley19032 },
      { label: "Obra Social", valor: data.legal.aporte_obra_social + data.legal.costo_obra_social_patronal },
      { label: "ART y otros", valor: data.legal.costo_art + data.legal.costo_seguro_vida },
      { label: "Sueldo Neto", valor: neto },
    ]);
    y += 130;

    // ── Firmas ─────────────────────────────────────────────────────────────
    // Se ubican a un espacio fijo después del contenido (no ancladas al pie
    // de página): si el contenido es largo, pdfkit las manda a una página
    // nueva junto con el pie de firma en vez de superponerse a nada.
    const firmaY = y + 20;
    doc.moveTo(left, firmaY).lineTo(left + 160, firmaY).strokeColor(COLOR.border).stroke();
    doc.moveTo(left + pageWidth - 160, firmaY).lineTo(left + pageWidth, firmaY).strokeColor(COLOR.border).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted);
    doc.text("Firma Empleador", left, firmaY + 4, { width: 160, align: "center" });
    doc.text("Firma Empleado", left + pageWidth - 160, firmaY + 4, { width: 160, align: "center" });

    // ── Pie de página ──────────────────────────────────────────────────────
    doc
      .font("Helvetica-Oblique")
      .fontSize(7.5)
      .fillColor(COLOR.muted)
      .text(
        "Documento de referencia interna — cálculo aproximado, no reemplaza el recibo de sueldo oficial.",
        left,
        firmaY + 24,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}
