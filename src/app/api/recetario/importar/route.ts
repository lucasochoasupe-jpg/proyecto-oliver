import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { importarRecetas, parsearCSV, RECETAS_HOJA } from "@/lib/recetario";

export const dynamic = "force-dynamic";

// Valor visible de una celda de Excel (las fórmulas traen su resultado).
function textoCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

async function filasDeExcel(buffer: ArrayBuffer): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja =
    libro.worksheets.find((h) => h.name.trim().toLowerCase() === RECETAS_HOJA.toLowerCase()) ??
    (libro.worksheets.length === 1 ? libro.worksheets[0] : undefined);
  if (!hoja) throw new Error(`El Excel no tiene la hoja "${RECETAS_HOJA}".`);
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (row) => {
    const valores: string[] = [];
    for (let c = 1; c <= 10; c++) valores.push(textoCelda(row.getCell(c).value));
    filas.push(valores);
  });
  return filas;
}

// Recibe la hoja de recetas (CSV descargado con el botón, o el Excel completo)
// y reemplaza las recetas. Solo admin (lo filtra el middleware).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "No llegó ningún archivo" }, { status: 400 });
  try {
    const nombre = archivo.name.toLowerCase();
    const filas = nombre.endsWith(".xlsx")
      ? await filasDeExcel(await archivo.arrayBuffer())
      : parsearCSV(await archivo.text());
    return NextResponse.json({ ok: true, ...importarRecetas(filas) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el archivo" }, { status: 400 });
  }
}
