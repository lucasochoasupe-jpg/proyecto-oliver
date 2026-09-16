import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

/** Paleta compartida por todos los exports Excel del proyecto. */
export const COLOR = {
  header: "2C1810",
  headerAccent: "D4A843",
  border: "DDD0BC",
  zebra: "FAF7F2",
  white: "FFFFFF",
  aHorario: "D1FAE5",
  tarde: "FECACA",
  sinHorario: "F3F4F6",
  justificada: "DBEAFE",
  injustificada: "FCA5A5",
  pendiente: "FEF3C7",
  pendienteTexto: "B45309",
  totalTexto: "8B6347",
} as const;

export function fill(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}

/** Franja alterna para filas sin color semántico propio. */
export function zebraFill(rowIndex: number): ExcelJS.Fill {
  return fill(rowIndex % 2 === 0 ? COLOR.zebra : COLOR.white);
}

export interface ColumnaDef {
  header: string;
  key: string;
  width?: number;
}

/** Ancho de columna nunca menor al título, para que ningún header quede truncado.
 * Escribe los títulos en `headerRow` (no en la propiedad `header` de ExcelJS) para poder
 * dejar la fila 1 libre para el encabezado de marca (ver `agregarBranding`). */
export function configurarColumnas(ws: ExcelJS.Worksheet, columnas: ColumnaDef[], headerRow = 1) {
  ws.columns = columnas.map((c) => ({ key: c.key, width: Math.max(c.width ?? 0, c.header.length + 3) }));
  const row = ws.getRow(headerRow);
  columnas.forEach((c, i) => { row.getCell(i + 1).value = c.header; });
}

/** Header oscuro con acento dorado, texto centrado y con wrap de seguridad, congelado y con autofiltro. */
export function estilarHeader(ws: ExcelJS.Worksheet, headerRow = 1) {
  const row = ws.getRow(headerRow);
  row.eachCell((cell) => {
    cell.fill = fill(COLOR.header);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: `FF${COLOR.headerAccent}` } } };
  });
  row.height = 26;
  ws.views = [{ state: "frozen", ySplit: headerRow }];
  if (ws.columnCount > 0) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: ws.columnCount } };
  }
}

/** Ensancha cada columna al texto más largo que realmente contiene (header + datos), no solo
 * al título — evita que un valor puntual (p.ej. "Inasistencia" o "Marcación de entrada sin par")
 * quede cortado visualmente aunque el título de la columna sea corto. Nunca angosta una columna
 * por debajo del ancho ya configurado, y respeta `max` para no estirar de más columnas de texto libre. */
export function ajustarAnchoContenido(ws: ExcelJS.Worksheet, opts?: { desdeFila?: number; max?: number }) {
  const desdeFila = opts?.desdeFila ?? 1;
  const max = opts?.max ?? 45;
  const lastRow = ws.lastRow?.number ?? desdeFila;
  const lastCol = ws.columnCount;
  const anchos: number[] = new Array(lastCol + 1).fill(0);
  for (let r = desdeFila; r <= lastRow; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const texto = cell.text ?? String(cell.value ?? "");
      if (texto.length > anchos[colNumber]) anchos[colNumber] = texto.length;
    });
  }
  for (let c = 1; c <= lastCol; c++) {
    const columna = ws.getColumn(c);
    columna.width = Math.max(columna.width ?? 0, Math.min(anchos[c] + 2, max));
  }
}

/** Grilla fina alrededor de todas las celdas con datos (sin pisar bordes ya definidos, como el del header). */
export function aplicarGrilla(ws: ExcelJS.Worksheet, desdeFila = 1) {
  const lastRow = ws.lastRow?.number ?? 1;
  const lastCol = ws.columnCount;
  const thin: ExcelJS.Border = { style: "thin", color: { argb: `FF${COLOR.border}` } };
  for (let r = desdeFila; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.border = { top: thin, bottom: thin, left: thin, right: thin, ...cell.border };
    }
  }
}

let logoBuffer: Buffer | null | undefined;
function getLogoBuffer(): Buffer | null {
  if (logoBuffer === undefined) {
    try {
      logoBuffer = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
    } catch {
      logoBuffer = null;
    }
  }
  return logoBuffer;
}

/** Fila 1 con el logo de la empresa y un título; deja la hoja lista para que el header de
 * columnas (estilarHeader/configurarColumnas) se escriba en la fila 2. Si no encuentra el
 * logo, escribe solo el título para no romper el export. */
export function agregarBranding(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, titulo: string, numColumnas: number) {
  const row = ws.getRow(1);
  row.height = 40;
  if (numColumnas > 1) ws.mergeCells(1, 2, 1, numColumnas);
  const cell = row.getCell(2);
  cell.value = titulo;
  cell.font = { bold: true, size: 13, color: { argb: `FF${COLOR.header}` } };
  cell.alignment = { vertical: "middle", horizontal: "left" };

  const buffer = getLogoBuffer();
  if (buffer) {
    const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 34, height: 35 } });
  }
}

/** Estilo para filas de resumen/total al pie de una tabla. */
export function estilarFilaTotal(row: ExcelJS.Row, colorTexto: string = COLOR.totalTexto) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, italic: true, color: { argb: `FF${colorTexto}` }, size: 10 };
  });
}
