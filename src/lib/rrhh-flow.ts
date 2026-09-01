import type makeWASocket from "@whiskeysockets/baileys";
import {
  insertMessage,
  insertMessageReturningId,
  getOrCreateConversation,
  setPendingAdminReport,
  enqueueOutbox,
  validarEmpleadoDB,
  listSucursales,
  getFlowState,
  setFlowState,
  deleteFlowState,
  crearCertificadoPendiente,
  listCertificadosPendientesActivos,
  getCertificadoPendientePorId,
  crearAusenciaReportada,
  calcularSaldoVacaciones,
  type Conversation,
  type CertificadoPendiente,
} from "./db";
import { parseDetalle } from "./openrouter";
import { sendSafe } from "./baileys/send";

type Sock = ReturnType<typeof makeWASocket>;

// ── Estado del flujo RRHH (persistente en SQLite, por número de teléfono) ─────
// Se guarda en la tabla flow_state, así un reinicio de PM2 no corta a quien está
// a mitad de un aviso. El aviso a Administración, además, se persiste apenas se
// genera (outbox + messages), así que nunca se pierde.

type Categoria = "Enfermedad" | "Motivo Personal" | "Vacaciones" | "Urgencia";

type Step =
  | "nombre"
  | "sucursal"
  | "menu"
  | "ausencia_motivo"
  | "enfermedad_cert"
  | "fecha_inicio"
  | "fecha_fin"
  | "datos"
  | "certificado_confirmar"
  | "certificado_elegir"
  | "certificado_esperando_archivo"
  | "certificado_inline_esperando_archivo"
  | "cierre";

interface RRHHState {
  step: Step;
  nombre?: string;
  sucursal?: string;
  categoria?: Categoria;
  certificado?: boolean;
  fechaInicio?: string;
  fechaFin?: string;
  certificadoPendienteId?: number;
}

const FLOW = "rrhh";
const TTL_SEC = 30 * 60; // 30 minutos de inactividad → se descarta

export function clearRRHH(phone: string): void {
  deleteFlowState(phone, FLOW);
}

// El bot solo vincula un archivo recibido a un certificado si el empleado
// pasó por uno de estos dos caminos explícitos — nunca de forma automática
// ante cualquier imagen/documento que llegue:
//  1) submenú "Entregar certificado pendiente" y confirmó cuál era (ver caso
//     "certificado_confirmar" más abajo), o
//  2) recién avisó una ausencia por Enfermedad y dijo "sí, tengo certificado"
//     (ver "certificado_inline_esperando_archivo" más abajo).
export function esperandoCertificado(phone: string): boolean {
  const state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);
  return state?.step === "certificado_esperando_archivo";
}

export function esperandoCertificadoInline(phone: string): boolean {
  const state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);
  return state?.step === "certificado_inline_esperando_archivo";
}

export function getNombreCertificadoInline(phone: string): string | null {
  const state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);
  return state?.step === "certificado_inline_esperando_archivo" ? state.nombre ?? null : null;
}

// El certificado puntual elegido/confirmado por el camino [4] Entregar
// certificado pendiente — puede haber más de un pendiente abierto para el
// mismo teléfono, por eso se guarda el id exacto en el estado en vez de
// asumir "el más reciente" al momento de recibir el archivo.
export function getCertificadoPendienteIdSeleccionado(phone: string): number | null {
  const state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);
  return state?.step === "certificado_esperando_archivo" ? state.certificadoPendienteId ?? null : null;
}

// Una vez que handleMediaForward reenvía el archivo, esto cierra el paso de
// espera para que la conversación siga por el cierre normal.
export function marcarCertificadoEntregado(phone: string): void {
  const state = getFlowState<RRHHState>(phone, FLOW, TTL_SEC);
  if (!state) return;
  setFlowState(phone, FLOW, { ...state, step: "cierre" });
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
    "* [2] Solicitar Vacaciones\n" +
    "* [3] Urgencia\n" +
    "* [4] Entregar certificado pendiente\n\n" +
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

function fechaInicioPrompt(): string {
  return (
    "¿Qué día empieza (o empezó)? Escribilo en formato *DD/MM* (por ej. 10/09).\n\n" +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function fechaFinPrompt(): string {
  return (
    "¿Y hasta qué día? Si es un solo día, escribí la misma fecha de nuevo.\n\n" +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function datosPrompt(categoria: Categoria): string {
  const de = categoria === "Vacaciones" ? "de las vacaciones" : "del motivo";
  return (
    `Perfecto. Contame ahora, en un mensaje, una *breve descripción* ${de}.\n\n` +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function urgenciaPrompt(): string {
  return (
    "Contame en un mensaje cuál es la urgencia y la derivo a Administración de inmediato.\n\n" +
    '(Escribí "volver" para regresar al menú principal.)'
  );
}

function certificadoConfirmarPrompt(pendiente: CertificadoPendiente): string {
  const fecha = new Date(pendiente.created_at * 1000).toLocaleDateString("es-AR", {
    timeZone: AR_TZ,
  });
  return (
    `Encontré un certificado médico pendiente a tu nombre, del aviso de ausencia del ${fecha}.\n\n` +
    "¿Es ese el que vas a entregar ahora?\n" +
    "* [1] Sí, es ese\n" +
    "* [2] No, es otra cosa\n" +
    "* [3] Volver al menú principal"
  );
}

function certificadoElegirPrompt(pendientes: CertificadoPendiente[]): string {
  const lineas = pendientes
    .map((p, i) => {
      const fecha = new Date(p.created_at * 1000).toLocaleDateString("es-AR", { timeZone: AR_TZ });
      return `* [${i + 1}] Del aviso de ausencia del ${fecha}`;
    })
    .join("\n");
  return (
    `Tenés ${pendientes.length} certificados médicos pendientes a tu nombre:\n\n${lineas}\n` +
    "* [0] Volver al menú principal\n\n" +
    "¿Cuál de todos vas a entregar ahora?"
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
  "temas, como ausencias, vacaciones o urgencias.";

// Detecta intención de marcar asistencia en texto libre, para redirigir al QR en vez
// de seguir con el flujo de RRHH (que no tiene forma de registrar entrada/salida).
function esIntentoMarcarAsistencia(raw: string): boolean {
  const low = raw.toLowerCase();
  if (/\bfich\w*\b/.test(low)) return true;
  if (/\bmarcar\b/.test(low) && /(entrada|salida|asistencia|ingreso)/.test(low)) return true;
  if (/^(entrada|salida|asistencia|registro)[.!]?$/.test(low.trim())) return true;
  return false;
}

const AR_TZ = "America/Argentina/Buenos_Aires";

function anioActualAR(): number {
  return Number(new Date().toLocaleDateString("sv", { timeZone: AR_TZ }).slice(0, 4));
}

// Acepta DD/MM, DD-MM, DD/MM/AAAA, etc. Si falta el año, usa el año actual
// (huso horario Argentina). Devuelve ISO (AAAA-MM-DD) o null si no es una
// fecha de calendario válida (ej. 31/02).
//
// `minISO`, si se pasa, es la fecha mínima permitida (se usa para fecha_fin,
// pasando fecha_inicio): si la fecha SIN año explícito da un resultado
// anterior a `minISO`, se prueba con el año siguiente — pero solo se acepta
// si el salto da una diferencia corta (< 90 días), típica de un rango que
// cruza fin de año (ej. "30/12" → "02/01"). Si no, es más probable que sea un
// error real del empleado (ej. invirtió las fechas) y se deja que el caller
// lo rechace, en vez de reinterpretarlo silenciosamente un año entero adelante.
function diffEnDias(desdeISO: string, hastaISO: string): number {
  const a = new Date(`${desdeISO}T00:00:00Z`).getTime();
  const b = new Date(`${hastaISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function parseFechaAR(raw: string, minISO?: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anioExplicito = m[3] !== undefined;
  const anioBase = anioExplicito ? Number(m[3]) + (Number(m[3]) < 100 ? 2000 : 0) : anioActualAR();
  if (mes < 1 || mes > 12) return null;

  const construir = (anio: number): string | null => {
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${anio}-${pad(mes)}-${pad(dia)}`;
  };

  const iso = construir(anioBase);
  if (iso === null) return null;
  if (!anioExplicito && minISO && iso < minISO) {
    const isoSiguiente = construir(anioBase + 1);
    if (isoSiguiente !== null && isoSiguiente >= minISO && diffEnDias(minISO, isoSiguiente) <= 90) {
      return isoSiguiente;
    }
  }
  return iso;
}

function formatFechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
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
    touch({ step: "menu", categoria: undefined, certificado: undefined, fechaInicio: undefined, fechaFin: undefined });
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
        touch({ step: "fecha_inicio", categoria: "Vacaciones" });
        await reply(fechaInicioPrompt());
        return;
      }
      if (raw === "3") {
        touch({ step: "datos", categoria: "Urgencia" });
        await reply(urgenciaPrompt());
        return;
      }
      if (raw === "4") {
        const pendientes = listCertificadosPendientesActivos(phone);
        if (pendientes.length === 0) {
          await reply(`No tenés ningún certificado médico pendiente registrado a tu nombre.\n\n${menuEmpleados()}`);
          return;
        }
        if (pendientes.length === 1) {
          touch({ step: "certificado_confirmar", certificadoPendienteId: pendientes[0].id });
          await reply(certificadoConfirmarPrompt(pendientes[0]));
          return;
        }
        touch({ step: "certificado_elegir" });
        await reply(certificadoElegirPrompt(pendientes));
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
        touch({ step: "fecha_inicio", categoria: "Motivo Personal" });
        await reply(fechaInicioPrompt());
        return;
      }
      if (raw === "3") {
        touch({ step: "menu", categoria: undefined, certificado: undefined, fechaInicio: undefined, fechaFin: undefined });
        await reply(menuEmpleados());
        return;
      }
      await reply(`Elegí una opción válida.\n\n${motivoPrompt()}`);
      return;
    }

    case "enfermedad_cert": {
      if (raw === "1") {
        touch({ step: "fecha_inicio", categoria: "Enfermedad", certificado: true });
        await reply(fechaInicioPrompt());
        return;
      }
      if (raw === "2") {
        touch({ step: "fecha_inicio", categoria: "Enfermedad", certificado: false });
        await reply(fechaInicioPrompt());
        return;
      }
      if (raw === "3") {
        touch({ step: "menu", categoria: undefined, certificado: undefined, fechaInicio: undefined, fechaFin: undefined });
        await reply(menuEmpleados());
        return;
      }
      await reply(`Elegí una opción válida.\n\n${certPrompt()}`);
      return;
    }

    case "fecha_inicio": {
      const iso = parseFechaAR(raw);
      if (!iso) {
        await reply(`No pude entender esa fecha. Probá con el formato DD/MM (por ej. 10/09).\n\n${fechaInicioPrompt()}`);
        return;
      }
      touch({ step: "fecha_fin", fechaInicio: iso });
      await reply(fechaFinPrompt());
      return;
    }

    case "fecha_fin": {
      const iso = parseFechaAR(raw, state.fechaInicio);
      if (!iso) {
        await reply(`No pude entender esa fecha. Probá con el formato DD/MM (por ej. 15/09).\n\n${fechaFinPrompt()}`);
        return;
      }
      if (iso < (state.fechaInicio as string)) {
        await reply(
          `La fecha de fin no puede ser anterior a la de inicio (${formatFechaCorta(state.fechaInicio as string)}).\n\n${fechaFinPrompt()}`
        );
        return;
      }
      touch({ step: "datos", fechaFin: iso });
      await reply(datosPrompt(state.categoria as Categoria));
      return;
    }

    case "datos": {
      const esperaCertificadoInline = state.categoria === "Enfermedad" && state.certificado === true;
      await procesarDatos(phone, state, raw, convo, reply);
      touch({
        step: esperaCertificadoInline ? "certificado_inline_esperando_archivo" : "cierre",
        categoria: undefined,
        certificado: undefined,
        fechaInicio: undefined,
        fechaFin: undefined,
      });
      return;
    }

    case "certificado_confirmar": {
      if (raw === "1") {
        touch({ step: "certificado_esperando_archivo" });
        await reply("Perfecto. Adjuntá ahora el archivo (foto o PDF) del certificado médico.");
        return;
      }
      if (raw === "2") {
        touch({ step: "menu" });
        await reply(
          "Entendido, no lo vinculo a ese pendiente. Si necesitás avisar algo distinto, elegí una opción del menú.\n\n" +
            menuEmpleados()
        );
        return;
      }
      if (raw === "3") {
        touch({ step: "menu" });
        await reply(menuEmpleados());
        return;
      }
      const pendiente = state.certificadoPendienteId ? getCertificadoPendientePorId(state.certificadoPendienteId) : null;
      if (!pendiente) {
        touch({ step: "menu" });
        await reply(`Ese pendiente ya no está disponible.\n\n${menuEmpleados()}`);
        return;
      }
      await reply(`Elegí una opción válida.\n\n${certificadoConfirmarPrompt(pendiente)}`);
      return;
    }

    case "certificado_elegir": {
      if (raw === "0" || low === "volver") {
        touch({ step: "menu" });
        await reply(menuEmpleados());
        return;
      }
      const pendientes = listCertificadosPendientesActivos(phone);
      const idx = Number(raw) - 1;
      const elegido = Number.isInteger(idx) ? pendientes[idx] : undefined;
      if (!elegido) {
        if (pendientes.length === 0) {
          touch({ step: "menu" });
          await reply(`Esos pendientes ya no están disponibles.\n\n${menuEmpleados()}`);
          return;
        }
        await reply(`Elegí una opción válida.\n\n${certificadoElegirPrompt(pendientes)}`);
        return;
      }
      touch({ step: "certificado_esperando_archivo", certificadoPendienteId: elegido.id });
      await reply("Perfecto. Adjuntá ahora el archivo (foto o PDF) del certificado médico.");
      return;
    }

    case "certificado_esperando_archivo":
    case "certificado_inline_esperando_archivo": {
      await reply(
        'Todavía estoy esperando el archivo (foto o PDF) del certificado. Adjuntalo acá, o escribí "volver" para ir al menú principal.'
      );
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
      : categoria === "Vacaciones"
      ? "una solicitud de Vacaciones"
      : "una Urgencia";

  const certNota =
    categoria === "Enfermedad" && state.certificado === false
      ? " ⚠️ CERTIFICADO PENDIENTE: el empleado aún no lo presentó."
      : "";

  // Solo avisa a Administración si el pedido excede el saldo disponible — no
  // bloquea al empleado ni le dice nada distinto a él (ver
  // project_liquidacion_ausencias_justificadas / saldo de vacaciones).
  let vacacionesNota = "";
  if (categoria === "Vacaciones" && state.fechaInicio && state.fechaFin) {
    const diasPedidos = diffEnDias(state.fechaInicio, state.fechaFin) + 1;
    const anioPedido = Number(state.fechaInicio.slice(0, 4));
    const saldoInfo = calcularSaldoVacaciones(anioPedido).find((s) => s.nombre === nombre);
    if (saldoInfo && saldoInfo.saldo !== null && diasPedidos > saldoInfo.saldo) {
      vacacionesNota = ` ⚠️ SALDO INSUFICIENTE: pide ${diasPedidos} días, le quedan ${saldoInfo.saldo}.`;
    }
  }

  const rangoText =
    state.fechaInicio && state.fechaFin
      ? state.fechaInicio === state.fechaFin
        ? ` el ${formatFechaCorta(state.fechaInicio)}`
        : ` del ${formatFechaCorta(state.fechaInicio)} al ${formatFechaCorta(state.fechaFin)}`
      : "";

  const reporte =
    `Aviso de Sanca: ${nombre} de sucursal ${sucursal} comunica ${motivoText}${rangoText}. ` +
    `Detalle: ${detalle}.${certNota}${vacacionesNota} Contacto: ${phone}`;

  // Enviar a Administración (parte crítica: se persiste + se encola siempre)
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    const adminConvo = getOrCreateConversation(adminPhone);
    setPendingAdminReport(convo.id, reporte);
    const adminMessageId = insertMessageReturningId(adminConvo.id, "assistant", reporte);
    enqueueOutbox(adminConvo.id, adminPhone, reporte);
    console.log(`[rrhh] -> Aviso enviado a admin (${adminPhone}): "${reporte}"`);

    // Registro estructurado del rango de fechas — lo usa la liquidación de
    // sueldos para no descontar como ausencia injustificada un día que el
    // empleado sí avisó (Urgencia no tiene rango de fechas, no se registra acá).
    if (categoria !== "Urgencia" && state.fechaInicio && state.fechaFin) {
      crearAusenciaReportada({
        empleadoNombre: nombre,
        categoria,
        fechaInicio: state.fechaInicio,
        fechaFin: state.fechaFin,
        certificadoPendiente: categoria === "Enfermedad" && state.certificado === false,
        phone,
        adminMessageId,
      });
    }

    if (categoria === "Enfermedad" && state.certificado === false) {
      crearCertificadoPendiente(convo.id, phone, nombre, adminMessageId);
    }
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
        "Es *obligatorio* que presentes el certificado médico a la brevedad. Cuando lo tengas, escribime " +
        'de nuevo y elegí la opción *[4] Entregar certificado pendiente* del menú, o presentalo en ' +
        "Administración cuando te reintegres."
    );
  } else if (categoria === "Urgencia") {
    await reply("Avisé a Administración sobre tu urgencia. ✅ Se van a comunicar a la brevedad.");
  } else {
    await reply("Listo, avisé a Administración. ✅");
  }

  await reply(cierrePrompt());
}
