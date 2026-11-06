import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import qrcodeTerminal from "qrcode-terminal";
import { setConnectionState, getConnectionState } from "../db";
import { handleIncoming } from "./handler";
import { setLidPhone } from "./contacts";

const AUTH_DIR = path.resolve(process.cwd(), "auth");
const logger = pino({ level: "silent" });

export interface BotHandle {
  sock: ReturnType<typeof makeWASocket>;
  shutdown: () => Promise<void>;
}

let handle: BotHandle | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

export async function start(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const wasRegistered = state.creds.registered;

  let version: [number, number, number] | undefined;
  // La lista de Baileys en GitHub a veces queda vieja y WhatsApp rechaza la
  // vinculación (el celular se queda cargando). Primero le preguntamos a
  // WhatsApp Web su versión actual; si falla, usamos la de Baileys.
  try {
    const fetched = await fetchLatestWaWebVersion();
    if (!fetched.isLatest) throw fetched.error ?? new Error("sin versión");
    version = fetched.version;
    console.log(`[bot] Usando versión de WhatsApp Web ${version.join(".")}`);
  } catch (err) {
    console.warn("[bot] No se pudo obtener la versión de WhatsApp Web:", err);
    try {
      const fetched = await fetchLatestBaileysVersion();
      version = fetched.version;
      console.log(`[bot] Usando Baileys versión ${version.join(".")}`);
    } catch (err2) {
      console.warn("[bot] No se pudo obtener la última versión de Baileys:", err2);
    }
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  handle = {
    sock,
    shutdown: async () => {
      shuttingDown = true;
      try {
        await sock.logout();
      } catch {}
      try {
        sock.end(undefined);
      } catch {}
    },
  };

  sock.ev.on("creds.update", () => {
    saveCreds().catch((err) => {
      console.error("[bot] Error al guardar credenciales (ignorado):", err);
    });
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.id.endsWith("@s.whatsapp.net")) {
        const phone = c.id.replace("@s.whatsapp.net", "");
        setLidPhone(c.lid, phone);
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[bot] QR recibido — mostrando en dashboard y terminal:");
      qrcodeTerminal.generate(qr, { small: true });
      setConnectionState({ status: "qr", qr_string: qr, phone: null });
      return;
    }

    if (connection === "connecting") {
      const current = getConnectionState();
      if (current.status === "disconnected") {
        setConnectionState({ status: "connecting" });
      }
      return;
    }

    if (connection === "open") {
      const rawId = sock.user?.id ?? "";
      const phone = rawId.split(":")[0] ?? rawId;
      console.log(`[bot] Conectado como ${phone}`);
      fallos500Seguidos = 0;
      setConnectionState({ status: "connected", qr_string: null, phone });
      return;
    }

    if (connection === "close") {
      if (shuttingDown) {
        shuttingDown = false;
        return;
      }
      const err = lastDisconnect?.error as { output?: { statusCode?: number }; message?: string } | undefined;
      const code = err?.output?.statusCode;
      console.log(`[bot] Conexión cerrada. Código: ${code}, mensaje: ${err?.message ?? "(ninguno)"}`);
      console.log(`[bot] Error completo:`, JSON.stringify(lastDisconnect?.error, null, 2));

      if (code === DisconnectReason.loggedOut) {
        console.log("[bot] Sesión cerrada (loggedOut). Borrando auth/ y esperando QR nuevo...");
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        scheduleReconnect(code);
        return;
      }

      if (code === DisconnectReason.badSession) {
        // WhatsApp usa el 500 también para errores pasajeros de su servidor
        // ("Stream Errored (ack)"). Con una sesión ya vinculada, reintentamos con
        // la misma sesión y solo la borramos si falla varias veces seguidas.
        fallos500Seguidos++;
        if (wasRegistered && fallos500Seguidos < MAX_FALLOS_500) {
          console.log(`[bot] Error 500 (${fallos500Seguidos}/${MAX_FALLOS_500 - 1}) con sesión vinculada. Reconectando sin borrar auth/...`);
          scheduleReconnect(code);
          return;
        }
        fallos500Seguidos = 0;
        console.log("[bot] Sesión inválida (badSession). Borrando auth/ y esperando QR...");
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        scheduleReconnect(code);
        return;
      }

      if (code === DisconnectReason.timedOut) {
        // Baileys usa el mismo código 408 tanto para "nadie escaneó el QR" como para
        // un timeout de reconexión de una sesión YA vinculada (ej: corte de wifi).
        // Solo borramos auth/ si la sesión nunca llegó a registrarse — si ya estaba
        // vinculada, borrarla de más forzaría a re-escanear QR por un simple hipo de red.
        if (wasRegistered) {
          console.log("[bot] Timeout de conexión (sesión ya vinculada). Reconectando sin borrar auth/...");
          scheduleReconnect(code);
          return;
        }
        console.log("[bot] Timeout de QR (nadie escaneó a tiempo). Borrando auth/ para generar identidad nueva...");
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        scheduleReconnect(code);
        return;
      }

      scheduleReconnect(code);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[bot] messages.upsert disparado: type=${type}, count=${messages.length}`);
    const now = Math.floor(Date.now() / 1000);
    for (const msg of messages) {
      const jid = msg.key.remoteJid ?? "?";
      const fromMe = msg.key.fromMe;
      const msgType = msg.message ? Object.keys(msg.message)[0] : "null";
      console.log(`[bot] msg: jid=${jid}, fromMe=${fromMe}, type=${msgType}, ts=${msg.messageTimestamp}`);
      // 'notify' = mensaje en tiempo real
      // 'append' = sync post-reconexión; solo procesar si llegó en los últimos 5 min
      if (type === "append") {
        const msgTime = Number(msg.messageTimestamp ?? 0);
        if (now - msgTime > 300) {
          console.log(`[bot] msg ignorado (append antiguo, ts=${msgTime})`);
          continue;
        }
      }
      await handleIncoming(sock, msg);
    }
  });

  // Diagnóstico: confirmar si WhatsApp realmente entrega los mensajes que mandamos,
  // en vez de asumirlo por el eco local de messages.upsert.
  const STATUS_NAMES: Record<number, string> = {
    0: "ERROR",
    1: "PENDING",
    2: "SERVER_ACK",
    3: "DELIVERY_ACK",
    4: "READ",
    5: "PLAYED",
  };
  sock.ev.on("messages.update", (updates) => {
    for (const u of updates) {
      if (!u.key.fromMe) continue;
      const status = u.update?.status;
      const statusName = status != null ? (STATUS_NAMES[status] ?? String(status)) : "(sin status)";
      console.log(`[bot] [entrega] jid=${u.key.remoteJid} id=${u.key.id} status=${statusName}`);
    }
  });
}

// Errores 500 seguidos sin llegar a conectar; al tercero se da la sesión por perdida.
let fallos500Seguidos = 0;
const MAX_FALLOS_500 = 3;

function scheduleReconnect(code: number | undefined): void {
  if (reconnectTimer) return;
  // 440 = connectionReplaced, 500 = badSession: esperar más para evitar rate limiting
  const delay = code === 440 ? 15_000 : code === 500 ? 30_000 : 5_000;
  console.log(`[bot] Reconectando en ${delay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (handle) {
      try {
        handle.sock.end(undefined);
      } catch {}
      handle = null;
    }
    start().catch((err) => console.error("[bot] Error al reconectar:", err));
  }, delay);
}

export function getHandle(): BotHandle | null {
  return handle;
}
