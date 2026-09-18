// Parseo del CSV exportado por la planilla de Google Sheets de Caja — sin
// tocar la base de datos (eso vive en db.ts). Reglas de parseo idénticas al
// script de importación inicial (ver conversación): fechas "D/M/YYYY" o
// "DD-MM" sin año (typeo visto en la planilla real), montos en formato
// argentino ($1.234,56).

export interface FilaPlanillaCaja {
  fecha: string | null; // ISO, o null si no se pudo interpretar
  nombre: string;
  concepto: string; // tal cual está en la planilla, solo trim
  cuenta: string; // tal cual está en la planilla, solo trim
  correspondeA: string; // "YYYY-MM"
  tipoMovimiento: "ingreso" | "salida" | null;
  importeNeto: number;
  iva: number;
  otrosConceptos: number;
  nota: string | null;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseMonto(s: string): number {
  if (!s) return 0;
  const limpio = s.replace(/\$/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

// La planilla tiene mayormente "D/M/YYYY", pero hay filas con "DD-MM" sin año
// (typeo de carga) — en ese caso se toma el año de la columna Año.
function fechaISO(dmy: string, anioFallback: string): string | null {
  if (dmy.includes("/")) {
    const [d, m, y] = dmy.split("/").map(Number);
    if (!d || !m || !y) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (dmy.includes("-")) {
    const [d, m] = dmy.split("-").map(Number);
    if (!d || !m) return null;
    return `${anioFallback}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function correspondeAISO(my: string, fechaFallback: string | null): string {
  // "06-2026" -> "2026-06"
  const [m, y] = my.split("-");
  if (m && y && y.length === 4) return `${y}-${m}`;
  return fechaFallback ? fechaFallback.slice(0, 7) : "";
}

export function parseCsvCaja(csv: string): FilaPlanillaCaja[] {
  const lines = csv.split(/\r\n|\n/).filter((l) => l.length > 0);
  const rows = lines
    .slice(1)
    .map(parseCSVLine)
    // Filas reales: Año en un rango razonable — la planilla trae filas de
    // relleno sin usar con año "1899" (formato de fecha vacío de Sheets) que
    // hay que descartar antes de que lleguen a validarFila.
    .filter((r) => {
      const anio = Number(r[0]);
      return Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
    });

  return rows.map((r): FilaPlanillaCaja => {
    const [anio, , fecha, nombre, concepto, correspondeA, importeNeto, iva, otros, , movimiento, , cuenta, notas] = r;
    const tipo = movimiento === "Ingreso" ? "ingreso" : movimiento === "Salida" ? "salida" : null;
    const fISO = fecha ? fechaISO(fecha, anio) : null;
    return {
      fecha: fISO,
      nombre: (nombre ?? "").trim(),
      concepto: (concepto ?? "").trim(),
      cuenta: (cuenta ?? "").trim(),
      correspondeA: correspondeA ? correspondeAISO(correspondeA, fISO) : fISO?.slice(0, 7) ?? "",
      tipoMovimiento: tipo,
      importeNeto: parseMonto(importeNeto ?? ""),
      iva: parseMonto(iva ?? ""),
      otrosConceptos: parseMonto(otros ?? ""),
      nota: notas && notas.trim() ? notas.trim() : null,
    };
  });
}

// Acepta el link normal de "compartir" (.../d/<id>/edit?usp=sharing) o
// cualquier variante y arma la URL de export CSV pública — la planilla debe
// estar compartida como "cualquiera con el enlace puede ver".
export function sheetUrlToCsvUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
}

// La planilla tiene que estar compartida como "cualquiera con el enlace
// puede ver" — si no, Google devuelve una página de login en vez del CSV.
export async function fetchCsvDesdeSheet(url: string): Promise<string> {
  const csvUrl = sheetUrlToCsvUrl(url);
  if (!csvUrl) throw new Error("No pude reconocer el link de Google Sheets");
  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`Google Sheets respondió ${res.status} — revisá que el link sea público ("cualquiera con el enlace")`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("csv")) {
    throw new Error('La planilla no es accesible públicamente — compartila como "cualquiera con el enlace puede ver"');
  }
  return res.text();
}
