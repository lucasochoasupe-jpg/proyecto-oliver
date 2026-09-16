// node:sqlite es nativo en Node.js 22.5+ (estable en Node 24) — sin compilación nativa
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const LEGAJOS_DIR = path.join(DATA_DIR, "legajos");

const DB_PATH = path.join(DATA_DIR, "messages.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

// Migraciones
try { db.exec("ALTER TABLE empleados ADD COLUMN jid TEXT"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN celular TEXT"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN tipo_pago TEXT"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN sueldo_mensual REAL"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN valor_hora REAL"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN valor_dia REAL"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN fecha_ingreso TEXT"); } catch {}
try { db.exec("ALTER TABLE empleados ADD COLUMN sueldo_estimado REAL"); } catch {}
try { db.exec("ALTER TABLE ausencias_reportadas ADD COLUMN sucursal TEXT"); } catch {}
try { db.exec("ALTER TABLE ausencias_reportadas ADD COLUMN nota TEXT"); } catch {}

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

  CREATE TABLE IF NOT EXISTS certificados_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    phone TEXT NOT NULL,
    nombre TEXT,
    admin_message_id INTEGER REFERENCES messages(id),
    resuelto INTEGER NOT NULL DEFAULT 0,
    resuelto_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_certificados_pendientes_activo
    ON certificados_pendientes(phone, resuelto);

  CREATE TABLE IF NOT EXISTS ausencias_reportadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    certificado_pendiente INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    admin_message_id INTEGER REFERENCES messages(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_ausencias_reportadas_rango
    ON ausencias_reportadas(empleado_nombre, fecha_inicio, fecha_fin);

  CREATE TABLE IF NOT EXISTS legajo_archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id),
    nombre_original TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    tamanio_bytes INTEGER NOT NULL,
    origen TEXT CHECK(origen IN ('certificado_bot', 'manual')) NOT NULL,
    certificado_pendiente_id INTEGER REFERENCES certificados_pendientes(id),
    subido_por TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_legajo_archivos_empleado
    ON legajo_archivos(empleado_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS adelantos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id),
    fecha TEXT NOT NULL,
    monto REAL NOT NULL,
    nota TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_adelantos_empleado_fecha
    ON adelantos(empleado_id, fecha);

  CREATE TABLE IF NOT EXISTS lid_phone (
    lid TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS horarios_empleado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id),
    sucursal_id INTEGER REFERENCES sucursales(id),
    dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 0 AND 6),
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    tolerancia_min INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_horarios_empleado
    ON horarios_empleado(empleado_id, dia_semana);

  CREATE TABLE IF NOT EXISTS turnos_puntuales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id),
    sucursal_id INTEGER REFERENCES sucursales(id),
    fecha TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    tolerancia_min INTEGER,
    nota TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_turnos_puntuales_empleado_fecha
    ON turnos_puntuales(empleado_id, fecha);

  CREATE TABLE IF NOT EXISTS turno_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    dias_semana TEXT,
    tolerancia_min INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tolerancia_min INTEGER NOT NULL DEFAULT 30
  );

  INSERT OR IGNORE INTO settings (id, tolerancia_min) VALUES (1, 30);
`);

try { db.exec("ALTER TABLE turno_templates ADD COLUMN dias_semana TEXT"); } catch {}
try { db.exec("ALTER TABLE turno_templates ADD COLUMN tolerancia_min INTEGER"); } catch {}
try { db.exec("ALTER TABLE horarios_empleado ADD COLUMN tolerancia_min INTEGER"); } catch {}

// Migración: sucursal_id se creó NOT NULL (los turnos comparaban sucursal
// contra la marcación real). Ahora la comparación es solo empleado + día +
// hora, sin importar dónde marcó — sucursal_id queda opcional. Tabla chica,
// rename+copy+drop es seguro y barato (mismo patrón que asistencia_rechazada).
try {
  const cols = db.prepare("PRAGMA table_info(horarios_empleado)").all() as { name: string; notnull: number }[];
  const sucursalCol = cols.find((c) => c.name === "sucursal_id");
  if (sucursalCol && sucursalCol.notnull === 1) {
    withTransaction(() => {
      db.exec("ALTER TABLE horarios_empleado RENAME TO horarios_empleado_old");
      db.exec(`
        CREATE TABLE horarios_empleado (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          empleado_id INTEGER NOT NULL REFERENCES empleados(id),
          sucursal_id INTEGER REFERENCES sucursales(id),
          dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 0 AND 6),
          hora_inicio TEXT NOT NULL,
          hora_fin TEXT NOT NULL,
          tolerancia_min INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      db.exec(`
        INSERT INTO horarios_empleado
          (id, empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min, created_at)
        SELECT id, empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min, created_at
        FROM horarios_empleado_old;
      `);
      db.exec("DROP TABLE horarios_empleado_old");
      db.exec("CREATE INDEX IF NOT EXISTS idx_horarios_empleado ON horarios_empleado(empleado_id, dia_semana)");
    });
  }
} catch (err) {
  console.error("[db] Error migrando horarios_empleado:", err);
}

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

function withTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
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

export function insertMessageReturningId(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): number {
  return withTransaction(() => {
    const info = insertMsg.run(conversationId, role, content);
    updateLastMsg.run(conversationId);
    return Number(info.lastInsertRowid);
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

// ── Certificados médicos pendientes ─────────────────────────────────────────
// Se crea uno cuando un empleado avisa una Enfermedad "sin certificado". Queda
// abierto (resuelto = 0) hasta que ese mismo teléfono manda un archivo por
// WhatsApp (ver handleMediaForward), momento en que se cierra automáticamente
// y se avisa a Administración que ese archivo corresponde a ese aviso.

export interface CertificadoPendiente {
  id: number;
  conversation_id: number;
  phone: string;
  nombre: string | null;
  admin_message_id: number | null;
  created_at: number;
}

export function crearCertificadoPendiente(
  conversationId: number,
  phone: string,
  nombre: string,
  adminMessageId: number | null
): void {
  db.prepare(
    `INSERT INTO certificados_pendientes (conversation_id, phone, nombre, admin_message_id)
     VALUES (?, ?, ?, ?)`
  ).run(conversationId, phone, nombre, adminMessageId);
}

// Todos los pendientes abiertos de ese teléfono (puede haber más de uno si el
// empleado avisó varias Enfermedades "sin certificado" sin resolver ninguna
// todavía) — más viejo primero. Se usa para el submenú "Entregar certificado
// pendiente", donde el empleado tiene que elegir/confirmar explícitamente
// cuál está entregando antes de que se lo dé por resuelto.
export function listCertificadosPendientesActivos(phone: string): CertificadoPendiente[] {
  return db
    .prepare(
      `SELECT id, conversation_id, phone, nombre, admin_message_id, created_at
       FROM certificados_pendientes
       WHERE phone = ? AND resuelto = 0
       ORDER BY created_at ASC`
    )
    .all(phone) as unknown as CertificadoPendiente[];
}

export function getCertificadoPendientePorId(id: number): CertificadoPendiente | null {
  return (
    (db
      .prepare(
        `SELECT id, conversation_id, phone, nombre, admin_message_id, created_at
         FROM certificados_pendientes WHERE id = ?`
      )
      .get(id) as CertificadoPendiente | undefined) ?? null
  );
}

// Cierra ESE pendiente puntual (por id, no "el más reciente del teléfono" —
// un mismo teléfono puede tener varios abiertos a la vez) y lo devuelve, para
// que el caller pueda avisarle a Administración cuál aviso quedó resuelto.
export function resolverCertificadoPendientePorId(id: number): CertificadoPendiente | null {
  const row = getCertificadoPendientePorId(id);
  if (!row) return null;
  db.prepare(
    "UPDATE certificados_pendientes SET resuelto = 1, resuelto_at = unixepoch() WHERE id = ?"
  ).run(id);
  return row;
}

// ── Ausencias reportadas por el empleado ────────────────────────────────────
// Se crea un registro cuando el empleado, dentro del flujo de RRHH, confirma
// un rango de fechas para un aviso de Enfermedad / Motivo Personal /
// Vacaciones (Urgencia no tiene rango de fechas, no genera registro acá). La
// liquidación de sueldos (calcularAusencias) usa esto para no descontar como
// ausencia injustificada un día que el empleado sí avisó.

export interface AusenciaReportada {
  id: number;
  empleado_nombre: string;
  categoria: string;
  fecha_inicio: string;
  fecha_fin: string;
  certificado_pendiente: number;
  phone: string | null;
  sucursal: string | null;
  nota: string | null;
  admin_message_id: number | null;
  created_at: number;
}

export function crearAusenciaReportada(data: {
  empleadoNombre: string;
  categoria: string;
  fechaInicio: string;
  fechaFin: string;
  certificadoPendiente: boolean;
  phone: string;
  adminMessageId: number | null;
  sucursal?: string | null;
  nota?: string | null;
}): number {
  const info = db
    .prepare(
      `INSERT INTO ausencias_reportadas
         (empleado_nombre, categoria, fecha_inicio, fecha_fin, certificado_pendiente, phone, admin_message_id, sucursal, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.empleadoNombre,
      data.categoria,
      data.fechaInicio,
      data.fechaFin,
      data.certificadoPendiente ? 1 : 0,
      data.phone,
      data.adminMessageId,
      data.sucursal ?? null,
      data.nota ?? null
    );
  return Number(info.lastInsertRowid);
}

// Cargas manuales (hechas por el admin desde el panel de RRHH, no por el bot)
// — se distinguen porque no tienen admin_message_id (el bot siempre lo setea,
// ver rrhh-flow.ts). El panel de RRHH las mezcla con los avisos del bot.
export function listAusenciasManuales(): AusenciaReportada[] {
  return db
    .prepare(
      `SELECT * FROM ausencias_reportadas WHERE admin_message_id IS NULL ORDER BY created_at DESC`
    )
    .all() as unknown as AusenciaReportada[];
}

export function eliminarAusenciaReportadaManual(id: number): boolean {
  const info = db.prepare("DELETE FROM ausencias_reportadas WHERE id = ? AND admin_message_id IS NULL").run(id);
  return info.changes > 0;
}

// Avisos cuyo rango [fecha_inicio, fecha_fin] se solapa con [desde, hasta].
function getAusenciasReportadas(desde: string, hasta: string): AusenciaReportada[] {
  return db
    .prepare(
      `SELECT id, empleado_nombre, categoria, fecha_inicio, fecha_fin, certificado_pendiente, phone, created_at
       FROM ausencias_reportadas
       WHERE fecha_inicio <= ? AND fecha_fin >= ?`
    )
    .all(hasta, desde) as unknown as AusenciaReportada[];
}

// ── Legajos (archivos por empleado) ──────────────────────────────────────────
// Cada empleado tiene una carpeta en data/legajos/<empleado_id>/ con los
// archivos físicos; la tabla legajo_archivos guarda los metadatos. Dos
// orígenes: "certificado_bot" (el bot lo guarda solo cuando el empleado
// confirmó el vínculo por el menú "[4] Entregar certificado pendiente" — ver
// esperandoCertificado en rrhh-flow.ts) y "manual" (un admin lo sube desde
// /legajos). Nunca se guarda de forma automática un archivo que no pasó por
// esa confirmación — mismo criterio que certificados_pendientes.

export interface LegajoArchivo {
  id: number;
  empleado_id: number;
  nombre_original: string;
  nombre_archivo: string;
  mimetype: string;
  tamanio_bytes: number;
  origen: "certificado_bot" | "manual";
  certificado_pendiente_id: number | null;
  subido_por: string | null;
  created_at: number;
}

function sanitizarNombreArchivo(nombre: string): string {
  const base = nombre.replace(/[/\\?%*:|"<>]/g, "_").slice(-150);
  return base.length > 0 ? base : "archivo";
}

export function carpetaLegajo(empleadoId: number): string {
  return path.join(LEGAJOS_DIR, String(empleadoId));
}

export function guardarLegajoArchivo(data: {
  empleadoId: number;
  nombreOriginal: string;
  buffer: Buffer;
  mimetype: string;
  origen: "certificado_bot" | "manual";
  certificadoPendienteId?: number | null;
  subidoPor?: string | null;
}): LegajoArchivo {
  const carpeta = carpetaLegajo(data.empleadoId);
  fs.mkdirSync(carpeta, { recursive: true });

  const nombreArchivo = `${Date.now()}-${sanitizarNombreArchivo(data.nombreOriginal)}`;
  fs.writeFileSync(path.join(carpeta, nombreArchivo), data.buffer);

  const info = db
    .prepare(
      `INSERT INTO legajo_archivos
         (empleado_id, nombre_original, nombre_archivo, mimetype, tamanio_bytes, origen, certificado_pendiente_id, subido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.empleadoId,
      data.nombreOriginal,
      nombreArchivo,
      data.mimetype,
      data.buffer.length,
      data.origen,
      data.certificadoPendienteId ?? null,
      data.subidoPor ?? null
    );

  return getLegajoArchivo(Number(info.lastInsertRowid))!;
}

export function listLegajoArchivos(empleadoId: number): LegajoArchivo[] {
  return db
    .prepare("SELECT * FROM legajo_archivos WHERE empleado_id = ? ORDER BY created_at DESC")
    .all(empleadoId) as unknown as LegajoArchivo[];
}

export function getLegajoArchivo(id: number): LegajoArchivo | null {
  return (db.prepare("SELECT * FROM legajo_archivos WHERE id = ?").get(id) as unknown as LegajoArchivo | undefined) ?? null;
}

export function rutaLegajoArchivo(archivo: LegajoArchivo): string {
  return path.join(carpetaLegajo(archivo.empleado_id), archivo.nombre_archivo);
}

export interface Adelanto {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  fecha: string;
  monto: number;
  nota: string | null;
  created_at: number;
}

export function crearAdelanto(data: { empleadoId: number; fecha: string; monto: number; nota?: string | null }): Adelanto {
  const info = db
    .prepare(`INSERT INTO adelantos (empleado_id, fecha, monto, nota) VALUES (?, ?, ?, ?)`)
    .run(data.empleadoId, data.fecha, data.monto, data.nota ?? null);
  return getAdelanto(Number(info.lastInsertRowid))!;
}

export function getAdelanto(id: number): Adelanto | null {
  return (
    (db
      .prepare(
        `SELECT a.*, e.nombre AS empleado_nombre
         FROM adelantos a JOIN empleados e ON e.id = a.empleado_id
         WHERE a.id = ?`
      )
      .get(id) as unknown as Adelanto | undefined) ?? null
  );
}

export function listAdelantos(filters: { desde?: string; hasta?: string; empleadoId?: number } = {}): Adelanto[] {
  const condiciones: string[] = [];
  const params: (string | number)[] = [];
  if (filters.desde) {
    condiciones.push("a.fecha >= ?");
    params.push(filters.desde);
  }
  if (filters.hasta) {
    condiciones.push("a.fecha <= ?");
    params.push(filters.hasta);
  }
  if (filters.empleadoId) {
    condiciones.push("a.empleado_id = ?");
    params.push(filters.empleadoId);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT a.*, e.nombre AS empleado_nombre
       FROM adelantos a JOIN empleados e ON e.id = a.empleado_id
       ${where}
       ORDER BY a.fecha DESC, a.created_at DESC`
    )
    .all(...params) as unknown as Adelanto[];
}

export function eliminarAdelanto(id: number): boolean {
  const info = db.prepare("DELETE FROM adelantos WHERE id = ?").run(id);
  return info.changes > 0;
}

const TOPE_ADELANTO_PORCENTAJE = 0.2;

// Base sobre la que se calcula el tope de adelantos: el sueldo mensual para
// empleados mensuales, o el sueldo estimado que carga el admin para empleados
// por hora/día (que no tienen un sueldo fijo del cual derivarlo).
function sueldoBaseParaAdelantos(emp: Empleado): number | null {
  return emp.tipo_pago === "mensual" ? emp.sueldo_mensual : emp.sueldo_estimado;
}

function limitesDelMes(fecha: string): { desde: string; hasta: string } {
  const [anio, mes] = fecha.split("-").map(Number);
  const desde = `${fecha.slice(0, 7)}-01`;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${fecha.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

export interface TopeAdelantoInfo {
  base: number | null; // sueldo (mensual o estimado) usado para calcular el tope; null si no está configurado
  limite: number | null; // 20% de la base
  usado: number; // suma de adelantos ya cargados en el mes de `fecha` (sin contar uno nuevo)
  disponible: number | null;
  excedido: boolean; // usado ya supera el límite, incluso antes de un nuevo adelanto
}

// Estado del tope del 20% mensual para un empleado, a la fecha dada — se usa
// tanto para validar un adelanto nuevo como para mostrarlo de referencia en el
// formulario antes de cargarlo.
export function calcularTopeAdelanto(empleadoId: number, fecha: string): TopeAdelantoInfo {
  const emp = getEmpleadoById(empleadoId);
  const base = emp ? sueldoBaseParaAdelantos(emp) : null;
  const limite = base !== null ? base * TOPE_ADELANTO_PORCENTAJE : null;
  const { desde, hasta } = limitesDelMes(fecha);
  const usado = listAdelantos({ empleadoId, desde, hasta }).reduce((acc, a) => acc + a.monto, 0);
  return {
    base,
    limite,
    usado,
    disponible: limite !== null ? limite - usado : null,
    excedido: limite !== null && usado > limite,
  };
}

export function eliminarLegajoArchivo(id: number): boolean {
  const archivo = getLegajoArchivo(id);
  if (!archivo) return false;
  try {
    fs.unlinkSync(rutaLegajoArchivo(archivo));
  } catch {
    // El archivo físico ya no estaba — igual borramos el registro.
  }
  db.prepare("DELETE FROM legajo_archivos WHERE id = ?").run(id);
  return true;
}

// Resumen para la lista principal de /legajos: un empleado por fila, con la
// cantidad de archivos y la fecha del más reciente.
export interface LegajoResumen {
  empleado_id: number;
  nombre: string;
  activo: number;
  cantidad_archivos: number;
  ultimo_archivo_at: number | null;
}

export function listLegajosResumen(): LegajoResumen[] {
  return db
    .prepare(
      `SELECT e.id AS empleado_id, e.nombre, e.activo,
              COUNT(l.id) AS cantidad_archivos,
              MAX(l.created_at) AS ultimo_archivo_at
       FROM empleados e
       LEFT JOIN legajo_archivos l ON l.empleado_id = e.id
       GROUP BY e.id
       ORDER BY e.nombre ASC`
    )
    .all() as unknown as LegajoResumen[];
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
  tipo_pago: "mensual" | "hora" | "dia" | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null;
  fecha_ingreso: string | null; // ISO (YYYY-MM-DD) — usada para calcular el saldo de vacaciones
  sueldo_estimado: number | null; // solo tipo 'hora'/'dia' — referencia para el tope de adelantos (no tienen sueldo_mensual)
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

export function updateEmpleado(
  id: number,
  patch: {
    nombre?: string;
    celular?: string | null;
    jid?: string | null;
    activo?: number;
    tipo_pago?: "mensual" | "hora" | "dia" | null;
    sueldo_mensual?: number | null;
    valor_hora?: number | null;
    valor_dia?: number | null;
    fecha_ingreso?: string | null;
    sueldo_estimado?: number | null;
  }
): void {
  const current = db.prepare("SELECT * FROM empleados WHERE id = ?").get(id) as unknown as Empleado | undefined;
  if (!current) return;
  db.prepare(
    "UPDATE empleados SET nombre = ?, celular = ?, jid = ?, activo = ?, tipo_pago = ?, sueldo_mensual = ?, valor_hora = ?, valor_dia = ?, fecha_ingreso = ?, sueldo_estimado = ? WHERE id = ?"
  ).run(
    patch.nombre ?? current.nombre,
    patch.celular !== undefined ? patch.celular : current.celular,
    patch.jid !== undefined ? patch.jid : current.jid,
    patch.activo !== undefined ? patch.activo : current.activo,
    patch.tipo_pago !== undefined ? patch.tipo_pago : current.tipo_pago,
    patch.sueldo_mensual !== undefined ? patch.sueldo_mensual : current.sueldo_mensual,
    patch.valor_hora !== undefined ? patch.valor_hora : current.valor_hora,
    patch.valor_dia !== undefined ? patch.valor_dia : current.valor_dia,
    patch.fecha_ingreso !== undefined ? patch.fecha_ingreso : current.fecha_ingreso,
    patch.sueldo_estimado !== undefined ? patch.sueldo_estimado : current.sueldo_estimado,
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
  entrada_id: number;
  salida_at: number | null;
  salida_id: number | null;
  horas: number | null;
}

// Une la consulta + el emparejado entrada/salida en un solo lugar: lo
// comparten calcularHorasTrabajadas (turnos, usado por cumplimiento y
// liquidación) y listMarcacionesHuerfanas (salidas sin entrada previa, que
// antes se descartaban en silencio — ahora se exponen para poder verlas y
// resolverlas desde /asistencia).
function emparejarAsistencia(filters?: {
  desde?: string;
  hasta?: string;
  sucursal?: string;
  nombres?: string[];
}): { turnos: Turno[]; huerfanas: AsistenciaRecord[] } {
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
  const huerfanas: AsistenciaRecord[] = [];
  for (const [nombre, regs] of porEmpleado) {
    let pendiente: AsistenciaRecord | null = null;
    for (const r of regs) {
      if (r.tipo === "entrada") {
        if (pendiente) turnos.push(aTurno(nombre, pendiente, null));
        pendiente = r;
      } else if (pendiente) {
        turnos.push(aTurno(nombre, pendiente, r));
        pendiente = null;
      } else {
        huerfanas.push(r); // salida sin entrada previa
      }
    }
    if (pendiente) turnos.push(aTurno(nombre, pendiente, null));
  }

  return { turnos, huerfanas };
}

export function calcularHorasTrabajadas(filters?: {
  desde?: string;
  hasta?: string;
  sucursal?: string;
  nombres?: string[];
}): Turno[] {
  return emparejarAsistencia(filters).turnos;
}

export function listMarcacionesHuerfanas(filters?: {
  desde?: string;
  hasta?: string;
  sucursal?: string;
  nombres?: string[];
}): AsistenciaRecord[] {
  return emparejarAsistencia(filters).huerfanas;
}

function aTurno(nombre: string, entrada: AsistenciaRecord, salida: AsistenciaRecord | null): Turno {
  return {
    nombre,
    sucursal_nombre: entrada.sucursal_nombre,
    entrada_at: entrada.created_at,
    entrada_id: entrada.id,
    salida_at: salida?.created_at ?? null,
    salida_id: salida?.id ?? null,
    horas: salida ? (salida.created_at - entrada.created_at) / 3600 : null,
  };
}

// ── Horarios esperados por empleado ─────────────────────────────────────────
// Franjas horarias definidas a mano (día de semana + sucursal + hora inicio/fin).
// Un empleado puede tener varias filas: turno partido (mismo día, dos franjas)
// y/o trabajar en más de una sucursal. dia_semana sigue la convención de
// Date.getDay(): 0=domingo ... 6=sábado.

export interface HorarioEmpleado {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
}

export function listHorarios(empleadoId?: number): HorarioEmpleado[] {
  let query = `
    SELECT h.id, h.empleado_id, e.nombre AS empleado_nombre,
           h.sucursal_id, s.nombre AS sucursal_nombre,
           h.dia_semana, h.hora_inicio, h.hora_fin, h.tolerancia_min
    FROM horarios_empleado h
    JOIN empleados e ON e.id = h.empleado_id
    LEFT JOIN sucursales s ON s.id = h.sucursal_id
  `;
  const params: number[] = [];
  if (empleadoId !== undefined) {
    query += " WHERE h.empleado_id = ?";
    params.push(empleadoId);
  }
  query += " ORDER BY e.nombre ASC, h.dia_semana ASC, h.hora_inicio ASC";
  return db.prepare(query).all(...params) as unknown as HorarioEmpleado[];
}

export function insertHorario(params: {
  empleado_id: number;
  sucursal_id?: number | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min?: number | null;
}): void {
  db.prepare(
    "INSERT INTO horarios_empleado (empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    params.empleado_id,
    params.sucursal_id ?? null,
    params.dia_semana,
    params.hora_inicio,
    params.hora_fin,
    params.tolerancia_min ?? null
  );
}

export function updateHorario(
  id: number,
  patch: { sucursal_id?: number | null; dia_semana?: number; hora_inicio?: string; hora_fin?: string; tolerancia_min?: number | null }
): void {
  const current = db.prepare("SELECT * FROM horarios_empleado WHERE id = ?").get(id) as
    | { sucursal_id: number | null; dia_semana: number; hora_inicio: string; hora_fin: string; tolerancia_min: number | null }
    | undefined;
  if (!current) return;
  db.prepare(
    "UPDATE horarios_empleado SET sucursal_id = ?, dia_semana = ?, hora_inicio = ?, hora_fin = ?, tolerancia_min = ? WHERE id = ?"
  ).run(
    patch.sucursal_id !== undefined ? patch.sucursal_id : current.sucursal_id,
    patch.dia_semana ?? current.dia_semana,
    patch.hora_inicio ?? current.hora_inicio,
    patch.hora_fin ?? current.hora_fin,
    patch.tolerancia_min !== undefined ? patch.tolerancia_min : current.tolerancia_min,
    id
  );
}

export function deleteHorario(id: number): void {
  db.prepare("DELETE FROM horarios_empleado WHERE id = ?").run(id);
}

// Asigna el mismo turno a varios empleados y varios días en un solo paso (una
// fila en horarios_empleado por cada combinación empleado × día). Sin sucursal:
// el cumplimiento compara solo empleado + día + hora, sin importar dónde marcó.
export function insertHorariosBulk(params: {
  empleado_ids: number[];
  dias_semana: number[];
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min?: number | null;
}): void {
  withTransaction(() => {
    for (const empleado_id of params.empleado_ids) {
      for (const dia_semana of params.dias_semana) {
        insertHorario({
          empleado_id,
          dia_semana,
          hora_inicio: params.hora_inicio,
          hora_fin: params.hora_fin,
          tolerancia_min: params.tolerancia_min,
        });
      }
    }
  });
}

// ── Turnos puntuales ─────────────────────────────────────────────────────────
// Un turno de UNA fecha exacta, además del patrón semanal recurrente de
// horarios_empleado — para empleados que trabajan un día que no sigue un
// patrón semanal fijo (ej. "domingo sí, domingo no"). Se suman al horario
// semanal, no lo reemplazan: calcularCumplimiento/calcularAusencias/
// calcularLiquidacion los tratan igual que un horario recurrente pero
// matcheando por fecha exacta en vez de día de semana (ver esos comentarios).

export interface TurnoPuntual {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
  nota: string | null;
  created_at: number;
}

export function listTurnosPuntuales(filters: { empleadoId?: number; desde?: string; hasta?: string } = {}): TurnoPuntual[] {
  const condiciones: string[] = [];
  const params: (string | number)[] = [];
  if (filters.empleadoId !== undefined) {
    condiciones.push("p.empleado_id = ?");
    params.push(filters.empleadoId);
  }
  if (filters.desde) {
    condiciones.push("p.fecha >= ?");
    params.push(filters.desde);
  }
  if (filters.hasta) {
    condiciones.push("p.fecha <= ?");
    params.push(filters.hasta);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT p.id, p.empleado_id, e.nombre AS empleado_nombre,
              p.sucursal_id, s.nombre AS sucursal_nombre,
              p.fecha, p.hora_inicio, p.hora_fin, p.tolerancia_min, p.nota, p.created_at
       FROM turnos_puntuales p
       JOIN empleados e ON e.id = p.empleado_id
       LEFT JOIN sucursales s ON s.id = p.sucursal_id
       ${where}
       ORDER BY p.fecha DESC, p.hora_inicio ASC`
    )
    .all(...params) as unknown as TurnoPuntual[];
}

export function getTurnoPuntual(id: number): TurnoPuntual | null {
  return (
    (db
      .prepare(
        `SELECT p.id, p.empleado_id, e.nombre AS empleado_nombre,
                p.sucursal_id, s.nombre AS sucursal_nombre,
                p.fecha, p.hora_inicio, p.hora_fin, p.tolerancia_min, p.nota, p.created_at
         FROM turnos_puntuales p
         JOIN empleados e ON e.id = p.empleado_id
         LEFT JOIN sucursales s ON s.id = p.sucursal_id
         WHERE p.id = ?`
      )
      .get(id) as unknown as TurnoPuntual | undefined) ?? null
  );
}

export function crearTurnoPuntual(data: {
  empleadoId: number;
  sucursalId?: number | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  toleranciaMin?: number | null;
  nota?: string | null;
}): TurnoPuntual {
  const info = db
    .prepare(
      `INSERT INTO turnos_puntuales (empleado_id, sucursal_id, fecha, hora_inicio, hora_fin, tolerancia_min, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.empleadoId,
      data.sucursalId ?? null,
      data.fecha,
      data.horaInicio,
      data.horaFin,
      data.toleranciaMin ?? null,
      data.nota ?? null
    );
  return getTurnoPuntual(Number(info.lastInsertRowid))!;
}

export function eliminarTurnoPuntual(id: number): boolean {
  const info = db.prepare("DELETE FROM turnos_puntuales WHERE id = ?").run(id);
  return info.changes > 0;
}

// ── Plantillas de turno ──────────────────────────────────────────────────────
// Un "molde" con nombre reutilizable (hora_inicio/hora_fin + opcionalmente los
// días habituales) para no tener que tipear el horario cada vez al asignar
// turnos. A propósito NO tiene sucursal: eso se elige al momento de asignar
// (una misma plantilla, ej. "Turno ventas mañana", puede usarse en distintas
// sucursales). Los días son opcionales ("o que haga falta"): si se cargan, se
// usan para precompletar la asignación masiva, pero siguen siendo editables
// ahí — no atan la plantilla a esos días para siempre.

export interface TurnoTemplate {
  id: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  dias_semana: number[];
  tolerancia_min: number | null;
}

function diasToText(dias: number[]): string | null {
  return dias.length > 0 ? dias.join(",") : null;
}

function textToDias(text: string | null): number[] {
  if (!text) return [];
  return text.split(",").map(Number).filter((n) => !Number.isNaN(n));
}

export function listTurnoTemplates(): TurnoTemplate[] {
  const rows = db.prepare("SELECT * FROM turno_templates ORDER BY nombre ASC").all() as unknown as (Omit<
    TurnoTemplate,
    "dias_semana"
  > & { dias_semana: string | null })[];
  return rows.map((r) => ({ ...r, dias_semana: textToDias(r.dias_semana) }));
}

export function insertTurnoTemplate(
  nombre: string,
  hora_inicio: string,
  hora_fin: string,
  dias_semana: number[] = [],
  tolerancia_min: number | null = null
): void {
  db.prepare(
    "INSERT INTO turno_templates (nombre, hora_inicio, hora_fin, dias_semana, tolerancia_min) VALUES (?, ?, ?, ?, ?)"
  ).run(nombre, hora_inicio, hora_fin, diasToText(dias_semana), tolerancia_min);
}

export function deleteTurnoTemplate(id: number): void {
  db.prepare("DELETE FROM turno_templates WHERE id = ?").run(id);
}

// ── Configuración ────────────────────────────────────────────────────────────

export function getTolerancia(): number {
  const row = db.prepare("SELECT tolerancia_min FROM settings WHERE id = 1").get() as { tolerancia_min: number };
  return row.tolerancia_min;
}

export function setTolerancia(min: number): void {
  db.prepare("UPDATE settings SET tolerancia_min = ? WHERE id = 1").run(min);
}

// ── Cumplimiento de horarios ─────────────────────────────────────────────────
// Compara cada turno real (calcularHorasTrabajadas) contra el horario esperado
// del empleado ese día de semana en esa sucursal, con una tolerancia en minutos
// configurable (ver getTolerancia/setTolerancia, default 30). Todo el cálculo
// de hora/día usa el mismo offset fijo AR (-3h, sin horario de verano) que el
// resto del archivo — nunca la TZ del sistema operativo.

const AR_OFFSET_SEC = 3 * 3600;

function minutosDelDia(unixSec: number): number {
  const d = new Date((unixSec - AR_OFFSET_SEC) * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function diaSemanaAR(unixSec: number): number {
  const d = new Date((unixSec - AR_OFFSET_SEC) * 1000);
  return d.getUTCDay();
}

function fechaAR(unixSec: number): string {
  const d = new Date((unixSec - AR_OFFSET_SEC) * 1000);
  return d.toISOString().slice(0, 10);
}

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// Suma (o resta) días a una fecha ISO (YYYY-MM-DD) en UTC puro, sin tocar
// hora ni zona horaria — usada para desplazar fechas de calendario en los
// cálculos de ausencias/horas pactadas.
function addDiasISO(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface CumplimientoRow {
  nombre: string;
  sucursal_nombre: string;
  fecha: string;
  entrada_real: number;
  entrada_id: number;
  entrada_esperada: string | null;
  diff_entrada_min: number | null;
  salida_real: number | null;
  salida_id: number | null;
  salida_esperada: string | null;
  diff_salida_min: number | null;
  en_curso: boolean;
  estado: "a_horario" | "tarde" | "salida_anticipada" | "tarde_y_anticipada" | "sin_horario";
  tolerancia_aplicada: number | null;
  // Identifican qué horario_empleado cubrió este turno y qué fecha de
  // calendario tenía pactada ese horario (puede diferir de `fecha` en turnos
  // nocturnos, donde el empleado marca entrada después de medianoche).
  // null cuando estado === "sin_horario". Usado por calcularAusencias para
  // saber qué franjas pactadas ya están cubiertas por un turno real.
  horario_id: number | null;
  fecha_esperada: string | null;
}

export function calcularCumplimiento(filters?: {
  desde?: string;
  hasta?: string;
  sucursal?: string;
  nombres?: string[];
}): CumplimientoRow[] {
  const toleranciaGeneral = getTolerancia();
  const turnos = calcularHorasTrabajadas(filters);
  const horarios = db
    .prepare(
      `SELECT h.id AS horario_id, e.nombre AS empleado_nombre,
              h.dia_semana, h.hora_inicio, h.hora_fin, h.tolerancia_min
       FROM horarios_empleado h
       JOIN empleados e ON e.id = h.empleado_id`
    )
    .all() as {
    horario_id: number;
    empleado_nombre: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    tolerancia_min: number | null;
  }[];

  // Agrupado una sola vez por empleado — evita recorrer TODOS los horarios de
  // la empresa por cada turno (antes era O(turnos × horarios); ahora cada
  // turno solo filtra la lista, ya chica, de su propio empleado).
  const horariosPorEmpleado = groupBy(horarios, (h) => normKey(h.empleado_nombre));

  // Turnos puntuales (fecha exacta, ej. "domingo por medio") — se identifican
  // con horario_id negativo (-id) para no chocar con horarios_empleado.id, y
  // matchean por fecha exacta en vez de día de semana.
  const puntualesPorEmpleado = groupBy(listTurnosPuntuales(), (p) => normKey(p.empleado_nombre));

  return turnos.map((t): CumplimientoRow => {
    const dia = diaSemanaAR(t.entrada_at);
    const diaAnterior = (dia + 6) % 7;
    const enCurso = t.salida_at === null;
    const horariosEmp = horariosPorEmpleado.get(normKey(t.nombre)) ?? [];
    const entradaMin = minutosDelDia(t.entrada_at);

    // Compara solo empleado + día + hora — la sucursal donde marcó no importa
    // para decidir si el turno esperado se cumplió. Nombre normalizado
    // (LOWER+TRIM, igual que el JOIN de listAsistencia) para no depender de
    // que coincidan mayúsculas/espacios exactos entre asistencia y nómina.
    // Turnos nocturnos (hora_fin <= hora_inicio, ej. 22:00→06:00) se cargan
    // bajo el día en que ARRANCAN. Si el empleado llega tan tarde que su
    // marcación cae del lado de hoy en el calendario (después de medianoche),
    // igual hay que poder emparejarlo con el turno nocturno de AYER — para
    // eso se suman 1440 min al comparar, y se toma el candidato (de hoy o de
    // ayer) más cercano a la hora real de entrada.
    const candidatosHoy = horariosEmp
      .filter((h) => h.dia_semana === dia)
      .map((h) => ({ h, diff: entradaMin - horaAMinutos(h.hora_inicio) }));
    const candidatosAyerNocturno = horariosEmp
      .filter((h) => h.dia_semana === diaAnterior && horaAMinutos(h.hora_fin) <= horaAMinutos(h.hora_inicio))
      .map((h) => ({ h, diff: entradaMin + 1440 - horaAMinutos(h.hora_inicio) }));
    const fechaTurnoAR = fechaAR(t.entrada_at);
    const puntualesEmp = puntualesPorEmpleado.get(normKey(t.nombre)) ?? [];
    const candidatosPuntuales = puntualesEmp
      .filter((p) => p.fecha === fechaTurnoAR)
      .map((p) => ({
        h: { horario_id: -p.id, dia_semana: dia, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin, tolerancia_min: p.tolerancia_min },
        diff: entradaMin - horaAMinutos(p.hora_inicio),
      }));
    const candidatos = [...candidatosHoy, ...candidatosAyerNocturno, ...candidatosPuntuales];

    if (candidatos.length === 0) {
      return {
        nombre: t.nombre,
        sucursal_nombre: t.sucursal_nombre,
        fecha: fechaAR(t.entrada_at),
        entrada_real: t.entrada_at,
        entrada_id: t.entrada_id,
        entrada_esperada: null,
        diff_entrada_min: null,
        salida_real: t.salida_at,
        salida_id: t.salida_id,
        salida_esperada: null,
        diff_salida_min: null,
        en_curso: enCurso,
        estado: "sin_horario",
        tolerancia_aplicada: null,
        horario_id: null,
        fecha_esperada: null,
      };
    }

    const mejor = candidatos.reduce((mejor, c) => (Math.abs(c.diff) < Math.abs(mejor.diff) ? c : mejor));
    const horario = mejor.h;
    // Tolerancia particular del turno si está definida; si no, la general.
    const tolerancia = horario.tolerancia_min ?? toleranciaGeneral;

    const diffEntrada = mejor.diff;
    const tarde = diffEntrada > tolerancia;

    let diffSalida: number | null = null;
    let anticipada = false;
    if (t.salida_at !== null) {
      const salidaMin = minutosDelDia(t.salida_at);
      diffSalida = horaAMinutos(horario.hora_fin) - salidaMin;
      anticipada = diffSalida > tolerancia;
    }

    const estado: CumplimientoRow["estado"] =
      tarde && anticipada ? "tarde_y_anticipada" : tarde ? "tarde" : anticipada ? "salida_anticipada" : "a_horario";

    const fechaTurno = fechaAR(t.entrada_at);
    // Si matcheó por la rama "hoy" (horario.dia_semana === dia), la fecha
    // pactada es la misma del turno. Si matcheó por la rama nocturna
    // (horario.dia_semana === diaAnterior), el horario arrancaba el día
    // anterior al calendario en que el empleado terminó marcando entrada.
    const fechaEsperada = horario.dia_semana === dia ? fechaTurno : addDiasISO(fechaTurno, -1);

    return {
      nombre: t.nombre,
      sucursal_nombre: t.sucursal_nombre,
      fecha: fechaTurno,
      entrada_real: t.entrada_at,
      entrada_id: t.entrada_id,
      entrada_esperada: horario.hora_inicio,
      diff_entrada_min: diffEntrada,
      salida_real: t.salida_at,
      salida_id: t.salida_id,
      salida_esperada: horario.hora_fin,
      diff_salida_min: diffSalida,
      en_curso: enCurso,
      estado,
      tolerancia_aplicada: tolerancia,
      horario_id: horario.horario_id,
      fecha_esperada: fechaEsperada,
    };
  });
}

// ── Ausencias ─────────────────────────────────────────────────────────────
// calcularCumplimiento solo recorre turnos que sí existen (nunca detecta
// "no vino"). Para eso hay que enumerar los turnos ESPERADOS (horario
// pactado × cada fecha del rango que cae en ese día de semana) y restar los
// que ya están cubiertos por un turno real (mismo empleado + horario_id +
// fecha_esperada que calcularCumplimiento).

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

// Agrupa un array por clave una sola vez, para reemplazar `.filter()` repetido
// sobre el mismo array dentro de un `.map()` por cada empleado (O(n×m) → O(n+m)).
function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

// Un turno partido genera una fila de AusenciaRow por horario_id faltado —
// para contar "días de ausencia" hay que deduplicar por fecha de calendario.
function diasUnicos(rows: AusenciaRow[]): number {
  return new Set(rows.map((r) => r.fecha)).size;
}

function duracionHorarioHoras(horaInicio: string, horaFin: string): number {
  const inicio = horaAMinutos(horaInicio);
  let fin = horaAMinutos(horaFin);
  if (fin <= inicio) fin += 24 * 60; // turno nocturno: cruza medianoche
  return (fin - inicio) / 60;
}

export interface AusenciaRow {
  empleado_nombre: string;
  sucursal_nombre: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas: number;
  // true si ese día cae dentro de un aviso de RRHH confirmado por el
  // empleado (Enfermedad / Motivo Personal / Vacaciones) — ver
  // ausencias_reportadas. No se descuenta de la liquidación.
  justificada: boolean;
}

export function calcularAusencias(filters: { desde: string; hasta: string; nombres?: string[] }): AusenciaRow[] {
  const cumplimiento = calcularCumplimiento(filters);
  const cubiertos = new Set(
    cumplimiento
      .filter((c) => c.horario_id !== null)
      .map((c) => `${normKey(c.nombre)}|${c.horario_id}|${c.fecha_esperada}`)
  );

  let query = `
    SELECT h.id AS horario_id, h.dia_semana, h.hora_inicio, h.hora_fin, e.nombre AS empleado_nombre,
           s.nombre AS sucursal_nombre
    FROM horarios_empleado h
    JOIN empleados e ON e.id = h.empleado_id
    LEFT JOIN sucursales s ON s.id = h.sucursal_id
    WHERE e.activo = 1
  `;
  const params: string[] = [];
  if (filters.nombres && filters.nombres.length > 0) {
    query += ` AND e.nombre IN (${filters.nombres.map(() => "?").join(",")})`;
    params.push(...filters.nombres);
  }
  const horarios = db.prepare(query).all(...params) as {
    horario_id: number;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    empleado_nombre: string;
    sucursal_nombre: string | null;
  }[];

  // Turnos puntuales dentro del rango — mismo tratamiento que un horario
  // recurrente pero por fecha exacta (ver calcularCumplimiento).
  const puntuales = listTurnosPuntuales({ desde: filters.desde, hasta: filters.hasta }).filter(
    (p) => !filters.nombres || filters.nombres.length === 0 || filters.nombres.includes(p.empleado_nombre)
  );

  const reportadas = getAusenciasReportadas(filters.desde, filters.hasta);
  const rangosPorEmpleado = new Map<string, { fecha_inicio: string; fecha_fin: string }[]>();
  for (const r of reportadas) {
    const key = normKey(r.empleado_nombre);
    if (!rangosPorEmpleado.has(key)) rangosPorEmpleado.set(key, []);
    rangosPorEmpleado.get(key)!.push({ fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin });
  }
  function esJustificada(empleadoNombre: string, fecha: string): boolean {
    const rangos = rangosPorEmpleado.get(normKey(empleadoNombre));
    return !!rangos?.some((r) => fecha >= r.fecha_inicio && fecha <= r.fecha_fin);
  }

  // No contar como ausencia un turno de HOY que todavía no arrancó — si no,
  // liquidación mal marca "faltó" a alguien cuyo turno es más tarde en el día.
  const ahoraSec = Math.floor(Date.now() / 1000);
  const hoyAR = fechaAR(ahoraSec);
  const minutosAhoraAR = minutosDelDia(ahoraSec);

  const ausencias: AusenciaRow[] = [];
  for (let fecha = filters.desde; fecha <= filters.hasta; fecha = addDiasISO(fecha, 1)) {
    if (fecha > hoyAR) continue;
    const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    for (const h of horarios) {
      if (h.dia_semana !== dia) continue;
      if (fecha === hoyAR && horaAMinutos(h.hora_inicio) > minutosAhoraAR) continue;
      const key = `${normKey(h.empleado_nombre)}|${h.horario_id}|${fecha}`;
      if (cubiertos.has(key)) continue;
      ausencias.push({
        empleado_nombre: h.empleado_nombre,
        sucursal_nombre: h.sucursal_nombre,
        fecha,
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin,
        horas: duracionHorarioHoras(h.hora_inicio, h.hora_fin),
        justificada: esJustificada(h.empleado_nombre, fecha),
      });
    }
  }

  for (const p of puntuales) {
    if (p.fecha > hoyAR) continue;
    if (p.fecha === hoyAR && horaAMinutos(p.hora_inicio) > minutosAhoraAR) continue;
    const key = `${normKey(p.empleado_nombre)}|${-p.id}|${p.fecha}`;
    if (cubiertos.has(key)) continue;
    ausencias.push({
      empleado_nombre: p.empleado_nombre,
      sucursal_nombre: p.sucursal_nombre,
      fecha: p.fecha,
      hora_inicio: p.hora_inicio,
      hora_fin: p.hora_fin,
      horas: duracionHorarioHoras(p.hora_inicio, p.hora_fin),
      justificada: esJustificada(p.empleado_nombre, p.fecha),
    });
  }

  return ausencias;
}

// ── Liquidación de sueldos ───────────────────────────────────────────────
// Cálculo interno simple (no reemplaza un recibo de sueldo legal): sin
// horas extra, sin aportes/ganancias/SAC. Empleados "por hora" cobran las
// horas efectivamente trabajadas (calcularHorasTrabajadas). Empleados
// "mensual" cobran el fijo, con descuentos proporcionales por tardanzas /
// salidas anticipadas (calcularCumplimiento) y por ausencias completas
// (calcularAusencias), traducidos a dinero con un valor-hora equivalente =
// sueldo_mensual / horas pactadas en el período elegido.

export interface LiquidacionEmpleado {
  empleado_id: number;
  nombre: string;
  tipo_pago: "mensual" | "hora" | "dia" | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null; // solo tipo 'dia'
  horas_trabajadas: number | null; // tipo 'hora' y 'dia'
  horas_en_curso: boolean; // hay turnos sin cerrar (tipo 'hora' y 'dia')
  horas_pactadas: number | null; // solo tipo 'mensual'
  valor_hora_equivalente: number | null; // solo tipo 'mensual'
  minutos_perdidos: number; // tardanza + salida anticipada, solo mensual
  descuento_tardanza: number;
  dias_ausencia: number; // ausencias SIN aviso de RRHH (se descuentan; en 'dia' solo informativo)
  horas_ausencia: number;
  descuento_ausencia: number;
  dias_ausencia_justificada: number; // ausencias CON aviso de RRHH confirmado (no se descuentan)
  horas_ausencia_justificada: number;
  dias_trabajados: number | null; // solo tipo 'dia', con horario cargado
  horas_extra: number | null; // solo tipo 'dia', con horario cargado: horas por encima de lo pactado ese día
  total_por_horas: number | null; // horas_trabajadas × valor_hora — referencia para comparar contra 'total' (mensual y dia)
  adelantos: number; // suma de adelantos cargados con fecha dentro del período — se descuenta del total
  total: number;
  advertencias: string[];
}

function contarOcurrenciasDia(desde: string, hasta: string, diaSemana: number): number {
  let count = 0;
  for (let fecha = desde; fecha <= hasta; fecha = addDiasISO(fecha, 1)) {
    if (new Date(`${fecha}T00:00:00Z`).getUTCDay() === diaSemana) count++;
  }
  return count;
}

function formatARSSimple(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

// Compara el total ya calculado (sueldo fijo mensual, o jornal por día)
// contra lo que cobraría si se le pagara estrictamente por horas trabajadas ×
// valor_hora, y agrega una advertencia si hay diferencia — para que el admin
// vea rápido si el sueldo fijo está pagando de más o de menos respecto al
// valor hora cargado. Devuelve `total_por_horas` (o null sin valor_hora).
function compararConValorHora(
  total: number,
  horasTrabajadas: number,
  valorHora: number | null,
  advertencias: string[]
): number | null {
  if (!valorHora) return null;
  const totalPorHoras = horasTrabajadas * valorHora;
  const diff = total - totalPorHoras;
  if (Math.abs(diff) > 1) {
    advertencias.push(
      diff > 0
        ? `Cobra ${formatARSSimple(diff)} más que si se le pagara por hora trabajada (equivaldría a ${formatARSSimple(totalPorHoras)})`
        : `Cobra ${formatARSSimple(Math.abs(diff))} menos que si se le pagara por hora trabajada (equivaldría a ${formatARSSimple(totalPorHoras)})`
    );
  }
  return totalPorHoras;
}

export function calcularLiquidacion(filters: { desde: string; hasta: string; nombres?: string[] }): LiquidacionEmpleado[] {
  const empleados = listEmpleados().filter(
    (e) => e.activo && (!filters.nombres || filters.nombres.length === 0 || filters.nombres.includes(e.nombre))
  );
  const turnos = calcularHorasTrabajadas(filters);
  const cumplimiento = calcularCumplimiento(filters);
  const ausencias = calcularAusencias(filters);
  const horarios = listHorarios();
  const puntuales = listTurnosPuntuales({ desde: filters.desde, hasta: filters.hasta });

  // Agrupado una sola vez por empleado — evita recorrer estos 4 arrays
  // completos (de TODO el período/toda la empresa) dentro del `.map()` de
  // abajo por cada empleado (antes era O(empleados × filas); ahora cada
  // empleado hace un lookup O(1) a su propia lista, ya chica).
  const turnosPorEmpleado = groupBy(turnos, (t) => normKey(t.nombre));
  const horariosPorEmpleado = groupBy(horarios, (h) => normKey(h.empleado_nombre));
  const cumplimientoPorEmpleado = groupBy(cumplimiento, (c) => normKey(c.nombre));
  const ausenciasPorEmpleado = groupBy(ausencias, (a) => normKey(a.empleado_nombre));
  const puntualesPorEmpleado = groupBy(puntuales, (p) => normKey(p.empleado_nombre));

  const ocurrenciasPorDia = new Map<number, number>();
  function ocurrencias(dia: number): number {
    if (!ocurrenciasPorDia.has(dia)) {
      ocurrenciasPorDia.set(dia, contarOcurrenciasDia(filters.desde, filters.hasta, dia));
    }
    return ocurrenciasPorDia.get(dia)!;
  }

  const adelantosPorEmpleado = groupBy(
    listAdelantos({ desde: filters.desde, hasta: filters.hasta }),
    (a) => String(a.empleado_id)
  );
  function adelantosDe(empleadoId: number): number {
    return (adelantosPorEmpleado.get(String(empleadoId)) ?? []).reduce((acc, a) => acc + a.monto, 0);
  }

  return empleados.map((emp): LiquidacionEmpleado => {
    const advertencias: string[] = [];
    const key = normKey(emp.nombre);
    const adelantos = adelantosDe(emp.id);

    if (emp.tipo_pago === "hora") {
      const turnosEmp = turnosPorEmpleado.get(key) ?? [];
      const horasTrabajadas = turnosEmp.filter((t) => t.horas !== null).reduce((acc, t) => acc + (t.horas ?? 0), 0);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado");
      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "hora",
        sueldo_mensual: null,
        valor_hora: emp.valor_hora,
        valor_dia: null,
        horas_trabajadas: horasTrabajadas,
        horas_en_curso: horasEnCurso,
        horas_pactadas: null,
        valor_hora_equivalente: null,
        minutos_perdidos: 0,
        descuento_tardanza: 0,
        dias_ausencia: 0,
        horas_ausencia: 0,
        descuento_ausencia: 0,
        dias_ausencia_justificada: 0,
        horas_ausencia_justificada: 0,
        dias_trabajados: null,
        horas_extra: null,
        total_por_horas: horasTrabajadas * (emp.valor_hora ?? 0),
        adelantos,
        total: horasTrabajadas * (emp.valor_hora ?? 0) - adelantos,
        advertencias,
      };
    }

    if (emp.tipo_pago === "dia") {
      const horariosEmp = horariosPorEmpleado.get(key) ?? [];
      const puntualesEmp = puntualesPorEmpleado.get(key) ?? [];
      const turnosEmp = turnosPorEmpleado.get(key) ?? [];
      const turnosCerrados = turnosEmp.filter((t) => t.horas !== null);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);
      const horasTrabajadasTotal = turnosCerrados.reduce((acc, t) => acc + (t.horas ?? 0), 0);

      if (!emp.valor_dia) advertencias.push("Sin valor por día configurado");
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado (necesario para horas extra)");

      // Sin ningún horario cargado (ni recurrente ni puntual) no hay forma de
      // saber qué es "jornal normal" vs "hora extra" — se paga directo por
      // hora trabajada, como tipo 'hora'.
      if (horariosEmp.length === 0 && puntualesEmp.length === 0) {
        return {
          empleado_id: emp.id,
          nombre: emp.nombre,
          tipo_pago: "dia",
          sueldo_mensual: null,
          valor_hora: emp.valor_hora,
          valor_dia: emp.valor_dia,
          horas_trabajadas: horasTrabajadasTotal,
          horas_en_curso: horasEnCurso,
          horas_pactadas: null,
          valor_hora_equivalente: null,
          minutos_perdidos: 0,
          descuento_tardanza: 0,
          dias_ausencia: 0,
          horas_ausencia: 0,
          descuento_ausencia: 0,
          dias_ausencia_justificada: 0,
          horas_ausencia_justificada: 0,
          dias_trabajados: null,
          horas_extra: null,
          total_por_horas: horasTrabajadasTotal * (emp.valor_hora ?? 0),
          adelantos,
          total: horasTrabajadasTotal * (emp.valor_hora ?? 0) - adelantos,
          advertencias,
        };
      }

      // Con horario cargado: por cada día efectivamente trabajado que coincide
      // con un día de semana pactado, un jornal (valor_dia) + lo que exceda las
      // horas pactadas ESE día, a valor hora (sin recargo). Un día trabajado que
      // no coincide con ningún día de semana pactado (ej. cubrió un turno
      // suelto) se paga directo por hora, sin jornal.
      const horasPactadasPorDiaSemana = new Map<number, number>();
      for (const h of horariosEmp) {
        horasPactadasPorDiaSemana.set(
          h.dia_semana,
          (horasPactadasPorDiaSemana.get(h.dia_semana) ?? 0) + duracionHorarioHoras(h.hora_inicio, h.hora_fin)
        );
      }
      // Turno puntual en una fecha exacta (ej. "domingo por medio") pisa el
      // día de semana para ESA fecha — se paga jornal completo igual que un
      // día del patrón semanal, no directo por hora.
      const horasPactadasPorFechaPuntual = new Map<string, number>();
      for (const p of puntualesEmp) {
        horasPactadasPorFechaPuntual.set(
          p.fecha,
          (horasPactadasPorFechaPuntual.get(p.fecha) ?? 0) + duracionHorarioHoras(p.hora_inicio, p.hora_fin)
        );
      }

      const horasPorFecha = new Map<string, number>();
      for (const t of turnosCerrados) {
        const fecha = fechaAR(t.entrada_at);
        horasPorFecha.set(fecha, (horasPorFecha.get(fecha) ?? 0) + (t.horas ?? 0));
      }

      let diasTrabajados = 0;
      let horasExtra = 0;
      let total = 0;
      for (const [fecha, horasDia] of horasPorFecha) {
        const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay();
        const horasPactadasDia = horasPactadasPorFechaPuntual.get(fecha) ?? horasPactadasPorDiaSemana.get(diaSemana) ?? 0;
        if (horasPactadasDia > 0) {
          diasTrabajados += 1;
          const extra = Math.max(0, horasDia - horasPactadasDia);
          horasExtra += extra;
          total += (emp.valor_dia ?? 0) + extra * (emp.valor_hora ?? 0);
        } else {
          total += horasDia * (emp.valor_hora ?? 0);
        }
      }

      const ausenciasEmp = ausenciasPorEmpleado.get(key) ?? [];
      const ausenciasInjustificadas = ausenciasEmp.filter((a) => !a.justificada);
      const ausenciasJustificadas = ausenciasEmp.filter((a) => a.justificada);

      const totalPorHoras = compararConValorHora(total, horasTrabajadasTotal, emp.valor_hora, advertencias);

      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "dia",
        sueldo_mensual: null,
        valor_hora: emp.valor_hora,
        valor_dia: emp.valor_dia,
        horas_trabajadas: horasTrabajadasTotal,
        horas_en_curso: horasEnCurso,
        horas_pactadas: null,
        valor_hora_equivalente: null,
        minutos_perdidos: 0,
        descuento_tardanza: 0,
        dias_ausencia: diasUnicos(ausenciasInjustificadas),
        horas_ausencia: ausenciasInjustificadas.reduce((acc, a) => acc + a.horas, 0),
        descuento_ausencia: 0, // "por día" no tiene una base fija de la cual descontar
        dias_ausencia_justificada: diasUnicos(ausenciasJustificadas),
        horas_ausencia_justificada: ausenciasJustificadas.reduce((acc, a) => acc + a.horas, 0),
        dias_trabajados: diasTrabajados,
        horas_extra: horasExtra,
        total_por_horas: totalPorHoras,
        adelantos,
        total: total - adelantos,
        advertencias,
      };
    }

    if (emp.tipo_pago === "mensual") {
      const horariosEmp = horariosPorEmpleado.get(key) ?? [];
      const puntualesEmp = puntualesPorEmpleado.get(key) ?? [];
      const horasPactadas =
        horariosEmp.reduce((acc, h) => acc + ocurrencias(h.dia_semana) * duracionHorarioHoras(h.hora_inicio, h.hora_fin), 0) +
        puntualesEmp.reduce((acc, p) => acc + duracionHorarioHoras(p.hora_inicio, p.hora_fin), 0);
      const valorHoraEquivalente = horasPactadas > 0 && emp.sueldo_mensual ? emp.sueldo_mensual / horasPactadas : null;

      const cRows = cumplimientoPorEmpleado.get(key) ?? [];
      let minutosPerdidos = 0;
      for (const c of cRows) {
        if (c.estado === "tarde" || c.estado === "tarde_y_anticipada") minutosPerdidos += c.diff_entrada_min ?? 0;
        if (c.estado === "salida_anticipada" || c.estado === "tarde_y_anticipada") minutosPerdidos += c.diff_salida_min ?? 0;
      }
      const descuentoTardanza = valorHoraEquivalente ? (minutosPerdidos / 60) * valorHoraEquivalente : 0;

      const ausenciasEmp = ausenciasPorEmpleado.get(key) ?? [];
      const ausenciasInjustificadas = ausenciasEmp.filter((a) => !a.justificada);
      const ausenciasJustificadas = ausenciasEmp.filter((a) => a.justificada);
      const horasAusencia = ausenciasInjustificadas.reduce((acc, a) => acc + a.horas, 0);
      const horasAusenciaJustificada = ausenciasJustificadas.reduce((acc, a) => acc + a.horas, 0);
      const descuentoAusencia = valorHoraEquivalente ? horasAusencia * valorHoraEquivalente : 0;

      const turnosEmp = turnosPorEmpleado.get(key) ?? [];
      const horasTrabajadas = turnosEmp.filter((t) => t.horas !== null).reduce((acc, t) => acc + (t.horas ?? 0), 0);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);

      if (!emp.sueldo_mensual) advertencias.push("Sin sueldo mensual configurado");
      if (horasPactadas === 0) advertencias.push("Sin horario cargado — no se pueden calcular descuentos");
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado (no se puede comparar contra horas trabajadas)");

      const total = (emp.sueldo_mensual ?? 0) - descuentoTardanza - descuentoAusencia;
      const totalPorHoras = compararConValorHora(total, horasTrabajadas, emp.valor_hora, advertencias);

      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "mensual",
        sueldo_mensual: emp.sueldo_mensual,
        valor_hora: emp.valor_hora,
        valor_dia: null,
        horas_trabajadas: horasTrabajadas,
        horas_en_curso: horasEnCurso,
        horas_pactadas: horasPactadas,
        valor_hora_equivalente: valorHoraEquivalente,
        minutos_perdidos: minutosPerdidos,
        descuento_tardanza: descuentoTardanza,
        dias_ausencia: diasUnicos(ausenciasInjustificadas),
        horas_ausencia: horasAusencia,
        descuento_ausencia: descuentoAusencia,
        dias_ausencia_justificada: diasUnicos(ausenciasJustificadas),
        horas_ausencia_justificada: horasAusenciaJustificada,
        dias_trabajados: null,
        horas_extra: null,
        total_por_horas: totalPorHoras,
        adelantos,
        total: total - adelantos,
        advertencias,
      };
    }

    advertencias.push("Sin tipo de pago configurado");
    return {
      empleado_id: emp.id,
      nombre: emp.nombre,
      tipo_pago: null,
      sueldo_mensual: emp.sueldo_mensual,
      valor_hora: emp.valor_hora,
      valor_dia: emp.valor_dia,
      horas_trabajadas: null,
      horas_en_curso: false,
      horas_pactadas: null,
      valor_hora_equivalente: null,
      minutos_perdidos: 0,
      descuento_tardanza: 0,
      dias_ausencia: 0,
      horas_ausencia: 0,
      descuento_ausencia: 0,
      dias_ausencia_justificada: 0,
      horas_ausencia_justificada: 0,
      dias_trabajados: null,
      horas_extra: null,
      total_por_horas: null,
      adelantos,
      total: -adelantos,
      advertencias,
    };
  });
}

// ── Saldo de vacaciones ──────────────────────────────────────────────────────
// Cálculo aproximado según la Ley de Contrato de Trabajo argentina (art. 150):
// días asignados por año según antigüedad al 31/12 de ese año. No reemplaza
// un cálculo legal formal (mismo disclaimer que calcularLiquidacion) — sirve
// para que RRHH tenga una referencia rápida en el dashboard.

function añosCompletos(desdeISO: string, hastaISO: string): number {
  const d1 = new Date(`${desdeISO}T00:00:00Z`);
  const d2 = new Date(`${hastaISO}T00:00:00Z`);
  let anios = d2.getUTCFullYear() - d1.getUTCFullYear();
  const cumplioAniversario =
    d2.getUTCMonth() > d1.getUTCMonth() ||
    (d2.getUTCMonth() === d1.getUTCMonth() && d2.getUTCDate() >= d1.getUTCDate());
  if (!cumplioAniversario) anios -= 1;
  return Math.max(0, anios);
}

function diasVacacionesLey(antiguedadAnios: number): number {
  if (antiguedadAnios >= 20) return 35;
  if (antiguedadAnios >= 10) return 28;
  if (antiguedadAnios >= 5) return 21;
  return 14;
}

function diasEntreISO(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000) + 1;
}

export interface SaldoVacacionesEmpleado {
  empleado_id: number;
  nombre: string;
  fecha_ingreso: string | null;
  antiguedad_anios: number | null;
  dias_asignados: number | null;
  dias_usados: number;
  saldo: number | null;
  advertencia: string | null;
}

export function calcularSaldoVacaciones(anio?: number): SaldoVacacionesEmpleado[] {
  const anioObjetivo = anio ?? Number(fechaAR(Math.floor(Date.now() / 1000)).slice(0, 4));
  const inicioAnio = `${anioObjetivo}-01-01`;
  const finAnio = `${anioObjetivo}-12-31`;

  const vacacionesRows = db
    .prepare(
      `SELECT empleado_nombre, fecha_inicio, fecha_fin FROM ausencias_reportadas
       WHERE categoria = 'Vacaciones' AND fecha_inicio <= ? AND fecha_fin >= ?`
    )
    .all(finAnio, inicioAnio) as { empleado_nombre: string; fecha_inicio: string; fecha_fin: string }[];

  const usadosPorEmpleado = new Map<string, number>();
  for (const r of vacacionesRows) {
    const desdeClip = r.fecha_inicio < inicioAnio ? inicioAnio : r.fecha_inicio;
    const hastaClip = r.fecha_fin > finAnio ? finAnio : r.fecha_fin;
    const key = normKey(r.empleado_nombre);
    usadosPorEmpleado.set(key, (usadosPorEmpleado.get(key) ?? 0) + diasEntreISO(desdeClip, hastaClip));
  }

  return listEmpleados()
    .filter((e) => e.activo)
    .map((emp): SaldoVacacionesEmpleado => {
      const diasUsados = usadosPorEmpleado.get(normKey(emp.nombre)) ?? 0;

      if (!emp.fecha_ingreso) {
        return {
          empleado_id: emp.id,
          nombre: emp.nombre,
          fecha_ingreso: null,
          antiguedad_anios: null,
          dias_asignados: null,
          dias_usados: diasUsados,
          saldo: null,
          advertencia: "Sin fecha de ingreso configurada",
        };
      }

      if (emp.fecha_ingreso > finAnio) {
        // Todavía no había ingresado durante ese año.
        return {
          empleado_id: emp.id,
          nombre: emp.nombre,
          fecha_ingreso: emp.fecha_ingreso,
          antiguedad_anios: 0,
          dias_asignados: 0,
          dias_usados: diasUsados,
          saldo: -diasUsados,
          advertencia: null,
        };
      }

      const ingresoEnEsteAnio = emp.fecha_ingreso.slice(0, 4) === String(anioObjetivo);
      let antiguedadAnios: number;
      let diasAsignados: number;
      if (ingresoEnEsteAnio) {
        // Primer año: si llega a trabajar la mitad de los días hábiles del año
        // tiene licencia completa (LCT art. 150/151); si no, proporcional a
        // razón de 1 día cada 20 trabajados (LCT art. 153).
        antiguedadAnios = 0;
        const diasTrabajadosHastaFin = diasEntreISO(emp.fecha_ingreso, finAnio);
        const diasCalendarioAnio = diasEntreISO(inicioAnio, finAnio);
        diasAsignados =
          diasTrabajadosHastaFin >= diasCalendarioAnio / 2
            ? diasVacacionesLey(0)
            : Math.floor(diasTrabajadosHastaFin / 20);
      } else {
        antiguedadAnios = añosCompletos(emp.fecha_ingreso, finAnio);
        diasAsignados = diasVacacionesLey(antiguedadAnios);
      }

      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        fecha_ingreso: emp.fecha_ingreso,
        antiguedad_anios: antiguedadAnios,
        dias_asignados: diasAsignados,
        dias_usados: diasUsados,
        saldo: diasAsignados - diasUsados,
        advertencia: null,
      };
    });
}

export default db;
