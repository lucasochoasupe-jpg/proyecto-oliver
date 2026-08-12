// node:sqlite es nativo en Node.js 22.5+ (estable en Node 24) — sin compilación nativa
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "messages.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

// Migraciones
try { db.exec("ALTER TABLE empleados ADD COLUMN jid TEXT"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN celular TEXT"); } catch {}

// La nómina inicial solo debe cargarse la primera vez que se crea la base
// (instalación nueva) — si corriera en cada arranque, un empleado borrado desde
// el dashboard reaparecería solo (con jid/celular vacíos) en el próximo reinicio,
// porque "OR IGNORE" solo lo frena si el nombre exacto ya existe.
const empleadosTableExists = !!db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='empleados'")
  .get();

db.exec(`
  CREATE TABLE IF NOT EXISTS empleados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    celular TEXT,
    jid TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

if (!empleadosTableExists) {
  db.exec(`
    INSERT OR IGNORE INTO empleados (nombre) VALUES
      ('Acevedo Francisco'), ('Albertengo Damian'), ('Álvarez Alfredo'), ('Aquino Karen'),
      ('Ayora Florencia'), ('Battochio Benjamín'), ('Benedetto Roberto'), ('Benitez Patricia'),
      ('Biancotti Agustina'), ('Borja Julian'), ('Borri Denise'), ('Cardozo Silvia'),
      ('Carnevale Aldana'), ('Castañeda Georgina'), ('Cavallari María José'), ('Cristodolou Claudia'),
      ('Díaz Jorge'), ('Diep Asef Leila'), ('Fernández Belén'), ('Fernandez Sandra'),
      ('Ferreyra Rocio'), ('Franco Micaela'), ('Galasso Leticia'), ('Garcia Alejandra'),
      ('García Leandro'), ('Gomez Ramón Omar'), ('Gomez Romina'), ('Herrera Carla'),
      ('Landini Gabriela'), ('Longo Daniela'), ('Mayo Camila Denise'), ('Núñez Laura'),
      ('Obuljen Luka'), ('Obuljen Martina'), ('Ojeda Lautaro'), ('Pellegrini David'),
      ('Pérez José'), ('Ramirez Vanesa'), ('Ricardo Villareal'), ('Ríos Sandra'),
      ('Risso Carina'), ('Rivero Ignacio'), ('Roberi Mónica Graciela'), ('Rosas María de los Angeles'),
      ('Ruiz Diaz Sol Evangelina'), ('Sanchez Danisa'), ('Sanchez Romina'), ('Troncozo Laura'),
      ('Vallejos Cristian'), ('Vallejos Gonzalo'), ('Vallejos Sebastián'), ('Veron Jenifer'),
      ('Zubia Samira');
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sucursales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    lat REAL,
    lon REAL,
    radio_metros INTEGER NOT NULL DEFAULT 100
  );

  INSERT OR IGNORE INTO sucursales (nombre) VALUES
    ('Fraga'), ('Campbell'), ('Mendoza'), ('Avenida'),
    ('Donado'), ('Montevideo'), ('Terminal');

  CREATE TABLE IF NOT EXISTS asistencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    nombre TEXT,
    sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
    tipo TEXT CHECK(tipo IN ('entrada','salida')) NOT NULL,
    lat REAL,
    lon REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_asistencia_fecha
    ON asistencia(created_at DESC);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS connection_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
      NOT NULL DEFAULT 'disconnected',
    qr_string TEXT,
    phone TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

  CREATE TABLE IF NOT EXISTS pending_admin_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL UNIQUE REFERENCES conversations(id),
    report_text TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    content TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox(sent, created_at);

  CREATE TABLE IF NOT EXISTS flow_state (
    phone TEXT NOT NULL,
    flow TEXT NOT NULL,
    state TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (phone, flow)
  );

  CREATE TABLE IF NOT EXISTS asistencia_rechazada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    nombre TEXT,
    sucursal_id INTEGER REFERENCES sucursales(id),
    tipo TEXT CHECK(tipo IN ('entrada','salida')),
    lat REAL,
    lon REAL,
    distancia_metros INTEGER,
    motivo TEXT NOT NULL,
    resuelto INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_asistencia_rechazada_pendientes
    ON asistencia_rechazada(resuelto, created_at DESC);

  CREATE TABLE IF NOT EXISTS lid_phone (
    lid TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Migración: la tabla se creó originalmente con sucursal_id/tipo/lat/lon
// NOT NULL (pensada solo para rechazos por ubicación). Ahora también registra
// "celular no registrado" y "jid no autorizado", que no tienen esos datos, así
// que hay que relajar las constraints. La tabla es chica (registros de días),
// así que un rename+copy+drop es seguro y barato.
try {
  const cols = db.prepare("PRAGMA table_info(asistencia_rechazada)").all() as { name: string; notnull: number }[];
  const latCol = cols.find((c) => c.name === "lat");
  if (latCol && latCol.notnull === 1) {
    withTransaction(() => {
      db.exec("ALTER TABLE asistencia_rechazada RENAME TO asistencia_rechazada_old");
      db.exec(`
        CREATE TABLE asistencia_rechazada (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT NOT NULL,
          nombre TEXT,
          sucursal_id INTEGER REFERENCES sucursales(id),
          tipo TEXT CHECK(tipo IN ('entrada','salida')),
          lat REAL,
          lon REAL,
          distancia_metros INTEGER,
          motivo TEXT NOT NULL,
          resuelto INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      db.exec(`
        INSERT INTO asistencia_rechazada
          (id, phone, nombre, sucursal_id, tipo, lat, lon, distancia_metros, motivo, resuelto, created_at)
        SELECT id, phone, nombre, sucursal_id, tipo, lat, lon, distancia_metros, motivo, resuelto, created_at
        FROM asistencia_rechazada_old;
      `);
      db.exec("DROP TABLE asistencia_rechazada_old");
    });
  }
} catch (err) {
  console.error("[db] Error migrando asistencia_rechazada:", err);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationWithPreview extends Conversation {
  last_message_preview: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

export interface ConnectionState {
  id: 1;
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null;
  phone: string | null;
  updated_at: number;
}

export interface OutboxItem {
  id: number;
  conversation_id: number;
  phone: string;
  content: string;
  sent: number;
  created_at: number;
}

// ── Conversations ────────────────────────────────────────────────────────────

const stmtGetConvByPhone = db.prepare(
  "SELECT * FROM conversations WHERE phone = ?"
);
const stmtInsertConv = db.prepare(
  "INSERT INTO conversations (phone, name) VALUES (?, ?) RETURNING *"
);
const stmtUpdateName = db.prepare(
  "UPDATE conversations SET name = ? WHERE id = ?"
);

export function getOrCreateConversation(
  phone: string,
  name?: string | null
): Conversation {
  let conv = stmtGetConvByPhone.get(phone) as unknown as Conversation | undefined;
  if (!conv) {
    conv = stmtInsertConv.get(phone, name ?? null) as unknown as Conversation;
  } else if (name && name !== conv.name) {
    stmtUpdateName.run(name, conv.id);
    conv = { ...conv, name };
  }
  return conv;
}

const stmtGetConvById = db.prepare(
  "SELECT * FROM conversations WHERE id = ?"
);

export function getConversationById(id: number): Conversation | null {
  return (stmtGetConvById.get(id) as unknown as Conversation | undefined) ?? null;
}

export function listConversations(): ConversationWithPreview[] {
  return db
    .prepare(
      `SELECT c.*,
        (SELECT content FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1) AS last_message_preview
       FROM conversations c
       ORDER BY c.last_message_at DESC, c.created_at DESC`
    )
    .all() as unknown as ConversationWithPreview[];
}

function withTransaction(fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function setMode(conversationId: number, mode: "AI" | "HUMAN"): void {
  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(
    mode,
    conversationId
  );
}

export function deleteConversation(id: number): void {
  withTransaction(() => {
    db.prepare(
      "DELETE FROM outbox WHERE conversation_id = ? AND sent = 0"
    ).run(id);
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

const insertMsg = db.prepare(
  "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
);
const updateLastMsg = db.prepare(
  "UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?"
);

export function insertMessage(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): void {
  withTransaction(() => {
    insertMsg.run(conversationId, role, content);
    updateLastMsg.run(conversationId);
  });
}

export function getMessages(
  conversationId: number,
  limit = 50
): Message[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(conversationId, limit) as unknown as Message[];
  return rows.reverse();
}

export function getRecentHistory(
  conversationId: number,
  limit = 20
): Message[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(conversationId, limit) as unknown as Message[];
  return rows.reverse();
}

// ── Connection state ─────────────────────────────────────────────────────────

export function getConnectionState(): ConnectionState {
  return db
    .prepare("SELECT * FROM connection_state WHERE id = 1")
    .get() as unknown as ConnectionState;
}

export function setConnectionState(patch: {
  status?: ConnectionState["status"];
  qr_string?: string | null;
  phone?: string | null;
}): void {
  const current = getConnectionState();
  const next = {
    status: patch.status ?? current.status,
    qr_string: patch.qr_string !== undefined ? patch.qr_string : current.qr_string,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
  };
  db.prepare(
    `UPDATE connection_state
     SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch()
     WHERE id = 1`
  ).run(next.status, next.qr_string, next.phone);
}

// ── Outbox ───────────────────────────────────────────────────────────────────

export function enqueueOutbox(
  conversationId: number,
  phone: string,
  content: string
): void {
  db.prepare(
    "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
  ).run(conversationId, phone, content);
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return db
    .prepare(
      "SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?"
    )
    .all(limit) as unknown as OutboxItem[];
}

export function markOutboxSent(id: number): void {
  db.prepare("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

// ── Pending admin reports ────────────────────────────────────────────────────

export function setPendingAdminReport(conversationId: number, reportText: string): void {
  db.prepare(
    `INSERT INTO pending_admin_reports (conversation_id, report_text)
     VALUES (?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET report_text = excluded.report_text, created_at = unixepoch()`
  ).run(conversationId, reportText);
}

export function getPendingAdminReport(conversationId: number): string | null {
  const row = db
    .prepare("SELECT report_text FROM pending_admin_reports WHERE conversation_id = ?")
    .get(conversationId) as { report_text: string } | undefined;
  return row?.report_text ?? null;
}

export function clearPendingAdminReport(conversationId: number): void {
  db.prepare("DELETE FROM pending_admin_reports WHERE conversation_id = ?").run(conversationId);
}

// ── Estado de flujos conversacionales (persistente) ───────────────────────────
// Guarda el paso en el que va un teléfono dentro de un flujo (asistencia / rrhh)
// para que un reinicio del bot no corte a quien está a mitad de camino.

export function getFlowState<T>(phone: string, flow: string, maxAgeSec?: number): T | null {
  const row = db
    .prepare("SELECT state, updated_at FROM flow_state WHERE phone = ? AND flow = ?")
    .get(phone, flow) as { state: string; updated_at: number } | undefined;
  if (!row) return null;
  if (maxAgeSec !== undefined && Date.now() / 1000 - row.updated_at > maxAgeSec) {
    deleteFlowState(phone, flow);
    return null;
  }
  try {
    return JSON.parse(row.state) as T;
  } catch {
    deleteFlowState(phone, flow);
    return null;
  }
}

export function setFlowState(phone: string, flow: string, state: unknown): void {
  db.prepare(
    `INSERT INTO flow_state (phone, flow, state, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(phone, flow) DO UPDATE SET state = excluded.state, updated_at = unixepoch()`
  ).run(phone, flow, JSON.stringify(state));
}

export function deleteFlowState(phone: string, flow: string): void {
  db.prepare("DELETE FROM flow_state WHERE phone = ? AND flow = ?").run(phone, flow);
}

// ── Mapa lid → teléfono real (persistente) ──────────────────────────────────
// WhatsApp a veces direcciona a un contacto por un "lid" (identificador interno,
// no el número) en vez de su JID real. Baileys a veces informa el número real
// junto al mensaje (`senderPn`) o vía el evento `contacts.upsert` — pero no
// siempre, y de forma inconsistente para el mismo contacto con el tiempo. Antes
// esa traducción vivía SOLO en memoria y se perdía en cada reinicio de PM2; acá
// se aprende una sola vez (la primera vez que se conoce) y queda para siempre,
// así no dependemos de que WhatsApp la vuelva a mandar.

export function getLidPhone(lid: string): string | null {
  const row = db.prepare("SELECT phone FROM lid_phone WHERE lid = ?").get(lid) as { phone: string } | undefined;
  return row?.phone ?? null;
}

export function upsertLidPhone(lid: string, phone: string): void {
  withTransaction(() => {
    db.prepare(
      `INSERT INTO lid_phone (lid, phone, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(lid) DO UPDATE SET phone = excluded.phone, updated_at = unixepoch()`
    ).run(lid, phone);
    // Si algún empleado quedó vinculado con el lid crudo (porque en el momento
    // de vincularse todavía no se conocía su teléfono real), migrarlo ahora que
    // sí lo conocemos — si no, se queda con el "no autorizado" para siempre
    // aunque el bot ya sepa perfectamente quién es (caso Leticia Galasso, ver
    // conversación 2026-08-03).
    db.prepare("UPDATE empleados SET jid = ? WHERE jid = ?").run(phone, lid);
  });
}

// ── Empleados ────────────────────────────────────────────────────────────────

export interface Empleado {
  id: number;
  nombre: string;
  celular: string | null;
  jid: string | null;
  activo: number;
  created_at: number;
}

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

// Subset: todas las palabras del más corto están en el más largo (para nombres
// escritos sin segundo nombre/apellido, ej. "Sol Ruiz Díaz" vs "Ruiz Diaz Sol
// Evangelina" en la nómina).
function subsetWords(a: string[], b: string[]): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length > 0 && shorter.every((w) => longer.includes(w));
}

export function validarEmpleadoDB(input: string): string | null {
  const target = normalizeNombre(input);
  if (target.length === 0) return null;
  const empleados = db.prepare("SELECT nombre FROM empleados WHERE activo = 1").all() as { nombre: string }[];

  const exactas = empleados.filter((e) => sameWords(normalizeNombre(e.nombre), target));
  if (exactas.length === 1) return exactas[0].nombre;
  if (exactas.length > 1) return null; // ambiguo, no debería pasar con nombres exactos iguales

  const parciales = empleados.filter((e) => subsetWords(normalizeNombre(e.nombre), target));
  if (parciales.length === 1) return parciales[0].nombre;
  return null; // sin match o ambiguo entre varios candidatos parciales
}

// ── Matching aproximado (para nombres mal tipeados) ─────────────────────────
// Se usa solo cuando validarEmpleadoDB (exacto/subset) no encontró nada — para
// sugerir "¿sos Fulano?" en vez de rechazar directo por una letra de más/menos
// (ej. "Villaruel" vs "Villareal" en la nómina).

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Tolerancia según largo de palabra: las cortas casi no toleran error (para no
// confundir "Ana" con "Ale"), las largas sí (para tolerar 1-2 letras mal).
function umbralPalabra(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

function palabrasParecidas(a: string, b: string): boolean {
  if (a === b) return true;
  const umbral = Math.min(umbralPalabra(a.length), umbralPalabra(b.length));
  return levenshtein(a, b) <= umbral;
}

function subsetParecido(shorter: string[], longer: string[]): boolean {
  return shorter.length > 0 && shorter.every((w) => longer.some((lw) => palabrasParecidas(w, lw)));
}

export function buscarEmpleadoParecido(input: string): string | null {
  const target = normalizeNombre(input);
  if (target.length === 0) return null;
  const empleados = db.prepare("SELECT nombre FROM empleados WHERE activo = 1").all() as { nombre: string }[];

  const candidatos = empleados.filter((e) => {
    const palabras = normalizeNombre(e.nombre);
    const [shorter, longer] = target.length <= palabras.length ? [target, palabras] : [palabras, target];
    return subsetParecido(shorter, longer);
  });

  if (candidatos.length === 1) return candidatos[0].nombre;
  return null; // nada suficientemente parecido, o ambiguo entre varios candidatos
}

export function listEmpleados(): Empleado[] {
  return db.prepare("SELECT * FROM empleados ORDER BY nombre ASC").all() as unknown as Empleado[];
}

export function insertEmpleado(nombre: string, celular?: string): void {
  db.prepare("INSERT INTO empleados (nombre, celular) VALUES (?, ?)").run(nombre, celular ?? null);
}

export function updateEmpleado(id: number, patch: { nombre?: string; celular?: string | null; jid?: string | null; activo?: number }): void {
  const current = db.prepare("SELECT * FROM empleados WHERE id = ?").get(id) as unknown as Empleado | undefined;
  if (!current) return;
  db.prepare("UPDATE empleados SET nombre = ?, celular = ?, jid = ?, activo = ? WHERE id = ?").run(
    patch.nombre ?? current.nombre,
    patch.celular !== undefined ? patch.celular : current.celular,
    patch.jid !== undefined ? patch.jid : current.jid,
    patch.activo !== undefined ? patch.activo : current.activo,
    id
  );
}

export function deleteEmpleado(id: number): void {
  db.prepare("DELETE FROM empleados WHERE id = ?").run(id);
}

export function getEmpleadoById(id: number): Empleado | null {
  return (
    db.prepare("SELECT * FROM empleados WHERE id = ?").get(id) as unknown as Empleado | undefined
  ) ?? null;
}

function normalizeNombre(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export function getEmpleadoByNombre(nombre: string): Empleado | null {
  // Match por palabras sin importar el orden ("Nombre Apellido" vs "Apellido Nombre",
  // como está cargada la nómina) y sin distinguir acentos.
  const target = normalizeNombre(nombre);
  if (target.length === 0) return null;
  const activos = db.prepare("SELECT * FROM empleados WHERE activo = 1").all() as unknown as Empleado[];
  const match = activos.find((e) => {
    const words = normalizeNombre(e.nombre);
    return words.length === target.length && words.every((w, i) => w === target[i]);
  });
  return match ?? null;
}

export function getEmpleadoByJid(jid: string): Empleado | null {
  return (
    db.prepare("SELECT * FROM empleados WHERE jid = ? AND activo = 1").get(jid) as unknown as Empleado | undefined
  ) ?? null;
}

export function vincularEmpleadoJid(id: number, jid: string): void {
  db.prepare("UPDATE empleados SET jid = ? WHERE id = ?").run(jid, id);
}

export function desvincularEmpleadoJid(id: number): void {
  db.prepare("UPDATE empleados SET jid = NULL WHERE id = ?").run(id);
}

// ── Sucursales ────────────────────────────────────────────────────────────────

export interface Sucursal {
  id: number;
  nombre: string;
  lat: number | null;
  lon: number | null;
  radio_metros: number;
}

export function listSucursales(): Sucursal[] {
  return db.prepare("SELECT * FROM sucursales ORDER BY id").all() as unknown as Sucursal[];
}

export function getSucursalById(id: number): Sucursal | null {
  return (db.prepare("SELECT * FROM sucursales WHERE id = ?").get(id) as unknown as Sucursal | undefined) ?? null;
}

export function getSucursalByNombre(nombre: string): Sucursal | null {
  return (
    db.prepare("SELECT * FROM sucursales WHERE LOWER(nombre) = LOWER(?)").get(nombre) as unknown as Sucursal | undefined
  ) ?? null;
}

export function updateSucursal(
  id: number,
  patch: { lat?: number | null; lon?: number | null; radio_metros?: number }
): void {
  const current = getSucursalById(id);
  if (!current) return;
  db.prepare(
    "UPDATE sucursales SET lat = ?, lon = ?, radio_metros = ? WHERE id = ?"
  ).run(
    patch.lat !== undefined ? patch.lat : current.lat,
    patch.lon !== undefined ? patch.lon : current.lon,
    patch.radio_metros !== undefined ? patch.radio_metros : current.radio_metros,
    id
  );
}

// ── Asistencia ───────────────────────────────────────────────────────────────

export interface AsistenciaRecord {
  id: number;
  phone: string;
  nombre: string | null;
  celular: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  tipo: "entrada" | "salida";
  lat: number | null;
  lon: number | null;
  created_at: number;
}

export function insertAsistencia(
  phone: string,
  nombre: string | null,
  sucursal_id: number,
  tipo: "entrada" | "salida",
  lat: number,
  lon: number
): void {
  db.prepare(
    "INSERT INTO asistencia (phone, nombre, sucursal_id, tipo, lat, lon) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(phone, nombre, sucursal_id, tipo, lat, lon);
}

// Carga manual desde el dashboard (sin GPS) — para cuando el bot de WhatsApp
// no puede confirmar la marcación (ej: restricción temporal de WhatsApp).
// `createdAt` (unixepoch, opcional) permite cargar retroactivamente con la
// fecha/hora real del evento en vez de la hora en la que se carga el dato.
export function insertAsistenciaManual(
  empleadoId: number,
  sucursal_id: number,
  tipo: "entrada" | "salida",
  createdAt?: number
): void {
  const empleado = getEmpleadoById(empleadoId);
  if (!empleado) throw new Error("Empleado no encontrado");
  if (createdAt !== undefined) {
    db.prepare(
      "INSERT INTO asistencia (phone, nombre, sucursal_id, tipo, lat, lon, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)"
    ).run(empleado.celular ?? "manual", empleado.nombre, sucursal_id, tipo, createdAt);
  } else {
    db.prepare(
      "INSERT INTO asistencia (phone, nombre, sucursal_id, tipo, lat, lon) VALUES (?, ?, ?, ?, NULL, NULL)"
    ).run(empleado.celular ?? "manual", empleado.nombre, sucursal_id, tipo);
  }
}

export function listAsistencia(filters?: {
  sucursal?: string;
  tipo?: string;
  fecha?: string;
  desde?: string;
  hasta?: string;
  nombres?: string[];
}): AsistenciaRecord[] {
  let query = `
    SELECT a.*, s.nombre AS sucursal_nombre, e.celular AS celular
    FROM asistencia a
    JOIN sucursales s ON s.id = a.sucursal_id
    LEFT JOIN empleados e ON LOWER(TRIM(e.nombre)) = LOWER(TRIM(a.nombre))
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.sucursal) {
    query += " AND LOWER(s.nombre) = LOWER(?)";
    params.push(filters.sucursal);
  }
  if (filters?.tipo) {
    query += " AND a.tipo = ?";
    params.push(filters.tipo);
  }
  if (filters?.fecha) {
    // '-3 hours' = zona AR (UTC-3) fija. NO usar 'localtime': depende de la TZ
    // del sistema y un VPS suele estar en UTC → agruparía los días mal.
    // Argentina no aplica horario de verano, así que el offset es estable.
    query += " AND date(a.created_at, 'unixepoch', '-3 hours') = ?";
    params.push(filters.fecha);
  }
  if (filters?.desde) {
    query += " AND date(a.created_at, 'unixepoch', '-3 hours') >= ?";
    params.push(filters.desde);
  }
  if (filters?.hasta) {
    query += " AND date(a.created_at, 'unixepoch', '-3 hours') <= ?";
    params.push(filters.hasta);
  }
  if (filters?.nombres && filters.nombres.length > 0) {
    query += ` AND a.nombre IN (${filters.nombres.map(() => "?").join(",")})`;
    params.push(...filters.nombres);
  }
  query += " ORDER BY a.created_at DESC LIMIT 500";

  return db.prepare(query).all(...params) as unknown as AsistenciaRecord[];
}

export function deleteAsistencia(id: number): void {
  db.prepare("DELETE FROM asistencia WHERE id = ?").run(id);
}

export function deleteAsistenciaMany(ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(`DELETE FROM asistencia WHERE id IN (${placeholders})`).run(...ids);
}

// ── Intentos de marcación con problemas ─────────────────────────────────────
// Cubre varios motivos por los que un intento de marcación no llega a
// registrarse en `asistencia`, para que Administración los revise y decida si
// hay que corregir algo (coordenadas, número de celular, vínculo de WhatsApp)
// y aprobar el intento manualmente:
//   - fuera_de_rango / sucursal_sin_gps: falló la validación GPS (trae lat/lon/tipo)
//   - celular_no_registrado: el empleado existe en la nómina pero sin celular cargado
//   - jid_no_autorizado: intentó marcar con un WhatsApp distinto al vinculado
// Los dos últimos no llegan a la pregunta de ubicación, así que sucursal/tipo/
// lat/lon pueden venir incompletos — por eso son nullable.

export interface AsistenciaRechazada {
  id: number;
  phone: string;
  nombre: string | null;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  tipo: "entrada" | "salida" | null;
  lat: number | null;
  lon: number | null;
  distancia_metros: number | null;
  motivo: string;
  resuelto: number;
  created_at: number;
}

export function insertAsistenciaRechazada(params: {
  phone: string;
  nombre: string | null;
  sucursal_id: number | null;
  tipo?: "entrada" | "salida" | null;
  lat?: number | null;
  lon?: number | null;
  distancia_metros?: number | null;
  motivo: string;
}): void {
  db.prepare(
    `INSERT INTO asistencia_rechazada
      (phone, nombre, sucursal_id, tipo, lat, lon, distancia_metros, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.phone,
    params.nombre,
    params.sucursal_id,
    params.tipo ?? null,
    params.lat ?? null,
    params.lon ?? null,
    params.distancia_metros ?? null,
    params.motivo
  );
}

export function listAsistenciaRechazada(soloPendientes = true): AsistenciaRechazada[] {
  let query = `
    SELECT r.*, s.nombre AS sucursal_nombre
    FROM asistencia_rechazada r
    LEFT JOIN sucursales s ON s.id = r.sucursal_id
  `;
  if (soloPendientes) query += " WHERE r.resuelto = 0";
  query += " ORDER BY r.created_at DESC LIMIT 200";
  return db.prepare(query).all() as unknown as AsistenciaRechazada[];
}

// Aprueba el intento: lo inserta en `asistencia` (con la fecha/hora real del
// intento, no la de ahora) y lo marca resuelto para que no vuelva a aparecer
// como pendiente. Requiere que el intento tenga sucursal y tipo (los casos sin
// GPS —celular no registrado, jid no autorizado— no los tienen: para esos hay
// que resolver la causa de fondo, ej. cargar el celular en Empleados, y
// descartar la alerta).
export function aprobarAsistenciaRechazada(id: number): void {
  const row = db
    .prepare("SELECT * FROM asistencia_rechazada WHERE id = ?")
    .get(id) as unknown as AsistenciaRechazada | undefined;
  if (!row) throw new Error("Intento no encontrado");
  if (!row.sucursal_id || !row.tipo) {
    throw new Error("Este intento no tiene sucursal/tipo definidos — no se puede aprobar directamente.");
  }
  withTransaction(() => {
    db.prepare(
      "INSERT INTO asistencia (phone, nombre, sucursal_id, tipo, lat, lon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(row.phone, row.nombre, row.sucursal_id, row.tipo, row.lat, row.lon, row.created_at);
    db.prepare("UPDATE asistencia_rechazada SET resuelto = 1 WHERE id = ?").run(id);
  });
}

export function descartarAsistenciaRechazada(id: number): void {
  db.prepare("UPDATE asistencia_rechazada SET resuelto = 1 WHERE id = ?").run(id);
}

// ── Marcaciones sin terminar (flujo abandonado a mitad de camino) ──────────
// No es un "rechazo": el empleado escaneó el QR y arrancó el flujo pero nunca
// llegó a mandar la ubicación (o ni siquiera terminó de decir su nombre). El
// estado vive en `flow_state` (ver getFlowState/setFlowState) y se limpia solo
// cuando la persona vuelve a escribir después del TTL — mientras tanto, listar
// esa tabla es la forma más simple de ver quién quedó a mitad de camino.

export interface AttendancePendiente {
  phone: string;
  step: "nombre" | "tipo" | "location";
  sucursalNombre: string | null;
  nombre: string | null;
  tipo: "entrada" | "salida" | null;
  updated_at: number;
}

export function listAttendancePendientes(): AttendancePendiente[] {
  const rows = db
    .prepare("SELECT phone, state, updated_at FROM flow_state WHERE flow = 'attendance' ORDER BY updated_at DESC")
    .all() as { phone: string; state: string; updated_at: number }[];
  return rows.map((r) => {
    let parsed: { sucursalNombre?: string; step?: string; nombre?: string; tipo?: "entrada" | "salida" } = {};
    try {
      parsed = JSON.parse(r.state);
    } catch {
      // ignorar filas corruptas
    }
    return {
      phone: r.phone,
      step: (parsed.step as AttendancePendiente["step"]) ?? "nombre",
      sucursalNombre: parsed.sucursalNombre ?? null,
      nombre: parsed.nombre ?? null,
      tipo: parsed.tipo ?? null,
      updated_at: r.updated_at,
    };
  });
}

// ── Horas trabajadas ────────────────────────────────────────────────────────
// Empareja cada "entrada" con la siguiente "salida" cronológica del mismo
// empleado (sin importar el día, para cubrir turnos que cruzan medianoche).
// Una "salida" sin "entrada" previa es un dato huérfano y se descarta; una
// "entrada" sin "salida" posterior queda marcada como turno en curso.

export interface Turno {
  nombre: string;
  sucursal_nombre: string;
  entrada_at: number;
  salida_at: number | null;
  horas: number | null;
}

export function calcularHorasTrabajadas(filters?: {
  desde?: string;
  hasta?: string;
  sucursal?: string;
  nombres?: string[];
}): Turno[] {
  let query = `
    SELECT a.*, s.nombre AS sucursal_nombre
    FROM asistencia a
    JOIN sucursales s ON s.id = a.sucursal_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.desde) {
    query += " AND date(a.created_at, 'unixepoch', '-3 hours') >= ?";
    params.push(filters.desde);
  }
  if (filters?.hasta) {
    query += " AND date(a.created_at, 'unixepoch', '-3 hours') <= ?";
    params.push(filters.hasta);
  }
  if (filters?.sucursal) {
    query += " AND LOWER(s.nombre) = LOWER(?)";
    params.push(filters.sucursal);
  }
  if (filters?.nombres && filters.nombres.length > 0) {
    query += ` AND a.nombre IN (${filters.nombres.map(() => "?").join(",")})`;
    params.push(...filters.nombres);
  }
  query += " ORDER BY a.nombre ASC, a.created_at ASC";

  const rows = db.prepare(query).all(...params) as unknown as AsistenciaRecord[];

  const porEmpleado = new Map<string, AsistenciaRecord[]>();
  for (const r of rows) {
    const key = r.nombre ?? r.phone;
    if (!porEmpleado.has(key)) porEmpleado.set(key, []);
    porEmpleado.get(key)!.push(r);
  }

  const turnos: Turno[] = [];
  for (const [nombre, regs] of porEmpleado) {
    let pendiente: AsistenciaRecord | null = null;
    for (const r of regs) {
      if (r.tipo === "entrada") {
        if (pendiente) turnos.push(aTurno(nombre, pendiente, null));
        pendiente = r;
      } else if (pendiente) {
        turnos.push(aTurno(nombre, pendiente, r));
        pendiente = null;
      }
      // salida sin entrada previa: dato huérfano, se ignora
    }
    if (pendiente) turnos.push(aTurno(nombre, pendiente, null));
  }

  return turnos;
}

function aTurno(nombre: string, entrada: AsistenciaRecord, salida: AsistenciaRecord | null): Turno {
  return {
    nombre,
    sucursal_nombre: entrada.sucursal_nombre,
    entrada_at: entrada.created_at,
    salida_at: salida?.created_at ?? null,
    horas: salida ? (salida.created_at - entrada.created_at) / 3600 : null,
  };
}

export default db;
