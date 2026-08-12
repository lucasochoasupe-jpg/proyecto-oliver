import type makeWASocket from "@whiskeysockets/baileys";
import type { WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getSucursalByNombre,
  getSucursalById,
  insertAsistencia,
  insertAsistenciaRechazada,
  getEmpleadoByNombre,
  getEmpleadoByJid,
  updateEmpleado,
  vincularEmpleadoJid,
  validarEmpleadoDB,
  buscarEmpleadoParecido,
  getFlowState,
  setFlowState,
  deleteFlowState,
} from "../db";
import { handleRRHH, clearRRHH } from "../rrhh-flow";
import { resolvePhone, setLidPhone } from "./contacts";
import { sendSafe } from "./send";

// ── Estado pendiente de asistencia (persistente en SQLite, por teléfono) ─────
// Se guarda en flow_state para que un reinicio de PM2 no corte a quien está
// marcando. Expira solo tras TTL de inactividad.
interface AttendancePending {
  sucursalId: number;
  sucursalNombre: string;
  step: "nombre" | "confirmarNombre" | "tipo" | "location";
  nombre?: string;
  tipo?: "entrada" | "salida";
  candidato?: string;
}

const NOMBRE_NO_ENCONTRADO_MSG = "Tu nombre no se encuentra en la nómina. Avisá a Administración o intentá nuevamente.";
const ATT_FLOW = "attendance";
const ATT_TTL_SEC = 30 * 60; // 30 min de inactividad

const getAttendance = (phone: string): AttendancePending | null =>
  getFlowState<AttendancePending>(phone, ATT_FLOW, ATT_TTL_SEC);
const setAttendance = (phone: string, state: AttendancePending): void =>
  setFlowState(phone, ATT_FLOW, state);
const clearAttendance = (phone: string): void => deleteFlowState(phone, ATT_FLOW);

function preguntaTipoMsg(nombre: string, sucursalNombre: string): string {
  // Antes se intentaba sacar "el nombre de pila" con nombre.split(" ")[1],
  // asumiendo que la nómina siempre está como "Apellido Nombre" — pero no todos
  // los registros lo están (ej. "Lucas Ochoa" está cargado como Nombre Apellido),
  // así que terminaba saludando con el apellido. Usar el nombre completo evita
  // tener que adivinar el orden.
  return `¡Hola, ${nombre}! 👋 ¿Qué vas a marcar en ${sucursalNombre}?\n* [1] Entrada\n* [2] Salida`;
}

function haversineMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Sock = ReturnType<typeof makeWASocket>;

// Continúa el flujo de asistencia una vez que el nombre quedó confirmado
// (matcheó directo, o el empleado confirmó "sí" al candidato sugerido por
// matching aproximado). Chequea celular/vínculo de WhatsApp y pasa al paso
// de tipo (entrada/salida).
async function continuarConNombreValidado(
  sock: Sock,
  sendJid: string,
  phone: string,
  pendingAtt: AttendancePending,
  nombreValido: string
): Promise<void> {
  const empleado = getEmpleadoByNombre(nombreValido);
  if (!empleado) {
    await sendSafe(sock, sendJid, {
      text: `Hubo un problema para encontrarte en la nómina. Probá de nuevo o consultá con Administración.`,
    });
    clearAttendance(phone);
    return;
  }
  let celularRecienRegistrado = false;
  if (!empleado.celular) {
    // Antes esto rechazaba el marcado ("celular no registrado"). Ahora, si el
    // nombre matchea bien contra la nómina, se usa el número con el que está
    // escribiendo como su celular — mismo formato que los demás — y se avisa.
    updateEmpleado(empleado.id, { celular: phone });
    celularRecienRegistrado = true;
    console.log(`[bot] [asistencia] Celular auto-registrado: ${nombreValido} → ${phone}`);
  }
  if (empleado.jid && empleado.jid !== phone) {
    insertAsistenciaRechazada({
      phone,
      nombre: nombreValido,
      sucursal_id: pendingAtt.sucursalId,
      motivo: "jid_no_autorizado",
    });
    await sendSafe(sock, sendJid, {
      text: `❌ Ese nombre ya está vinculado a otro número. Si lo querés cambiar, avisá a Administración.`,
    });
    clearAttendance(phone);
    console.log(`[bot] [asistencia] JID no autorizado: ${phone} intentó marcar como ${nombreValido} (JID registrado: ${empleado.jid})`);
    return;
  }
  if (!empleado.jid) {
    vincularEmpleadoJid(empleado.id, phone);
    console.log(`[bot] [asistencia] JID vinculado: ${nombreValido} → ${phone}`);
  }
  setAttendance(phone, { ...pendingAtt, step: "tipo", nombre: nombreValido });
  const avisoCelular = celularRecienRegistrado
    ? "📱 Registramos este número como tu contacto para marcar asistencia.\n\n"
    : "";
  await sendSafe(sock, sendJid, {
    text: avisoCelular + preguntaTipoMsg(nombreValido, pendingAtt.sucursalNombre),
  });
}

export async function handleIncoming(sock: Sock, msg: WAMessage): Promise<void> {
  if (msg.key.fromMe) {
    console.log(`[bot] msg ignorado: fromMe=true`);
    return;
  }

  const remoteJid = msg.key.remoteJid ?? "";
  if (remoteJid.endsWith("@g.us")) {
    console.log(`[bot] msg ignorado: grupo ${remoteJid}`);
    return;
  }
  const isUser =
    remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
  if (!isUser) {
    console.log(`[bot] msg ignorado: jid inesperado ${remoteJid}`);
    return;
  }

  // Baileys tiene un bug conocido enviando mensajes a JIDs @lid (se "envían" sin
  // error pero nunca llegan al destinatario). Cuando el mensaje trae el número de
  // teléfono real (senderPn), respondemos a ese JID en vez del @lid crudo.
  const senderPn = (msg.key as { senderPn?: string }).senderPn;
  const sendJid =
    remoteJid.endsWith("@lid") && senderPn
      ? senderPn.includes("@") ? senderPn : `${senderPn}@s.whatsapp.net`
      : remoteJid;
  if (remoteJid.endsWith("@lid")) {
    console.log(`[bot] lid=${remoteJid} senderPn=${senderPn ?? "(ninguno)"} sendJid=${sendJid}`);
  }

  // WhatsApp no siempre manda senderPn junto al mensaje (a veces sí, a veces no,
  // para el mismo contacto). Cuando lo manda, lo aprendemos y lo persistimos
  // (setLidPhone) para no depender de que vuelva a aparecer — así una vez
  // aprendida la relación lid↔teléfono, sobrevive a reinicios del bot y a que
  // WhatsApp deje de mandar senderPn más adelante.
  if (remoteJid.endsWith("@lid") && senderPn) {
    setLidPhone(remoteJid, senderPn.replace("@s.whatsapp.net", ""));
  }
  const phone = resolvePhone(remoteJid);

  const pushName = (msg as { pushName?: string }).pushName ?? null;
  const senderLabel = pushName ? `${pushName} (${phone})` : phone;

  const tipo = msg.message ? Object.keys(msg.message)[0] : "null";

  // ── Ubicación: validar asistencia pendiente ───────────────────────────────
  // Cubre tanto "ubicación actual" (locationMessage) como "ubicación en tiempo
  // real" (liveLocationMessage) — WhatsApp las manda como tipos distintos, pero
  // ambas traen degreesLatitude/degreesLongitude con el mismo formato.
  if (tipo === "locationMessage" || tipo === "liveLocationMessage") {
    const locMsg = msg.message?.locationMessage ?? msg.message?.liveLocationMessage;
    const pending = getAttendance(phone);
    if (locMsg && pending && pending.step === "location" && pending.tipo) {
      const lat = locMsg.degreesLatitude ?? 0;
      const lon = locMsg.degreesLongitude ?? 0;
      const branch = getSucursalById(pending.sucursalId);
      if (!branch || branch.lat == null || branch.lon == null) {
        insertAsistenciaRechazada({
          phone,
          nombre: pending.nombre ?? pushName ?? null,
          sucursal_id: pending.sucursalId,
          tipo: pending.tipo,
          lat,
          lon,
          distancia_metros: null,
          motivo: "sucursal_sin_gps",
        });
        await sendSafe(sock, sendJid, {
          text: "La sucursal aún no tiene ubicación configurada. Consultá con Administración.",
        });
        console.log(`[bot] [asistencia] Rechazado (sucursal sin GPS): ${senderLabel} en ${pending.sucursalNombre} — intento guardado`);
      } else {
        const distancia = haversineMetros(lat, lon, branch.lat, branch.lon);
        if (distancia <= branch.radio_metros) {
          getOrCreateConversation(phone, pushName);
          insertAsistencia(phone, pending.nombre ?? pushName ?? phone, pending.sucursalId, pending.tipo, lat, lon);
          const hora = new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
          const tipoStr = pending.tipo === "entrada" ? "Entrada" : "Salida";
          const cierre =
            pending.tipo === "entrada"
              ? "¡Que tengas una buena jornada! 💪"
              : "¡Nos vemos! Que tengas un buen día. 👋";
          await sendSafe(sock, sendJid, {
            text: `✅ ${tipoStr} registrada en ${pending.sucursalNombre} — ${hora}\n${cierre}`,
          });
          console.log(`[bot] [asistencia] ${pending.tipo} registrada: ${senderLabel} en ${pending.sucursalNombre}`);
        } else {
          insertAsistenciaRechazada({
            phone,
            nombre: pending.nombre ?? pushName ?? null,
            sucursal_id: pending.sucursalId,
            tipo: pending.tipo,
            lat,
            lon,
            distancia_metros: Math.round(distancia),
            motivo: "fuera_de_rango",
          });
          await sendSafe(sock, sendJid, {
            text: `❌ No podemos registrar tu asistencia. Tu ubicación está a ${Math.round(distancia)}m de la sucursal ${pending.sucursalNombre} (máximo permitido: ${branch.radio_metros}m).\nPara volver a intentarlo, escaneá el QR de tu sucursal de nuevo.\n¡Saludos! 👋`,
          });
          console.log(`[bot] [asistencia] Rechazado: ${senderLabel} a ${Math.round(distancia)}m de ${pending.sucursalNombre} — intento guardado`);
        }
      }
      clearAttendance(phone);
    } else {
      await sendSafe(sock, sendJid, {
        text: "Tu sesión para marcar asistencia expiró (o no la iniciaste). Escaneá el QR de tu sucursal de nuevo para volver a intentarlo.\n¡Saludos! 👋",
      });
      console.log(`[bot] [asistencia] Ubicación sin flujo pendiente (expirado): ${senderLabel}`);
    }
    return;
  }

  // ── Imágenes y documentos: reenviar al admin ──────────────────────────────
  if (tipo === "imageMessage" || tipo === "documentMessage" || tipo === "documentWithCaptionMessage") {
    const convoForMedia = getOrCreateConversation(phone, pushName);
    await handleMediaForward(sock, msg, sendJid, phone, pushName, senderLabel, tipo, convoForMedia.id);
    return;
  }

  // ── Audios: pedir texto ───────────────────────────────────────────────────
  const text =
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    null;

  if (!text) {
    if (tipo === "audioMessage" || tipo === "pttMessage") {
      await sendSafe(sock, sendJid, {
        text: "Hola, soy Sanca. Por el momento solo puedo atenderte por mensajes de texto. Por favor, escribí tu consulta y con gusto te ayudo. 😊",
      });
      console.log(`[bot] -> Audio recibido de ${remoteJid}, se solicitó texto`);
    } else {
      console.log(`[bot] msg ignorado: sin texto (tipo=${tipo})`);
    }
    return;
  }

  console.log(`[bot] <- Mensaje de ${senderLabel}: "${text}"`);

  // ── Asistencia: flujo por pasos ───────────────────────────────────────────
  const pendingAtt = getAttendance(phone);

  if (pendingAtt && pendingAtt.step === "nombre") {
    if (text.trim().toLowerCase() === "cancelar") {
      clearAttendance(phone);
      await sendSafe(sock, sendJid, { text: "Marcado de asistencia cancelado.\n¡Saludos! 👋" });
      return;
    }
    const nombreValido = validarEmpleadoDB(text.trim());
    if (nombreValido) {
      await continuarConNombreValidado(sock, sendJid, phone, pendingAtt, nombreValido);
      return;
    }
    // No matcheó exacto/subset — probar si se parece a alguien (typo) antes de rechazar.
    const candidato = buscarEmpleadoParecido(text.trim());
    if (candidato) {
      setAttendance(phone, { ...pendingAtt, step: "confirmarNombre", candidato });
      await sendSafe(sock, sendJid, {
        text: `¿Sos *${candidato}*? Respondé *sí* o *no*.`,
      });
      return;
    }
    await sendSafe(sock, sendJid, { text: NOMBRE_NO_ENCONTRADO_MSG });
    return;
  }

  if (pendingAtt && pendingAtt.step === "confirmarNombre" && pendingAtt.candidato) {
    const t = text.trim().toLowerCase();
    if (t === "cancelar") {
      clearAttendance(phone);
      await sendSafe(sock, sendJid, { text: "Marcado de asistencia cancelado.\n¡Saludos! 👋" });
      return;
    }
    if (t === "si" || t === "sí" || t === "s") {
      await continuarConNombreValidado(sock, sendJid, phone, pendingAtt, pendingAtt.candidato);
      return;
    }
    if (t === "no" || t === "n") {
      setAttendance(phone, { ...pendingAtt, step: "nombre", candidato: undefined });
      await sendSafe(sock, sendJid, { text: NOMBRE_NO_ENCONTRADO_MSG });
      return;
    }
    await sendSafe(sock, sendJid, {
      text: `Respondé *sí* o *no*: ¿sos *${pendingAtt.candidato}*?`,
    });
    return;
  }

  if (pendingAtt && pendingAtt.step === "tipo") {
    const t = text.trim().toLowerCase();
    if (t === "cancelar") {
      clearAttendance(phone);
      await sendSafe(sock, sendJid, { text: "Marcado de asistencia cancelado.\n¡Saludos! 👋" });
      return;
    }
    if (t === "1" || t === "entrada") {
      setAttendance(phone, { ...pendingAtt, step: "location", tipo: "entrada" });
      await sendSafe(sock, sendJid, {
        text: "Compartí tu ubicación actual para registrar tu *entrada*. 📍\n\nTocá el clip (📎) → Ubicación → Enviar ubicación actual.\n\nO escribí \"cancelar\" para salir.",
      });
    } else if (t === "2" || t === "salida") {
      setAttendance(phone, { ...pendingAtt, step: "location", tipo: "salida" });
      await sendSafe(sock, sendJid, {
        text: "Compartí tu ubicación actual para registrar tu *salida*. 📍\n\nTocá el clip (📎) → Ubicación → Enviar ubicación actual.\n\nO escribí \"cancelar\" para salir.",
      });
    } else {
      await sendSafe(sock, sendJid, {
        text: `¿Qué vas a marcar en ${pendingAtt.sucursalNombre}?\n* [1] Entrada\n* [2] Salida\n\nO escribí "cancelar" para salir.`,
      });
    }
    return;
  }

  // ── Asistencia: inicio con QR (MARCAR <sucursal>) ─────────────────────────
  const marcarMatch = text.trim().match(/^marcar\s+(.+)$/i);
  if (marcarMatch) {
    const nombreBuscado = marcarMatch[1].trim();
    const branch = getSucursalByNombre(nombreBuscado);
    if (!branch) {
      await sendSafe(sock, sendJid, {
        text: `No se encontró la sucursal "${nombreBuscado}". Escaneá el QR de tu sucursal.`,
      });
    } else {
      clearRRHH(phone); // por si venía de una charla RRHH a medio hacer
      const empleadoVinculado = getEmpleadoByJid(phone);
      if (empleadoVinculado) {
        // Este WhatsApp ya está vinculado a un empleado — no hace falta volver a
        // pedirle el nombre cada vez, el vínculo teléfono↔empleado ya es la
        // verificación real (ver conversación sobre esto).
        setAttendance(phone, { sucursalId: branch.id, sucursalNombre: branch.nombre, step: "tipo", nombre: empleadoVinculado.nombre });
        await sendSafe(sock, sendJid, {
          text: preguntaTipoMsg(empleadoVinculado.nombre, branch.nombre),
        });
      } else {
        setAttendance(phone, { sucursalId: branch.id, sucursalNombre: branch.nombre, step: "nombre" });
        await sendSafe(sock, sendJid, {
          text: `Hola! Para registrar tu asistencia en ${branch.nombre}, escribí tu *Nombre y Apellido*:`,
        });
      }
    }
    return;
  }

  const convo = getOrCreateConversation(phone, pushName);
  insertMessage(convo.id, "user", text);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") {
    console.log(`[bot] Conversación ${convo.id} en modo HUMAN — no respondo.`);
    return;
  }

  // Flujo RRHH determinístico (menús en código; el LLM solo resume texto libre).
  // Los mensajes salientes y el aviso a Administración se manejan dentro del flujo.
  try {
    await handleRRHH(sock, sendJid, phone, text, convo);
  } catch (err) {
    console.error("[bot] Error en el flujo RRHH:", err);
    await sendSafe(sock, sendJid, {
      text: "Disculpá, tuve un inconveniente técnico. Probá de nuevo en un ratito. 🙏",
    });
  }
}

async function handleMediaForward(
  sock: Sock,
  msg: WAMessage,
  sendJid: string,
  phone: string,
  pushName: string | null,
  senderLabel: string,
  tipo: string,
  conversationId: number,
): Promise<void> {
  const adminPhone = process.env.ADMIN_PHONE;
  console.log(`[bot] <- Archivo (${tipo}) recibido de ${senderLabel}`);

  // Confirmar al empleado y preguntar cierre
  await sendSafe(sock, sendJid, {
    text: "Recibí tu archivo. Lo estoy enviando a Administración ahora mismo. ✅\n\n¿Necesitás algo más o damos por terminada la conversación?\n* [1] Necesito hacer otra consulta\n* [2] Dar por terminada la conversación",
  });

  if (!adminPhone) {
    console.warn("[bot] ADMIN_PHONE no configurado — no se puede reenviar el archivo.");
    return;
  }

  const adminJid = adminPhone.includes("@")
    ? adminPhone
    : `${adminPhone}@s.whatsapp.net`;

  try {
    // Descargar y reenviar el archivo
    const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
    const caption = `📎 Certificado de ${senderLabel}`;

    if (tipo === "imageMessage") {
      const mimetype = msg.message?.imageMessage?.mimetype ?? "image/jpeg";
      await sendSafe(sock, adminJid, { image: buffer, caption, mimetype });
    } else {
      const docMsg =
        msg.message?.documentMessage ??
        msg.message?.documentWithCaptionMessage?.message?.documentMessage;
      const mimetype = docMsg?.mimetype ?? "application/pdf";
      const fileName = docMsg?.fileName ?? "certificado";
      await sendSafe(sock, adminJid, { document: buffer, caption, mimetype, fileName });
    }

    console.log(`[bot] -> Archivo reenviado a admin (${adminPhone})`);
  } catch (err) {
    console.error("[bot] Error al reenviar archivo al admin:", err);
    await sendSafe(sock, sendJid, {
      text: "Hubo un problema al enviar el archivo. Por favor, intentá de nuevo o envialo directamente a Administración.",
    });
  }
}
