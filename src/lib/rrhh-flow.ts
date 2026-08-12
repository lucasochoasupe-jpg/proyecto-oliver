import type makeWASocket from "@whiskeysockets/baileys";
import {
  insertMessage,
  getOrCreateConversation,
  setPendingAdminReport,
  enqueueOutbox,
  validarEmpleadoDB,
  listSucursales,
  getFlowState,
  setFlowState,
  deleteFlowState,
  type Conversation,
} from "./db";
import { parseDetalle } from "./openrouter";
import { sendSafe } from "./baileys/send";

type Sock = ReturnType<typeof makeWASocket>;

// ── Estado del flujo RRHH (persistente en SQLite, por número de teléfono) ─────
// Se guarda en la tabla flow_state, así un reinicio de PM2 no corta a quien está
// a mitad de un aviso. El aviso a Administración, además, se persiste apenas se
// genera (outbox + messages), así que nunca se pierde.

type Categoria = "Enfermedad" | "Motivo Personal" | "Licencia" | "Urgencia";

type Step =
  | "nombre"
  | "sucursal"
  | "menu"
  | "ausencia_motivo"
  | "enfermedad_cert"
  | "datos"
  | "cierre";

interface RRHHState {
  step: Step;
  nombre?: string;
  sucursal?: string;
  categoria?: Categoria;
  certificado?: boolean;
}

const FLOW = "rrhh";
const TTL_SEC = 30 * 60; // 30 minutos de inactividad → se descarta

export function clearRRHH(phone: string): void {
  deleteFlowState(phone, FLOW);
}

// ── Mensajes fijos ────────────────────────────────────────────────────────────

const GREETING =
  "¡Hola! Todo bien por acá 😊 Soy Sanca, el asistente virtual de la Panadería San Cayetano II. " +
  "Para empezar, ¿me podés indicar tu *Nombre y Apellido*?";

function listaSucursales(): string {
  return listSucursales()
    .map((s, i) => `* [${i + 1}] ${s.nombre}`)
    .join("\n");
}

function sucursalPrompt(nombre: string): string {
  return `Gracias, ${nombre}. ¿A qué sucursal pertenecés?\n${listaSucursales()}`;
}

function menuEmpleados(): string {
  return (
    "Elegí una de estas opciones:\n" +
    "* [1] Notificar Ausencia / Certificado\n" +
    "* [2] Solicitar Licencia\n" +
    "* [3] Urgencia\n\n" +
    "Aclaración: si tu consulta es por sueldos, adelantos, cambios de horario, etc., se tiene que gestionar de forma presencial.\n\n" +
    '(Escribí "volver" para ver este menú en cualquier momento, o "cancelar" para salir.)'
  );
}

function motivoPrompt(): string {
  return (
    "Seleccioná el número del motivo de tu ausencia:\n" +
    "* [1] Enfermedad\n" +
    "* [2] Motivo Personal\n" +
    "* [3] Volver al menú principal"
  );
}

function certPrompt(): string {
  return (
    "¿Contás con el certificado médico correspondiente?\n" +
    "* [1] Sí, tengo certificado\n" +
    "* [2] No, no tengo certificado\n" +
    "* [3] Volver al menú principal"
  );
}

function datosPrompt(categoria: Categoria): string {
  const que =
    categoria === "Licencia" ? "el motivo de la licencia" : "el motivo";
  return (
    `Perfecto. Contame en un mensaje: *duración (en días)*, *fecha de inicio*, ` +
    `*fecha de fin* y una *breve descripción* de ${que}.\n\n` +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function urgenciaPrompt(): string {
  return (
    "Contame en un mensaje cuál es la urgencia y la derivo a Administración de inmediato.\n\n" +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function cierrePrompt(): string {
  return (
    "¿Necesitás algo más?\n" +
    "* [1] Hacer otra consulta\n" +
    "* [2] Dar por terminada la conversación"
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MARCAR_QR_MSG =
  "Para marcar tu entrada o salida tenés que escanear el código QR de tu sucursal — " +
  "ese es el único canal que registra tu asistencia. Por acá te puedo ayudar con otros " +
  "temas, como ausencias, licencias o urgencias.";

// Detecta intención de marcar asistencia en texto libre, para redirigir al QR en vez
// de seguir con el flujo de RRHH (que no tiene forma de registrar entrada/salida).
function esIntentoMarcarAsistencia(raw: string): boolean {
  const low = raw.toLowerCase();
  if (/\bfich\w*\b/.test(low)) return true;
  if (/\bmarcar\b/.test(low) && /(entrada|salida|asistencia|ingreso)/.test(low)) return true;
  if (/^(entrada|salida|asistencia|registro)[.!]?$/.test(low.trim())) return true;
  return false;
}

function matchSucursal(raw: string): string | null {
  const sucursales = listSucursales();
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= sucursales.length) {
    return sucursales[asNum - 1].nombre;
  }
  const hit = sucursales.find(
    (s) => s.nombre.toLowerCase() === raw.trim().toLowerCase()
  );
  return hit?.nombre ?? null;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function handleRRHH(
  sock: Sock,
  remoteJid: string,
  phone: string,
  text: string,
  convo: Conversation
): Promise<void> {
  const reply = async (t: string): Promise<void> => {
    insertMessage(convo.id, "assistant", t);
    await sendSafe(sock, remoteJid, { text: t });
  };

  const raw = text.trim();
  const low = raw.toLowerCase();

  // Salida global
  if (low === "cancelar") {
    clearRRHH(phone);
    await reply("Listo, cancelé la operación. Cuando quieras escribime de nuevo. 👋");
    return;
  }

  let state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);

  // Redirección a QR: si pide marcar asistencia, no seguimos con RRHH (salvo en
  // "datos", donde el texto libre podría mencionar "salida"/"entrada" de forma
  // incidental, ej. describiendo un viaje).
  if ((!state || state.step !== "datos") && esIntentoMarcarAsistencia(raw)) {
    await reply(MARCAR_QR_MSG);
    return;
  }

  // "1"/"2" sueltos como primer mensaje: probablemente la persona quiso responder
  // el "¿Qué vas a marcar? [1] Entrada [2] Salida" del flujo de QR y se perdió acá.
  // Solo aplica sin estado — en medio del flujo esos números eligen sucursal/menú.
  if (!state && /^[12][.!]?$/.test(raw)) {
    await reply(MARCAR_QR_MSG);
    return;
  }

  // Sin estado → primer contacto: saludo + pedir nombre
  if (!state) {
    setFlowState(phone, FLOW, { step: "nombre" });
    await reply(GREETING);
    return;
  }

  const touch = (patch: Partial<RRHHState>): void => {
    state = { ...(state as RRHHState), ...patch };
    setFlowState(phone, FLOW, state);
  };

  // "volver" global (solo tiene sentido una vez registrado)
  if (low === "volver" && state.nombre && state.sucursal) {
    touch({ step: "menu", categoria: undefined, certificado: undefined });
    await reply(menuEmpleados());
    return;
  }

  switch (state.step) {
    case "nombre": {
      const valido = validarEmpleadoDB(raw);
      if (!valido) {
        await reply(
          "Ese nombre no figura en nuestra nómina de empleados. Verificá tu " +
            'Nombre y Apellido e intentá de nuevo, o escribí "cancelar" para salir.'
        );
        return;
      }
      touch({ step: "sucursal", nombre: valido });
      await reply(sucursalPrompt(valido));
      return;
    }

    case "sucursal": {
      const suc = matchSucursal(raw);
      if (!suc) {
        await reply(`No reconocí esa opción.\n\n${sucursalPrompt(state.nombre as string)}`);
        return;
      }
      touch({ step: "menu", sucursal: suc });
      await reply(menuEmpleados());
      return;
    }

    case "menu": {
      if (raw === "1") {
        touch({ step: "ausencia_motivo" });
        await reply(motivoPrompt());
        return;
      }
      if (raw === "2") {
        touch({ step: "datos", categoria: "Licencia" });
        await reply(datosPrompt("Licencia"));
        return;
      }
      if (raw === "3") {
        touch({ step: "datos", categoria: "Urgencia" });
        await reply(urgenciaPrompt());
        return;
      }
      await reply(`Elegí una opción válida.\n\n${menuEmpleados()}`);
      return;
    }

    case "ausencia_motivo": {
      if (raw === "1") {
        touch({ step: "enfermedad_cert" });
        await reply(certPrompt());
        return;
      }
      if (raw === "2") {
        touch({ step: "datos", categoria: "Motivo Personal" });
        await reply(datosPrompt("Motivo Personal"));
        return;
      }
      if (raw === "3") {
        touch({ step: "menu", categoria: undefined, certificado: undefined });
        await reply(menuEmpleados());
        return;
      }
      await reply(`Elegí una opción válida.\n\n${motivoPrompt()}`);
      return;
    }

    case "enfermedad_cert": {
      if (raw === "1") {
        touch({ step: "datos", categoria: "Enfermedad", certificado: true });
        await reply(datosPrompt("Enfermedad"));
        return;
      }
      if (raw === "2") {
        touch({ step: "datos", categoria: "Enfermedad", certificado: false });
        await reply(datosPrompt("Enfermedad"));
        return;
      }
      if (raw === "3") {
        touch({ step: "menu", categoria: undefined, certificado: undefined });
        await reply(menuEmpleados());
        return;
      }
      await reply(`Elegí una opción válida.\n\n${certPrompt()}`);
      return;
    }

    case "datos": {
      await procesarDatos(phone, state, raw, convo, reply);
      touch({ step: "cierre", categoria: undefined, certificado: undefined });
      return;
    }

    case "cierre": {
      if (raw === "1") {
        touch({ step: "menu" });
        await reply(menuEmpleados());
        return;
      }
      if (raw === "2" || low === "terminar" || low === "no") {
        clearRRHH(phone);
        await reply(
          "¡Muchas gracias por comunicarte con Panadería San Cayetano II! Que tengas un excelente día. 👋"
        );
        return;
      }
      await reply(cierrePrompt());
      return;
    }
  }
}

// ── Generación del aviso a Administración ─────────────────────────────────────

async function procesarDatos(
  phone: string,
  state: RRHHState,
  rawDatos: string,
  convo: Conversation,
  reply: (t: string) => Promise<void>
): Promise<void> {
  const categoria = state.categoria as Categoria;
  const nombre = state.nombre as string;
  const sucursal = state.sucursal as string;

  // LLM solo para resumir el texto libre; si falla, usa el texto crudo.
  const detalle = await parseDetalle(rawDatos);

  const motivoText =
    categoria === "Enfermedad"
      ? "una ausencia por Enfermedad"
      : categoria === "Motivo Personal"
      ? "una ausencia por Motivo Personal"
      : categoria === "Licencia"
      ? "una solicitud de Licencia"
      : "una Urgencia";

  const certNota =
    categoria === "Enfermedad" && state.certificado === false
      ? " ⚠️ CERTIFICADO PENDIENTE: el empleado aún no lo presentó."
      : "";

  const reporte =
    `Aviso de Sanca: ${nombre} de sucursal ${sucursal} comunica ${motivoText}. ` +
    `Detalle: ${detalle}.${certNota} Contacto: ${phone}`;

  // Enviar a Administración (parte crítica: se persiste + se encola siempre)
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    const adminConvo = getOrCreateConversation(adminPhone);
    setPendingAdminReport(convo.id, reporte);
    insertMessage(adminConvo.id, "assistant", reporte);
    enqueueOutbox(adminConvo.id, adminPhone, reporte);
    console.log(`[rrhh] -> Aviso enviado a admin (${adminPhone}): "${reporte}"`);
  } else {
    console.warn(
      "[rrhh] ADMIN_PHONE no configurado — el aviso NO se pudo enviar a Administración"
    );
  }

  // Confirmación al empleado según el caso
  if (categoria === "Enfermedad" && state.certificado === true) {
    await reply(
      "Avisé a Administración sobre tu ausencia. ✅\n\n" +
        "Ahora, por favor adjuntá el archivo (PDF o foto) de tu certificado médico para completar el registro."
    );
  } else if (categoria === "Enfermedad" && state.certificado === false) {
    await reply(
      "Avisé a Administración sobre tu ausencia. ✅\n\n" +
        "Es *obligatorio* que presentes el certificado médico a la brevedad: podés enviarlo por " +
        "este mismo número en cuanto lo tengas, o presentarlo en Administración cuando te reintegres."
    );
  } else if (categoria === "Urgencia") {
    await reply("Avisé a Administración sobre tu urgencia. ✅ Se van a comunicar a la brevedad.");
  } else {
    await reply("Listo, avisé a Administración. ✅");
  }

  await reply(cierrePrompt());
}
