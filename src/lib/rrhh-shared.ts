// Tipos y lógica de filtrado del panel de RRHH, sin dependencias de la base —
// se usa tanto en el cliente (/rrhh) como en el server (export a Excel), así
// el Excel siempre sale con los mismos registros que se ven en pantalla.

import type { EstadoAusencia, LegajoArchivo } from "./db";

export type { EstadoAusencia };

export interface RegistroRRHH {
  id: number; // >0: id del mensaje de aviso del bot; <0: -id de una carga manual
  phone: string;
  nombre: string;
  sucursal: string;
  motivo: string;
  tipo: TipoRegistro;
  detalle: string;
  contacto: string;
  certificadoPendiente: boolean;
  certificadoRecibidoEn: number | null; // unix timestamp, si ya se resolvió
  fecha: number; // unix timestamp del aviso (no de la ausencia)
  raw: string;
  origen?: "manual"; // ausente = viene del bot (aviso de WhatsApp)
  archivos: LegajoArchivo[]; // certificados que el empleado mandó por WhatsApp, si los hay
  empleadoId: number | null; // para linkear al legajo completo del empleado
  // Registro estructurado en ausencias_reportadas — null en Urgencias y en
  // avisos viejos (anteriores a esa tabla), que no tienen rango de fechas.
  ausenciaId: number | null;
  fechaInicio: string | null; // ISO (YYYY-MM-DD)
  fechaFin: string | null;
  estado: EstadoAusencia | null;
  respuesta: string | null; // comentario de RRHH al aprobar/rechazar
  resueltoAt: number | null;
  saldoVacaciones: number | null; // solo Vacaciones pendientes — saldo actual del año del pedido
}

export type TipoRegistro = "Enfermedad" | "Motivo Personal" | "Vacaciones" | "Urgencia" | "Otro";

export const TIPOS: TipoRegistro[] = ["Enfermedad", "Motivo Personal", "Vacaciones", "Urgencia", "Otro"];

export function clasificarMotivo(motivo: string): TipoRegistro {
  const m = motivo.toLowerCase();
  if (m.includes("urgencia")) return "Urgencia";
  if (m.includes("vacaciones") || m.includes("licencia")) return "Vacaciones";
  if (m.includes("enfermedad")) return "Enfermedad";
  if (m.includes("personal")) return "Motivo Personal";
  return "Otro";
}

export const ESTADO_LABEL: Record<EstadoAusencia, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  informativo: "Solo informativo",
};

const AR_TZ = "America/Argentina/Buenos_Aires";

// Día calendario (YYYY-MM-DD) en hora argentina — igual en el navegador y en
// el server (que corre en UTC).
export function diaAR(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("sv-SE", { timeZone: AR_TZ });
}

export function hoyAR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: AR_TZ });
}

export function formatISOCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function diasDelRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;
}

export function rangoTexto(r: Pick<RegistroRRHH, "fechaInicio" | "fechaFin">): string | null {
  if (!r.fechaInicio || !r.fechaFin) return null;
  return r.fechaInicio === r.fechaFin
    ? formatISOCorta(r.fechaInicio)
    : `${formatISOCorta(r.fechaInicio)} al ${formatISOCorta(r.fechaFin)}`;
}

export interface FiltrosRRHH {
  sucursal: string; // "Todas" = sin filtro
  tipo: string; // "Todos" = sin filtro
  estado: string; // "Todos" = sin filtro; si no, un EstadoAusencia
  soloCertPendiente: boolean;
  nombres: string[];
  dia: string; // "" = sin filtro. Día de AUSENCIA (dentro del rango pedido), no del aviso
}

export const FILTROS_VACIOS: FiltrosRRHH = {
  sucursal: "Todas",
  tipo: "Todos",
  estado: "Todos",
  soloCertPendiente: false,
  nombres: [],
  dia: "",
};

export function filtrarRegistros(registros: RegistroRRHH[], f: FiltrosRRHH): RegistroRRHH[] {
  return registros.filter((r) => {
    if (f.sucursal !== "Todas" && r.sucursal !== f.sucursal) return false;
    if (f.tipo !== "Todos" && r.tipo !== f.tipo) return false;
    if (f.estado !== "Todos" && r.estado !== f.estado) return false;
    if (f.soloCertPendiente && !r.certificadoPendiente) return false;
    if (f.nombres.length > 0 && !f.nombres.includes(r.nombre)) return false;
    if (f.dia) {
      // Con rango de fechas: el día tiene que caer adentro. Sin rango
      // (Urgencias, avisos viejos): se compara con el día en que avisó.
      if (r.fechaInicio && r.fechaFin) {
        if (f.dia < r.fechaInicio || f.dia > r.fechaFin) return false;
      } else if (diaAR(r.fecha) !== f.dia) {
        return false;
      }
    }
    return true;
  });
}

export function filtrosAParams(f: FiltrosRRHH): URLSearchParams {
  const p = new URLSearchParams();
  if (f.sucursal !== "Todas") p.set("sucursal", f.sucursal);
  if (f.tipo !== "Todos") p.set("tipo", f.tipo);
  if (f.estado !== "Todos") p.set("estado", f.estado);
  if (f.soloCertPendiente) p.set("cert", "1");
  if (f.dia) p.set("dia", f.dia);
  for (const n of f.nombres) p.append("nombre", n);
  return p;
}

export function paramsAFiltros(p: URLSearchParams): FiltrosRRHH {
  return {
    sucursal: p.get("sucursal") ?? "Todas",
    tipo: p.get("tipo") ?? "Todos",
    estado: p.get("estado") ?? "Todos",
    soloCertPendiente: p.get("cert") === "1",
    dia: p.get("dia") ?? "",
    nombres: p.getAll("nombre"),
  };
}

// ── Calendario ────────────────────────────────────────────────────────────────

export type TipoCalendario = "Vacaciones" | "Enfermedad" | "Motivo Personal";

export interface EventoCalendario {
  fecha: string; // YYYY-MM-DD
  nombre: string;
  sucursal: string | null;
  tipo: TipoCalendario;
  estado: EstadoAusencia;
  registroId: number; // id del registro del panel (para abrir el detalle)
}
