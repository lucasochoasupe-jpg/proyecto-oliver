// Armado de los registros del panel de RRHH (avisos del bot + cargas manuales)
// y acciones sobre ellos. Lo usan GET /api/rrhh, el export a Excel y el
// calendario, así todos ven exactamente lo mismo.

import db, {
  calcularSaldoVacaciones,
  enqueueOutbox,
  getAusenciasReportadas,
  getEmpleadoByNombre,
  getOrCreateConversation,
  insertMessage,
  listAusenciasManuales,
  listAusenciasPorAdminMessageIds,
  listAvisosOcultos,
  listLegajoArchivosInlinePorEmpleado,
  listLegajoArchivosPorAdminMessageIds,
  type AusenciaReportada,
  type LegajoArchivo,
} from "./db";
import {
  clasificarMotivo,
  formatISOCorta,
  type EventoCalendario,
  type RegistroRRHH,
} from "./rrhh-shared";

function parseAdminBlock(content: string) {
  // Intentar con etiquetas <ADMIN> primero, luego sin etiquetas
  const tagMatch = content.match(/<ADMIN>([\s\S]*?)<\/ADMIN>/i);
  const raw = tagMatch
    ? tagMatch[1].trim()
    : (() => {
        const bare = content.match(/Aviso de Sanca:[\s\S]*?(?=\n\n|\n✅|\nAvisé|$)/i);
        return bare ? bare[0].trim() : null;
      })();

  if (!raw) return null;

  // "Aviso de Sanca: [Nombre] de sucursal [Sucursal] comunica [Motivo]. Detalle: [Detalle]. Contacto: [Contacto]"
  const nombreMatch = raw.match(/Aviso de Sanca:\s*(.+?)\s+de sucursal/i);
  const sucursalMatch = raw.match(/de sucursal\s+(.+?)\s+comunica/i);
  const motivoMatch = raw.match(/comunica\s+(.+?)\.\s+Detalle:/i);
  const detalleMatch = raw.match(/Detalle:\s*([\s\S]+?)(?:\.\s*Contacto:|Contacto:|$)/i);
  const contactoMatch = raw.match(/Contacto:\s*(.+?)$/im);

  return {
    nombre: nombreMatch?.[1]?.trim() ?? "Desconocido",
    sucursal: sucursalMatch?.[1]?.trim() ?? "Desconocida",
    motivo: motivoMatch?.[1]?.trim() ?? "Sin especificar",
    detalle: detalleMatch?.[1]?.trim().replace(/\.$/, "") ?? raw,
    contacto: contactoMatch?.[1]?.trim() ?? "—",
    certificadoPendiente: raw.includes("CERTIFICADO PENDIENTE"),
    raw,
  };
}

function camposAusencia(a: AusenciaReportada | undefined) {
  return {
    ausenciaId: a?.id ?? null,
    fechaInicio: a?.fecha_inicio ?? null,
    fechaFin: a?.fecha_fin ?? null,
    estado: a?.estado ?? null,
    respuesta: a?.respuesta ?? null,
    resueltoAt: a?.resuelto_at ?? null,
    goceSueldo: a && a.goce_sueldo !== null ? a.goce_sueldo === 1 : null,
    saldoVacaciones: null,
  };
}

export function listarRegistrosRRHH(): RegistroRRHH[] {
  // Todos los mensajes de assistant que contengan avisos a Administración
  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, c.phone
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'assistant' AND (m.content LIKE '%<ADMIN>%' OR m.content LIKE '%Aviso de Sanca:%')
       ORDER BY m.created_at DESC`
    )
    .all() as { id: number; content: string; created_at: number; phone: string }[];

  const ocultos = listAvisosOcultos();
  const visibles = rows.filter((r) => !ocultos.has(r.id));

  // certificadoPendiente sale de un texto fijo escrito al momento del aviso
  // (nunca cambia solo). Los certificados que ya llegaron por WhatsApp — o que
  // RRHH aprobó desde el panel — se marcan resueltos en certificados_pendientes
  // (ver resolverCertificadoPendiente en baileys/handler.ts y
  // decidirAusenciaReportada) — cruzamos por el id del mensaje de aviso a admin.
  const resueltos = db
    .prepare(
      `SELECT admin_message_id, resuelto_at
       FROM certificados_pendientes
       WHERE resuelto = 1 AND admin_message_id IS NOT NULL`
    )
    .all() as { admin_message_id: number; resuelto_at: number }[];
  const resueltoPorMensaje = new Map(resueltos.map((r) => [r.admin_message_id, r.resuelto_at]));

  const ausenciaPorMensaje = listAusenciasPorAdminMessageIds(visibles.map((r) => r.id));

  const registros: RegistroRRHH[] = [];

  for (const row of visibles) {
    const parsed = parseAdminBlock(row.content);
    if (!parsed) continue;
    const resueltoAt = resueltoPorMensaje.get(row.id) ?? null;
    const ausencia = ausenciaPorMensaje.get(row.id);
    registros.push({
      id: row.id,
      phone: row.phone,
      fecha: row.created_at,
      ...parsed,
      tipo: clasificarMotivo(parsed.motivo),
      certificadoPendiente: parsed.certificadoPendiente && resueltoAt === null,
      certificadoRecibidoEn: resueltoAt,
      archivos: [],
      empleadoId: null,
      ...camposAusencia(ausencia),
    });
  }

  // Cargas manuales (admin, sin pasar por WhatsApp) — mismo `ausencias_reportadas`
  // que alimenta saldo de vacaciones y liquidación, ver [[crearAusenciaReportada]].
  // Se identifican con id negativo para no chocar con ids de mensajes.
  for (const a of listAusenciasManuales()) {
    const rango =
      a.fecha_inicio === a.fecha_fin
        ? ` el ${formatISOCorta(a.fecha_inicio)}`
        : ` del ${formatISOCorta(a.fecha_inicio)} al ${formatISOCorta(a.fecha_fin)}`;
    registros.push({
      id: -a.id,
      phone: a.phone ?? "",
      nombre: a.empleado_nombre,
      sucursal: a.sucursal ?? "—",
      motivo: `${a.categoria}${rango}`,
      tipo: clasificarMotivo(a.categoria),
      detalle: a.nota || "Cargado manualmente por administración",
      contacto: a.phone || "—",
      certificadoPendiente: a.categoria === "Enfermedad" && !!a.certificado_pendiente,
      certificadoRecibidoEn: null,
      fecha: a.created_at,
      raw: "",
      origen: "manual",
      archivos: [],
      empleadoId: null,
      ...camposAusencia(a),
    });
  }

  // Certificados que el empleado ya mandó por WhatsApp, para mostrarlos acá
  // sin tener que ir a Legajos (ver [[listLegajoArchivosPorAdminMessageIds]]).
  const archivosPorMensaje = listLegajoArchivosPorAdminMessageIds(
    registros.filter((a) => a.id > 0).map((a) => a.id)
  );
  const empleadoIdPorNombre = new Map<string, number | null>();
  for (const a of registros) {
    if (a.id > 0) a.archivos = archivosPorMensaje.get(a.id) ?? [];
    if (!empleadoIdPorNombre.has(a.nombre)) {
      empleadoIdPorNombre.set(a.nombre, getEmpleadoByNombre(a.nombre)?.id ?? null);
    }
    a.empleadoId = empleadoIdPorNombre.get(a.nombre) ?? null;
  }

  // Certificados "inline" (el empleado dijo que ya lo tenía justo al avisar,
  // en vez de pasar por el submenú "Entregar certificado pendiente") no
  // quedan vinculados a ningún id — se emparejan con el aviso del mismo
  // empleado que ocurrió justo antes, dentro de una ventana corta (llegan
  // segundos/minutos después, en la misma conversación).
  const VENTANA_INLINE_SEG = 30 * 60;
  const inlinePorEmpleado = new Map<number, LegajoArchivo[]>();
  for (const a of [...registros].sort((x, y) => x.fecha - y.fecha)) {
    if (a.archivos.length > 0 || !a.empleadoId) continue;
    if (!inlinePorEmpleado.has(a.empleadoId)) {
      inlinePorEmpleado.set(a.empleadoId, listLegajoArchivosInlinePorEmpleado(a.empleadoId));
    }
    const disponibles = inlinePorEmpleado.get(a.empleadoId)!;
    const idx = disponibles.findIndex(
      (f) => f.created_at >= a.fecha && f.created_at - a.fecha <= VENTANA_INLINE_SEG
    );
    if (idx !== -1) {
      a.archivos = [disponibles[idx]];
      disponibles.splice(idx, 1);
    }
  }

  // Saldo de vacaciones para decidir los pedidos pendientes sin salir del panel.
  const saldosPorAnio = new Map<number, Map<string, number | null>>();
  for (const a of registros) {
    if (a.tipo !== "Vacaciones" || a.estado !== "pendiente" || !a.fechaInicio) continue;
    const anio = Number(a.fechaInicio.slice(0, 4));
    if (!saldosPorAnio.has(anio)) {
      saldosPorAnio.set(anio, new Map(calcularSaldoVacaciones(anio).map((s) => [s.nombre, s.saldo])));
    }
    a.saldoVacaciones = saldosPorAnio.get(anio)!.get(a.nombre) ?? null;
  }

  registros.sort((a, b) => b.fecha - a.fecha);
  return registros;
}

// ── Aviso al empleado de la decisión ─────────────────────────────────────────

// A dónde mandarle el WhatsApp al empleado. Avisos del bot: al mismo número
// que hizo el pedido. Cargas manuales: solo si tiene WhatsApp vinculado
// (empleados.jid, el que usa para marcar) — el celular cargado a mano puede
// tener cualquier formato y crearía una conversación fantasma.
function destinoEmpleado(a: AusenciaReportada): string | null {
  if (a.admin_message_id !== null && a.phone) return a.phone;
  return getEmpleadoByNombre(a.empleado_nombre)?.jid ?? null;
}

// La nómina guarda "Apellido Nombre" o "Apellido, Nombre" — no se puede
// adivinar cuál es el nombre de pila, así que se saluda con el nombre
// completo (dando vuelta el formato con coma).
function nombreParaSaludo(nombre: string): string {
  const [apellido, pila] = nombre.split(",").map((s) => s.trim());
  return pila ? `${pila} ${apellido}` : nombre.trim();
}

function textoDecision(a: AusenciaReportada, decision: "aprobado" | "rechazado", comentario: string | null): string {
  const rango =
    a.fecha_inicio === a.fecha_fin
      ? `del ${formatISOCorta(a.fecha_inicio)}`
      : `del ${formatISOCorta(a.fecha_inicio)} al ${formatISOCorta(a.fecha_fin)}`;
  const pedido =
    a.categoria === "Vacaciones"
      ? `tu solicitud de vacaciones ${rango}`
      : a.categoria === "Motivo Personal"
      ? `tu ausencia por motivo personal ${rango}`
      : `tu certificado médico por la ausencia ${rango}`;
  const femenino = a.categoria === "Vacaciones" || a.categoria === "Motivo Personal";
  const nombre = nombreParaSaludo(a.empleado_nombre);
  const nota = comentario ? `\n\nComentario de RRHH: ${comentario}` : "";

  if (decision === "aprobado") {
    const fue = femenino ? "fue *aprobada*" : "fue *aprobado*";
    const goce =
      a.goce_sueldo === 1 ? " *con goce de sueldo*" : a.goce_sueldo === 0 ? " *sin goce de sueldo* (ese día no se cobra)" : "";
    return `Hola ${nombre}, te informamos que ${pedido} ${fue}${goce}. ✅${nota}`;
  }
  const fue = femenino ? "*no fue aprobada*" : "*no fue aprobado*";
  return (
    `Hola ${nombre}, te informamos que ${pedido} ${fue}. ❌${nota}\n\n` +
    "Si tenés dudas, acercate a Administración."
  );
}

// Encola el WhatsApp (mismo outbox que usa el chat del panel) y lo deja
// registrado en la conversación del empleado como mensaje de un humano.
export function notificarDecision(
  a: AusenciaReportada,
  decision: "aprobado" | "rechazado",
  comentario: string | null
): { enviado: boolean; motivo?: string } {
  const destino = destinoEmpleado(a);
  if (!destino) {
    return { enviado: false, motivo: "El empleado no tiene WhatsApp vinculado — avisale por otro medio." };
  }
  const texto = textoDecision(a, decision, comentario);
  const convo = getOrCreateConversation(destino);
  insertMessage(convo.id, "human", texto);
  enqueueOutbox(convo.id, convo.phone, texto);
  return { enviado: true };
}

// ── Calendario ───────────────────────────────────────────────────────────────

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Días de falta AVISADOS de un rango: pedidos/avisos con rango de fechas
// (Vacaciones, Enfermedad, Motivo Personal). Quedan afuera a propósito los
// pedidos rechazados y las faltas a turnos sin aviso — el calendario es solo
// para ver las ausencias informadas que siguen en pie.
export function eventosCalendario(desde: string, hasta: string): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];

  // Para abrir el detalle desde el calendario hace falta el id del registro
  // del panel (mensaje del bot, o -id si es carga manual).
  const ocultos = listAvisosOcultos();
  for (const a of getAusenciasReportadas(desde, hasta)) {
    if (a.admin_message_id !== null && ocultos.has(a.admin_message_id)) continue;
    if (a.estado === "rechazado") continue;
    const tipo = (["Vacaciones", "Enfermedad", "Motivo Personal"] as const).find((t) => t === a.categoria);
    if (!tipo) continue;
    const registroId = a.admin_message_id ?? -a.id;
    const inicio = a.fecha_inicio < desde ? desde : a.fecha_inicio;
    const fin = a.fecha_fin > hasta ? hasta : a.fecha_fin;
    for (let f = inicio; f <= fin; f = addDias(f, 1)) {
      eventos.push({ fecha: f, nombre: a.empleado_nombre, sucursal: a.sucursal, tipo, estado: a.estado, goceSueldo: a.goce_sueldo === null ? null : a.goce_sueldo === 1, registroId });
    }
  }

  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  return eventos;
}
