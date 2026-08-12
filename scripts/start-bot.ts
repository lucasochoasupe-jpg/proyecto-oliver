// env-loader DEBE ser el primer import — puebla process.env antes que cualquier otro módulo
import "./env-loader";

import path from "node:path";
import fs from "node:fs";
import { start, getHandle } from "../src/lib/baileys/client";
import {
  getPendingOutbox,
  markOutboxSent,
  getConnectionState,
} from "../src/lib/db";

const RESTART_FLAG = path.resolve(process.cwd(), "data", ".restart");
const AUTH_DIR = path.resolve(process.cwd(), "auth");

// ── Outbox poller: envía mensajes humanos encolados desde el dashboard ────────
setInterval(async () => {
  const handle = getHandle();
  if (!handle) return;

  const state = getConnectionState();
  if (state.status !== "connected") return;

  const pending = getPendingOutbox(20);
  for (const item of pending) {
    try {
      // Si phone ya incluye @ (p.ej. "1234@lid") usarlo como JID completo
      const jid = item.phone.includes("@")
        ? item.phone
        : `${item.phone}@s.whatsapp.net`;
      await handle.sock.sendMessage(jid, { text: item.content });
      markOutboxSent(item.id);
      console.log(`[bot] [outbox] -> Enviado a ${item.phone}: "${item.content}"`);
    } catch (err) {
      console.error(`[bot] [outbox] Error enviando a ${item.phone}:`, err);
    }
  }
}, 2_000);

// ── Restart flag poller: disconnect/reconnect desde el dashboard ──────────────
setInterval(async () => {
  if (!fs.existsSync(RESTART_FLAG)) return;

  console.log("[bot] Bandera .restart detectada — reiniciando sesión...");
  fs.unlinkSync(RESTART_FLAG);

  const handle = getHandle();
  if (handle) {
    try {
      await handle.shutdown();
    } catch {}
  }

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {}

  console.log("[bot] Iniciando nueva sesión (se generará QR nuevo)...");
  start().catch((err) => console.error("[bot] Error al reiniciar:", err));
}, 1_000);

// ── Arranque inicial ──────────────────────────────────────────────────────────
console.log("[bot] Iniciando agente WhatsApp...");
start().catch((err) => {
  console.error("[bot] Error fatal al arrancar:", err);
  process.exit(1);
});
