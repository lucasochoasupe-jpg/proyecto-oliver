// Recetario de producción: las recetas vienen del "Maestro Recetas SCII"
// (hoja "BBDD Costos Recetas", una fila por ingrediente). Desde el panel se
// descarga esa hoja como CSV (con la sesión de Google de quien la abre) y se
// sube de nuevo: así no hace falta darle acceso al servidor. El empleado elige producto + cantidad y
// se escalan los ingredientes, abriendo las recetas que se usan dentro de
// otras (ej. "Masa alfajor" dentro de "alfajor chocolate").
//
// Los costos de la planilla NO se copian: el recetario es para la cuadra.
import db, { getSistemaKV, setSistemaKV } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS recetas (
    producto_id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    rinde REAL NOT NULL DEFAULT 0, -- "Unidades x receta" de la planilla (kg o unidades)
    masa_g REAL NOT NULL DEFAULT 0, -- suma de ingredientes en g/ml, mermas incluidas
    unidad_detectada TEXT, -- 'kg' | 'unidad' | NULL (sin rendimiento)
    orden INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS receta_ingredientes (
    producto_id TEXT NOT NULL REFERENCES recetas(producto_id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    insumo_id TEXT,
    descripcion TEXT NOT NULL,
    cantidad REAL NOT NULL,
    unidad TEXT NOT NULL, -- 'g' | 'ml' | 'unidad' | '' (sin dato en la planilla)
    es_merma INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (producto_id, orden)
  );
  -- Correcciones hechas en el panel: sobreviven a cada sincronización.
  CREATE TABLE IF NOT EXISTS recetas_ajustes (
    producto_id TEXT PRIMARY KEY,
    unidad TEXT, -- 'kg' | 'unidad' (pisa la detectada)
    oculto INTEGER NOT NULL DEFAULT 0
  );
`);

const RECETAS_SHEET_ID = process.env.RECETAS_SHEET_ID || "1YuXrkfcZ5MmSh_sQjShWkwAtwXTfTKY2gxcTuPma840";
const RECETAS_SHEET_GID = process.env.RECETAS_SHEET_GID || "2071666193"; // hoja "BBDD Costos Recetas"
export const RECETAS_HOJA = "BBDD Costos Recetas";
export const PLANILLA_URL = `https://docs.google.com/spreadsheets/d/${RECETAS_SHEET_ID}/edit#gid=${RECETAS_SHEET_GID}`;
// Se abre en el navegador de quien administra (logueado en Google) y baja la hoja como CSV.
export const DESCARGA_CSV_URL = `https://docs.google.com/spreadsheets/d/${RECETAS_SHEET_ID}/export?format=csv&gid=${RECETAS_SHEET_GID}`;

export type UnidadReceta = "kg" | "unidad";

export interface ProductoReceta {
  producto_id: string;
  nombre: string;
  rinde: number;
  masa_g: number;
  unidad: UnidadReceta | null; // la ajustada si hay, si no la detectada
  unidad_detectada: UnidadReceta | null;
  unidad_ajustada: boolean;
  oculto: boolean;
  peso_unidad_g: number | null; // solo para recetas por unidad con peso conocido
  ingredientes: number;
  problemas: string[];
}

// ── Sincronización ──────────────────────────────────────────────────────────

// Acepta "31.28", "2,805", "1.234,5" o "31,28" (según el idioma con que se
// exportó la planilla): el último separador con 1-2 decimales es la coma decimal.
function numero(s: string | undefined): number {
  if (!s) return NaN;
  let t = String(s).replace(/[$\s]/g, "");
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  }
  return Number(t);
}

export function parsearCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

function unidadInsumo(s: string): string {
  const u = s.trim().toLowerCase();
  if (u.startsWith("gram")) return "g";
  if (u.startsWith("mili")) return "ml";
  if (u.startsWith("unid")) return "unidad";
  return "";
}

function esMerma(descripcion: string, cantidad: number): boolean {
  return cantidad < 0 || /merma/i.test(descripcion);
}

export function detectarUnidad(rinde: number, masaG: number): UnidadReceta | null {
  if (!(rinde > 0)) return null;
  if (rinde === 1) return "unidad"; // receta escrita "por 1 unidad"
  // Si el rendimiento coincide con el peso de la masa en kilos, la receta rinde kg.
  if (masaG > 0 && Math.abs(rinde * 1000 - masaG) / masaG < 0.02) return "kg";
  return "unidad";
}

interface RecetaParseada {
  producto_id: string;
  nombre: string;
  rinde: number;
  ingredientes: { insumo_id: string | null; descripcion: string; cantidad: number; unidad: string; es_merma: boolean }[];
}

// filas: la hoja completa (fila 0 = encabezados). Columnas: A ID producto,
// B nombre, E ID insumo, F descripción, G cantidad, H unidad, J rinde.
export function parsearHojaRecetas(filas: string[][]): RecetaParseada[] {
  const recetas = new Map<string, RecetaParseada>();
  for (const f of filas.slice(1)) {
    const id = (f[0] ?? "").trim();
    if (!/^\d+$/.test(id)) continue;
    const cantidad = numero(f[6]);
    const descripcion = (f[5] ?? "").trim();
    if (!descripcion && !(f[4] ?? "").trim()) continue;
    let r = recetas.get(id);
    if (!r) {
      r = { producto_id: id, nombre: (f[1] ?? "").trim(), rinde: numero(f[9]), ingredientes: [] };
      recetas.set(id, r);
    }
    if (!(r.rinde > 0) && numero(f[9]) > 0) r.rinde = numero(f[9]);
    r.ingredientes.push({
      insumo_id: (f[4] ?? "").trim() || null,
      descripcion: descripcion || `Insumo ${f[4]}`,
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      unidad: unidadInsumo(f[7] ?? ""),
      es_merma: esMerma(descripcion, cantidad),
    });
  }
  return [...recetas.values()];
}

export function guardarRecetas(recetas: RecetaParseada[]): void {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM receta_ingredientes; DELETE FROM recetas;");
    const insR = db.prepare(
      "INSERT INTO recetas (producto_id, nombre, rinde, masa_g, unidad_detectada, orden) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insI = db.prepare(
      "INSERT INTO receta_ingredientes (producto_id, orden, insumo_id, descripcion, cantidad, unidad, es_merma) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    recetas.forEach((r, i) => {
      const masa = r.ingredientes.filter((x) => x.unidad === "g" || x.unidad === "ml").reduce((a, x) => a + x.cantidad, 0);
      const rinde = Number.isFinite(r.rinde) ? r.rinde : 0;
      insR.run(r.producto_id, r.nombre, rinde, masa, detectarUnidad(rinde, masa), i);
      r.ingredientes.forEach((x, j) =>
        insI.run(r.producto_id, j, x.insumo_id, x.descripcion, x.cantidad, x.unidad, x.es_merma ? 1 : 0)
      );
    });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// filas: la hoja "BBDD Costos Recetas" ya leída (del CSV o del Excel).
export function importarRecetas(filas: string[][]): { productos: number; ingredientes: number } {
  const encabezado = (filas[0] ?? []).join(" ").toLowerCase();
  if (!encabezado.includes("id producto") || !encabezado.includes("insumo")) {
    throw new Error(`El archivo no es la hoja "${RECETAS_HOJA}" (no tiene las columnas ID Producto / Insumo).`);
  }
  const recetas = parsearHojaRecetas(filas);
  if (recetas.length === 0) throw new Error("La hoja de recetas vino vacía: no se cambió nada.");
  guardarRecetas(recetas);
  setSistemaKV("recetario_sincronizado_at", String(Math.floor(Date.now() / 1000)));
  return { productos: recetas.length, ingredientes: recetas.reduce((a, r) => a + r.ingredientes.length, 0) };
}

export function ultimaSincronizacion(): number | null {
  const v = getSistemaKV("recetario_sincronizado_at");
  return v ? Number(v) : null;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

interface RecetaRow {
  producto_id: string;
  nombre: string;
  rinde: number;
  masa_g: number;
  unidad_detectada: UnidadReceta | null;
  unidad_ajuste: UnidadReceta | null;
  oculto: number | null;
}

interface IngredienteRow {
  producto_id: string;
  insumo_id: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  es_merma: number;
}

function cargar() {
  const recetas = db
    .prepare(
      `SELECT r.producto_id, r.nombre, r.rinde, r.masa_g, r.unidad_detectada, a.unidad AS unidad_ajuste, a.oculto
       FROM recetas r LEFT JOIN recetas_ajustes a ON a.producto_id = r.producto_id ORDER BY r.orden`
    )
    .all() as unknown as RecetaRow[];
  const ingredientes = db
    .prepare("SELECT producto_id, insumo_id, descripcion, cantidad, unidad, es_merma FROM receta_ingredientes ORDER BY producto_id, orden")
    .all() as unknown as IngredienteRow[];
  const porProducto = new Map<string, IngredienteRow[]>();
  for (const i of ingredientes) {
    const l = porProducto.get(i.producto_id) ?? [];
    l.push(i);
    porProducto.set(i.producto_id, l);
  }
  return { recetas: new Map(recetas.map((r) => [r.producto_id, r])), ingredientes: porProducto };
}

function unidadDe(r: RecetaRow): UnidadReceta | null {
  return r.unidad_ajuste ?? r.unidad_detectada;
}

function pesoUnidad(r: RecetaRow): number | null {
  return unidadDe(r) === "unidad" && r.rinde > 0 && r.masa_g > 0 ? r.masa_g / r.rinde : null;
}

export function listarProductos(incluirOcultos = false): ProductoReceta[] {
  const { recetas, ingredientes } = cargar();
  const out: ProductoReceta[] = [];
  for (const r of recetas.values()) {
    if (r.oculto && !incluirOcultos) continue;
    const ings = ingredientes.get(r.producto_id) ?? [];
    const problemas: string[] = [];
    if (!r.nombre || r.nombre.startsWith("#")) problemas.push("Sin nombre en la planilla");
    if (!(r.rinde > 0)) problemas.push("Sin rendimiento (Unidades x receta)");
    if (ings.some((i) => !i.unidad && !i.es_merma)) problemas.push("Hay ingredientes sin unidad");
    if (!r.unidad_ajuste && r.unidad_detectada === "unidad" && r.rinde !== 1 && r.masa_g > 0) {
      const peso = r.masa_g / r.rinde;
      // Unidades de más de 3 kg o de menos de 5 g suelen ser un rendimiento cargado en kg.
      if (peso > 3000 || peso < 5) problemas.push(`Rinde ${r.rinde} unidades de ${Math.round(peso)} g: revisar si es kg`);
    }
    out.push({
      producto_id: r.producto_id,
      nombre: r.nombre,
      rinde: r.rinde,
      masa_g: r.masa_g,
      unidad: unidadDe(r),
      unidad_detectada: r.unidad_detectada,
      unidad_ajustada: !!r.unidad_ajuste,
      oculto: !!r.oculto,
      peso_unidad_g: pesoUnidad(r),
      ingredientes: ings.filter((i) => !i.es_merma).length,
      problemas,
    });
  }
  return out;
}

export function ajustarReceta(productoId: string, cambios: { unidad?: UnidadReceta | null; oculto?: boolean }): void {
  const actual = db.prepare("SELECT unidad, oculto FROM recetas_ajustes WHERE producto_id = ?").get(productoId) as
    | { unidad: UnidadReceta | null; oculto: number }
    | undefined;
  const unidad = cambios.unidad !== undefined ? cambios.unidad : actual?.unidad ?? null;
  const oculto = cambios.oculto !== undefined ? (cambios.oculto ? 1 : 0) : actual?.oculto ?? 0;
  db.prepare(
    `INSERT INTO recetas_ajustes (producto_id, unidad, oculto) VALUES (?, ?, ?)
     ON CONFLICT(producto_id) DO UPDATE SET unidad = excluded.unidad, oculto = excluded.oculto`
  ).run(productoId, unidad, oculto);
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

export interface LineaCalculada {
  insumo_id: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string; // 'g' | 'ml' | 'unidad' | ''
  es_receta: boolean; // es otra receta (preparación previa)
}

export interface Preparacion {
  producto_id: string;
  nombre: string;
  cantidad: number;
  unidad: UnidadReceta;
  ingredientes: LineaCalculada[];
}

export interface ResultadoReceta {
  producto: { producto_id: string; nombre: string; cantidad: number; unidad: UnidadReceta };
  receta: LineaCalculada[]; // lo que va directo en el producto
  preparaciones: Preparacion[]; // recetas intermedias, sumadas
  materia_prima: LineaCalculada[]; // todo bajado a insumos, sumado
  advertencias: string[];
}

const MAX_NIVELES = 6;

// Por cuánto hay que multiplicar la receta para obtener `cantidad` en `unidad`.
function factor(r: RecetaRow, cantidad: number, unidad: UnidadReceta): number | null {
  const propia = unidadDe(r);
  if (!propia || !(r.rinde > 0)) return null;
  if (unidad === propia) return cantidad / r.rinde;
  if (unidad === "kg" && propia === "unidad" && r.masa_g > 0) return (cantidad * 1000) / r.masa_g;
  if (unidad === "unidad" && propia === "kg") return null; // no se sabe cuánto pesa cada unidad
  return null;
}

export function calcularReceta(productoId: string, cantidad: number, unidad: UnidadReceta): ResultadoReceta {
  const { recetas, ingredientes } = cargar();
  const raiz = recetas.get(productoId);
  if (!raiz) throw new Error("Producto no encontrado");
  if (!(cantidad > 0)) throw new Error("La cantidad tiene que ser mayor a 0");

  const advertencias: string[] = [];
  const preparaciones = new Map<string, Preparacion>();
  const materia = new Map<string, LineaCalculada>();
  let receta: LineaCalculada[] = [];

  function sumarMateria(l: LineaCalculada) {
    const clave = `${l.insumo_id ?? l.descripcion.toLowerCase()}|${l.unidad}`;
    const prev = materia.get(clave);
    if (prev) prev.cantidad += l.cantidad;
    else materia.set(clave, { ...l, es_receta: false });
  }

  function expandir(r: RecetaRow, f: number, camino: string[]): LineaCalculada[] {
    const lineas: LineaCalculada[] = [];
    for (const ing of ingredientes.get(r.producto_id) ?? []) {
      if (ing.es_merma) continue;
      const cant = ing.cantidad * f;
      const sub = ing.insumo_id && ing.insumo_id !== r.producto_id ? recetas.get(ing.insumo_id) : undefined;
      const linea: LineaCalculada = {
        insumo_id: ing.insumo_id,
        descripcion: sub ? sub.nombre : ing.descripcion,
        cantidad: cant,
        unidad: ing.unidad,
        es_receta: !!sub,
      };
      lineas.push(linea);
      if (!sub) {
        sumarMateria(linea);
        continue;
      }
      if (camino.includes(sub.producto_id) || camino.length >= MAX_NIVELES) {
        advertencias.push(`"${sub.nombre}" se usa dentro de sí misma: no se abrió su receta.`);
        sumarMateria({ ...linea, es_receta: false });
        continue;
      }
      // En gramos/ml se pide en kg; en unidades, en unidades.
      const pedido: { cantidad: number; unidad: UnidadReceta } =
        ing.unidad === "unidad" ? { cantidad: cant, unidad: "unidad" } : { cantidad: cant / 1000, unidad: "kg" };
      const fSub = factor(sub, pedido.cantidad, pedido.unidad);
      if (fSub === null) {
        advertencias.push(`No se pudo calcular la receta de "${sub.nombre}" (revisar su rendimiento o unidad): se muestra como insumo.`);
        sumarMateria({ ...linea, es_receta: false });
        continue;
      }
      const clave = `${sub.producto_id}|${pedido.unidad}`;
      const prev = preparaciones.get(clave);
      const subLineas = expandir(sub, fSub, [...camino, sub.producto_id]);
      if (prev) {
        prev.cantidad += pedido.cantidad;
        for (const l of subLineas) {
          const igual = prev.ingredientes.find((x) => x.descripcion === l.descripcion && x.unidad === l.unidad);
          if (igual) igual.cantidad += l.cantidad;
          else prev.ingredientes.push(l);
        }
      } else {
        preparaciones.set(clave, {
          producto_id: sub.producto_id,
          nombre: sub.nombre,
          cantidad: pedido.cantidad,
          unidad: pedido.unidad,
          ingredientes: subLineas,
        });
      }
    }
    return lineas;
  }

  const f = factor(raiz, cantidad, unidad);
  if (f === null) {
    if (unidad === "unidad" && unidadDe(raiz) === "kg") throw new Error(`"${raiz.nombre}" se calcula en kg, no por unidad.`);
    throw new Error(`"${raiz.nombre}" no tiene rendimiento cargado en la planilla.`);
  }
  receta = expandir(raiz, f, [raiz.producto_id]);
  if ((ingredientes.get(raiz.producto_id) ?? []).some((i) => !i.unidad && !i.es_merma)) {
    advertencias.push("Hay ingredientes sin unidad en la planilla: revisar las cantidades marcadas sin unidad.");
  }

  return {
    producto: { producto_id: raiz.producto_id, nombre: raiz.nombre, cantidad, unidad },
    receta,
    preparaciones: [...preparaciones.values()],
    materia_prima: [...materia.values()].sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es")),
    advertencias: [...new Set(advertencias)],
  };
}
