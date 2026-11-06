// Adelantos que ya figuran en la planilla de Caja (importada en Finanzas →
// Caja). Ahí los adelantos se cargan como salidas de concepto "Sueldos" con
// nombres tipo "Sueldos Leandro". Se distinguen del cobro final del sueldo
// por "Corresponde a": un pago hecho dentro del mismo mes al que corresponde
// es un adelanto; el sueldo de septiembre se paga a principios de octubre
// con "Corresponde a" 09-2026.
//
// Nada se carga solo: se listan con el empleado sugerido y alguien confirma
// cada uno (o los descarta con "No es adelanto").
import db, { crearAdelanto } from "./db";

try { db.exec("ALTER TABLE adelantos ADD COLUMN caja_movimiento_id INTEGER"); } catch {}
db.exec(`
  -- "leandro" → García Leandro: lo que se eligió una vez se sugiere siempre.
  CREATE TABLE IF NOT EXISTS caja_alias_empleado (
    alias TEXT PRIMARY KEY,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id)
  );
  -- Movimientos de "Sueldos" marcados como "No es adelanto".
  CREATE TABLE IF NOT EXISTS caja_no_adelanto (
    caja_movimiento_id INTEGER PRIMARY KEY
  );
`);

export type EstadoAdelantoCaja = "pendiente" | "cargado" | "descartado";

export interface AdelantoCaja {
  movimiento_id: number;
  fecha: string;
  nombre: string; // tal cual en la planilla
  cuenta: string;
  monto: number;
  nota: string | null;
  estado: EstadoAdelantoCaja;
  adelanto_id: number | null;
  empleado_id: number | null; // el del adelanto cargado, o el sugerido
  empleado_nombre: string | null;
  candidatos: { id: number; nombre: string }[]; // si hay más de un empleado posible
}

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// "Sueldos Rocio V" → "rocio v"; "Luka Sueldos" → "luka"; "Adelanto leandro" → "leandro".
function aliasDe(nombre: string): string {
  return sinTildes(nombre)
    .replace(/\b(sueldos?|adelantos?|anticipos?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface EmpleadoRow {
  id: number;
  nombre: string;
  activo: number;
}

// Empleados cuyo nombre contiene todas las palabras del alias. Una letra
// sola es una inicial ("romina g" → Gomez Romina).
function candidatosPara(alias: string, empleados: EmpleadoRow[]): EmpleadoRow[] {
  const palabras = alias.split(" ").filter(Boolean);
  if (palabras.length === 0) return [];
  const coincide = (e: EmpleadoRow, ps: string[]) => {
    const tokens = sinTildes(e.nombre).split(/\s+/);
    return ps.every((p) => (p.length === 1 ? tokens.some((t) => t.startsWith(p)) : tokens.includes(p)));
  };
  for (const ps of [palabras, palabras.slice(0, 1)]) {
    const activos = empleados.filter((e) => e.activo && coincide(e, ps));
    if (activos.length) return activos;
    const todos = empleados.filter((e) => coincide(e, ps));
    if (todos.length) return todos;
  }
  return [];
}

interface MovimientoRow {
  id: number;
  fecha: string;
  nombre: string;
  cuenta: string;
  monto: number;
  nota: string | null;
}

export function detectarAdelantosCaja(mes: string): AdelantoCaja[] {
  const movimientos = db
    .prepare(
      `SELECT m.id, m.fecha, m.nombre, cu.nombre AS cuenta, m.nota,
              m.importe_neto + COALESCE(m.iva, 0) + COALESCE(m.otros_conceptos, 0) AS monto
       FROM caja_movimientos m
       JOIN caja_conceptos co ON co.id = m.concepto_id
       JOIN caja_cuentas cu ON cu.id = m.cuenta_id
       WHERE m.tipo_movimiento = 'salida'
         AND substr(m.fecha, 1, 7) = ?
         AND m.corresponde_a = substr(m.fecha, 1, 7)
         AND (lower(co.nombre) LIKE 'sueldo%' OR lower(m.nombre) LIKE '%adelanto%' OR lower(m.nombre) LIKE '%anticipo%'
              OR lower(COALESCE(m.nota, '')) LIKE '%adelanto%' OR lower(COALESCE(m.nota, '')) LIKE '%anticipo%')
       ORDER BY m.fecha, m.id`
    )
    .all(mes) as unknown as MovimientoRow[];

  const empleados = db.prepare("SELECT id, nombre, activo FROM empleados").all() as unknown as EmpleadoRow[];
  const porId = new Map(empleados.map((e) => [e.id, e]));
  const alias = new Map(
    (db.prepare("SELECT alias, empleado_id FROM caja_alias_empleado").all() as { alias: string; empleado_id: number }[]).map(
      (a) => [a.alias, a.empleado_id]
    )
  );
  const descartados = new Set(
    (db.prepare("SELECT caja_movimiento_id AS id FROM caja_no_adelanto").all() as { id: number }[]).map((r) => r.id)
  );
  const vinculados = new Map(
    (
      db.prepare("SELECT id, empleado_id, caja_movimiento_id FROM adelantos WHERE caja_movimiento_id IS NOT NULL").all() as {
        id: number;
        empleado_id: number;
        caja_movimiento_id: number;
      }[]
    ).map((a) => [a.caja_movimiento_id, a])
  );
  // Adelantos cargados a mano antes de existir este cruce (ej. los de
  // septiembre): se reconocen por fecha + monto + empleado y se vinculan.
  const sueltos = db
    .prepare("SELECT id, empleado_id, fecha, monto FROM adelantos WHERE caja_movimiento_id IS NULL AND substr(fecha, 1, 7) = ?")
    .all(mes) as { id: number; empleado_id: number; fecha: string; monto: number }[];
  const vincular = db.prepare("UPDATE adelantos SET caja_movimiento_id = ? WHERE id = ?");

  return movimientos.map((m): AdelantoCaja => {
    const a = aliasDe(m.nombre);
    const candidatos = alias.has(a) && porId.has(alias.get(a)!) ? [porId.get(alias.get(a)!)!] : candidatosPara(a, empleados);
    const sugerido = candidatos.length === 1 ? candidatos[0] : null;

    let adelanto = vinculados.get(m.id) ?? null;
    if (!adelanto) {
      const i = sueltos.findIndex(
        (s) => s.fecha === m.fecha && Math.abs(s.monto - m.monto) < 0.01 && candidatos.some((c) => c.id === s.empleado_id)
      );
      if (i >= 0) {
        const s = sueltos.splice(i, 1)[0];
        vincular.run(m.id, s.id);
        adelanto = { id: s.id, empleado_id: s.empleado_id, caja_movimiento_id: m.id };
      }
    }

    const empleado = adelanto ? porId.get(adelanto.empleado_id) ?? null : sugerido;
    return {
      movimiento_id: m.id,
      fecha: m.fecha,
      nombre: m.nombre,
      cuenta: m.cuenta,
      monto: m.monto,
      nota: m.nota,
      estado: adelanto ? "cargado" : descartados.has(m.id) ? "descartado" : "pendiente",
      adelanto_id: adelanto?.id ?? null,
      empleado_id: empleado?.id ?? null,
      empleado_nombre: empleado?.nombre ?? null,
      candidatos: candidatos.length > 1 ? candidatos.map((c) => ({ id: c.id, nombre: c.nombre })) : [],
    };
  });
}

export function cargarAdelantoDesdeCaja(movimientoId: number, empleadoId: number): { ok: true } | { ok: false; error: string } {
  const m = db
    .prepare(
      `SELECT id, fecha, nombre, nota, importe_neto + COALESCE(iva, 0) + COALESCE(otros_conceptos, 0) AS monto
       FROM caja_movimientos WHERE id = ?`
    )
    .get(movimientoId) as { id: number; fecha: string; nombre: string; nota: string | null; monto: number } | undefined;
  if (!m) return { ok: false, error: "Ese movimiento ya no está en Caja" };
  if (db.prepare("SELECT 1 FROM adelantos WHERE caja_movimiento_id = ?").get(movimientoId)) {
    return { ok: false, error: "Ese movimiento ya está cargado como adelanto" };
  }
  if (!db.prepare("SELECT 1 FROM empleados WHERE id = ?").get(empleadoId)) return { ok: false, error: "Empleado no encontrado" };

  db.exec("BEGIN");
  try {
    const nota = `Planilla de Caja: ${m.nombre.trim()}${m.nota ? ` (${m.nota.trim()})` : ""}`;
    const adelanto = crearAdelanto({ empleadoId, fecha: m.fecha, monto: m.monto, nota });
    db.prepare("UPDATE adelantos SET caja_movimiento_id = ? WHERE id = ?").run(movimientoId, adelanto.id);
    db.prepare("DELETE FROM caja_no_adelanto WHERE caja_movimiento_id = ?").run(movimientoId);
    const a = aliasDe(m.nombre);
    if (a) {
      db.prepare(
        "INSERT INTO caja_alias_empleado (alias, empleado_id) VALUES (?, ?) ON CONFLICT(alias) DO UPDATE SET empleado_id = excluded.empleado_id"
      ).run(a, empleadoId);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true };
}

export function marcarNoAdelanto(movimientoId: number, noEsAdelanto: boolean): void {
  if (noEsAdelanto) db.prepare("INSERT OR IGNORE INTO caja_no_adelanto (caja_movimiento_id) VALUES (?)").run(movimientoId);
  else db.prepare("DELETE FROM caja_no_adelanto WHERE caja_movimiento_id = ?").run(movimientoId);
}
