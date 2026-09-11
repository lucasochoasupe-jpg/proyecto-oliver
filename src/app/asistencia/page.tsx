"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import type { AsistenciaRecord, CumplimientoRow, AusenciaRow } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

interface ResumenSucursal {
  entrada: number;
  salida: number;
}

interface ApiResponse {
  records: AsistenciaRecord[];
  resumen: {
    total: number;
    hoy: number;
    fechaHoy: string;
    porSucursal: Record<string, ResumenSucursal>;
  };
}

interface EmpleadoOpcion {
  id: number;
  nombre: string;
  activo: number;
}

interface SucursalOpcion {
  id: number;
  nombre: string;
}

interface AsistenciaRechazada {
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

interface AttendancePendiente {
  phone: string;
  step: "nombre" | "tipo" | "location";
  sucursalNombre: string | null;
  nombre: string | null;
  tipo: "entrada" | "salida" | null;
  updated_at: number;
}

const SUCURSALES = ["Todas", "Fraga", "Campbell", "Mendoza", "Avenida", "Donado", "Montevideo", "Terminal"];

const AR_TZ = "America/Argentina/Buenos_Aires";

function formatFecha(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    timeZone: AR_TZ, day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatHora(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("es-AR", {
    timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function toISODay(unix: number) {
  // YYYY-MM-DD en zona AR, para que coincida con la agrupación por día del server
  return new Date(unix * 1000).toLocaleDateString("sv", { timeZone: AR_TZ });
}

// "YYYY-MM-DDTHH:mm" en hora de Argentina, para prellenar un <input type="datetime-local">
function nowARDateTimeLocal(): string {
  const now = new Date();
  const datePart = now.toLocaleDateString("sv", { timeZone: AR_TZ });
  const timePart = now.toLocaleTimeString("en-GB", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit" });
  return `${datePart}T${timePart}`;
}

// "YYYY-MM-DDTHH:mm" a partir de una fecha ISO (sin hora) + hora HH:mm — para
// prellenar el modal de marcado manual desde una fila de turno/inasistencia.
function fechaHoraLocal(fechaISO: string, hora: string): string {
  return `${fechaISO}T${hora}`;
}

function formatFechaISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const ESTADO_INFO: Record<CumplimientoRow["estado"], { label: string; className: string }> = {
  a_horario: { label: "✓ A horario", className: "bg-green-100 text-green-700 border-green-200" },
  tarde: { label: "⏰ Tarde", className: "bg-red-100 text-red-700 border-red-200" },
  salida_anticipada: { label: "⏰ Salida anticipada", className: "bg-red-100 text-red-700 border-red-200" },
  tarde_y_anticipada: { label: "⏰ Tarde y salida anticipada", className: "bg-red-100 text-red-700 border-red-200" },
  sin_horario: { label: "Sin horario definido", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

function diffLabel(min: number | null): string {
  if (min === null) return "—";
  if (min <= 0) return "a tiempo";
  return `+${min} min`;
}

function motivoLabel(motivo: string) {
  if (motivo === "fuera_de_rango") return "Fuera de rango";
  if (motivo === "sucursal_sin_gps") return "Sucursal sin GPS configurado";
  if (motivo === "celular_no_registrado") return "Celular no registrado en el sistema";
  if (motivo === "jid_no_autorizado") return "WhatsApp no autorizado (no coincide con el vinculado)";
  return motivo;
}

function stepLabel(step: "nombre" | "tipo" | "location") {
  if (step === "nombre") return "Pidiendo nombre";
  if (step === "tipo") return "Eligiendo entrada/salida";
  return "Esperando ubicación";
}

function haceLabel(unix: number) {
  const mins = Math.round((Date.now() / 1000 - unix) / 60);
  if (mins < 60) return `hace ${mins} min`;
  const horas = Math.floor(mins / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.floor(horas / 24)}d`;
}

function BadgeTipo({ tipo }: { tipo: "entrada" | "salida" }) {
  return tipo === "entrada" ? (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
      ↑ Entrada
    </span>
  ) : (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
      ↓ Salida
    </span>
  );
}

export default function AsistenciaPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sucursalFiltro, setSucursalFiltro] = useState("Todas");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [desdeFiltro, setDesdeFiltro] = useState("");
  const [hastaFiltro, setHastaFiltro] = useState("");
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [empleadosOpciones, setEmpleadosOpciones] = useState<EmpleadoOpcion[]>([]);
  const [sucursalesOpciones, setSucursalesOpciones] = useState<SucursalOpcion[]>([]);
  const [manualEmpleadoId, setManualEmpleadoId] = useState("");
  const [manualSucursalId, setManualSucursalId] = useState("");
  const [manualTipo, setManualTipo] = useState<"entrada" | "salida">("entrada");
  const [manualFechaHora, setManualFechaHora] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);

  const [rechazadas, setRechazadas] = useState<AsistenciaRechazada[]>([]);
  const [procesandoRechazo, setProcesandoRechazo] = useState<number | null>(null);

  const [pendientes, setPendientes] = useState<AttendancePendiente[]>([]);
  const [procesandoPendiente, setProcesandoPendiente] = useState<string | null>(null);

  // ── Vista unificada (por turno, con cumplimiento e inasistencias) ──
  const [vistaPlana, setVistaPlana] = useState(false);
  const [cumplimiento, setCumplimiento] = useState<CumplimientoRow[]>([]);
  const [ausenciasUnificadas, setAusenciasUnificadas] = useState<AusenciaRow[]>([]);
  const [huerfanas, setHuerfanas] = useState<AsistenciaRecord[]>([]);
  const [loadingUnificada, setLoadingUnificada] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [tipoUnificadoFiltro, setTipoUnificadoFiltro] = useState<"Todos" | "Asistencias" | "Inasistencias">("Todos");

  const fetchRechazadas = useCallback(async () => {
    const res = await fetch("/api/asistencia/rechazadas");
    if (!res.ok) return;
    const json = (await res.json()) as { records: AsistenciaRechazada[] };
    setRechazadas(json.records);
  }, []);

  const fetchPendientes = useCallback(async () => {
    const res = await fetch("/api/asistencia/pendientes");
    if (!res.ok) return;
    const json = (await res.json()) as { records: AttendancePendiente[] };
    setPendientes(json.records);
  }, []);

  async function resolverRechazo(id: number, action: "aprobar" | "descartar") {
    setProcesandoRechazo(id);
    await fetch(`/api/asistencia/rechazadas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setProcesandoRechazo(null);
    fetchRechazadas();
    if (action === "aprobar") { fetchData(); fetchUnificada(); }
  }

  async function descartarPendiente(phone: string) {
    setProcesandoPendiente(phone);
    await fetch("/api/asistencia/pendientes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setProcesandoPendiente(null);
    fetchPendientes();
  }

  // Prellenar desde una fila de turno/inasistencia: busca el empleado y la
  // última sucursal conocida por nombre (los datos de cumplimiento/ausencias
  // no traen ids, solo nombres).
  function abrirManual(prefill?: { nombreEmpleado?: string; nombreSucursal?: string | null; fecha?: string; hora?: string; tipo?: "entrada" | "salida" }) {
    setManualError(null);
    const emp = prefill?.nombreEmpleado ? empleadosOpciones.find((e) => e.nombre === prefill.nombreEmpleado) : undefined;
    const suc = prefill?.nombreSucursal ? sucursalesOpciones.find((s) => s.nombre === prefill.nombreSucursal) : undefined;
    setManualEmpleadoId(emp ? String(emp.id) : "");
    setManualSucursalId(suc ? String(suc.id) : "");
    setManualTipo(prefill?.tipo ?? "entrada");
    setManualFechaHora(
      prefill?.fecha ? fechaHoraLocal(prefill.fecha, prefill.hora ?? "09:00") : nowARDateTimeLocal()
    );
    setShowManual(true);
  }

  async function guardarManual() {
    if (!manualEmpleadoId || !manualSucursalId) {
      setManualError("Elegí empleado y sucursal.");
      return;
    }
    setManualSaving(true);
    setManualError(null);
    const res = await fetch("/api/asistencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empleadoId: Number(manualEmpleadoId),
        sucursalId: Number(manualSucursalId),
        tipo: manualTipo,
        fechaHora: manualFechaHora || undefined,
      }),
    });
    setManualSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setManualError(json?.error ?? "No se pudo registrar.");
      return;
    }
    setShowManual(false);
    fetchData();
    fetchUnificada();
  }

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (tipoFiltro !== "Todos") params.set("tipo", tipoFiltro.toLowerCase());
    if (desdeFiltro) params.set("desde", desdeFiltro);
    if (hastaFiltro) params.set("hasta", hastaFiltro);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    const res = await fetch(`/api/asistencia?${params}`);
    const json = (await res.json()) as ApiResponse;
    setData(json);
    setLoading(false);
  }, [sucursalFiltro, tipoFiltro, desdeFiltro, hastaFiltro, nombresFiltro]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Turnos esperados que sí se cubrieron (cumplimiento) + los que no
  // (inasistencias) — se combinan en la vista unificada. Comparten los
  // mismos filtros de fecha/nombre que la lista de marcaciones; sucursal se
  // filtra client-side para las inasistencias porque calcularAusencias no lo
  // acepta como parámetro.
  const fetchUnificada = useCallback(async () => {
    setLoadingUnificada(true);
    const paramsCump = new URLSearchParams();
    const paramsAus = new URLSearchParams();
    const paramsHuer = new URLSearchParams();
    if (desdeFiltro) { paramsCump.set("desde", desdeFiltro); paramsAus.set("desde", desdeFiltro); paramsHuer.set("desde", desdeFiltro); }
    if (hastaFiltro) { paramsCump.set("hasta", hastaFiltro); paramsAus.set("hasta", hastaFiltro); paramsHuer.set("hasta", hastaFiltro); }
    if (sucursalFiltro !== "Todas") { paramsCump.set("sucursal", sucursalFiltro); paramsHuer.set("sucursal", sucursalFiltro); }
    if (nombresFiltro.length > 0) { paramsCump.set("nombres", nombresFiltro.join(",")); paramsAus.set("nombres", nombresFiltro.join(",")); paramsHuer.set("nombres", nombresFiltro.join(",")); }
    const [resCump, resAus, resHuer] = await Promise.all([
      fetch(`/api/asistencia/cumplimiento?${paramsCump}`),
      fetch(`/api/asistencia/ausencias?${paramsAus}`),
      fetch(`/api/asistencia/huerfanas?${paramsHuer}`),
    ]);
    const jsonCump = (await resCump.json()) as { desde: string; hasta: string; filas: CumplimientoRow[] };
    const jsonAus = (await resAus.json()) as { desde: string; hasta: string; filas: AusenciaRow[] };
    const jsonHuer = (await resHuer.json()) as { desde: string; hasta: string; records: AsistenciaRecord[] };
    setCumplimiento(jsonCump.filas);
    setAusenciasUnificadas(jsonAus.filas);
    setHuerfanas(jsonHuer.records);
    setLoadingUnificada(false);
    if (!desdeFiltro) setDesdeFiltro(jsonCump.desde);
    if (!hastaFiltro) setHastaFiltro(jsonCump.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desdeFiltro, hastaFiltro, sucursalFiltro, nombresFiltro]);

  useEffect(() => {
    fetchUnificada();
  }, [fetchUnificada]);

  useEffect(() => {
    fetch("/api/empleados").then((r) => r.json()).then((data: EmpleadoOpcion[]) =>
      setEmpleadosOpciones(data.filter((e) => e.activo))
    );
    fetch("/api/sucursales").then((r) => r.json()).then((data: SucursalOpcion[]) => setSucursalesOpciones(data));
  }, []);

  useEffect(() => {
    fetchRechazadas();
    const id = setInterval(fetchRechazadas, 30_000);
    return () => clearInterval(id);
  }, [fetchRechazadas]);

  useEffect(() => {
    fetchPendientes();
    const id = setInterval(fetchPendientes, 30_000);
    return () => clearInterval(id);
  }, [fetchPendientes]);

  useEffect(() => {
    if (!data) return;
    const idsPresentes = new Set(data.records.map((r) => r.id));
    setSelected((prev) => new Set([...prev].filter((id) => idsPresentes.has(id))));
  }, [data]);

  const hayFiltros = sucursalFiltro !== "Todas" || tipoFiltro !== "Todos" || tipoUnificadoFiltro !== "Todos" || desdeFiltro || hastaFiltro || nombresFiltro.length > 0;

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    const allSelected = data.records.length > 0 && selected.size === data.records.length;
    setSelected(allSelected ? new Set() : new Set(data.records.map((r) => r.id)));
  }

  async function eliminarUno(id: number) {
    setDeleting(true);
    await fetch(`/api/asistencia/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setDeleting(false);
    fetchData();
    fetchUnificada();
  }

  async function eliminarSeleccionados() {
    setDeleting(true);
    await fetch("/api/asistencia", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setConfirmBulk(false);
    setSelected(new Set());
    setDeleting(false);
    fetchData();
    fetchUnificada();
  }

  function exportarExcel() {
    const params = new URLSearchParams();
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (tipoFiltro !== "Todos") params.set("tipo", tipoFiltro.toLowerCase());
    if (desdeFiltro) params.set("desde", desdeFiltro);
    if (hastaFiltro) params.set("hasta", hastaFiltro);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    window.location.href = `/api/asistencia/export?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Control de Asistencia" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-[#2C1810]">Asistencia</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => abrirManual()}
              className="text-xs text-white bg-[#D4A843] hover:bg-[#C4983A] px-3 py-1 rounded-full active:scale-95 transition-colors font-medium"
            >
              + Marcar manual
            </button>
            <button
              onClick={() => { fetchData(); fetchUnificada(); }}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ↻ Actualizar
            </button>
            <button
              onClick={exportarExcel}
              disabled={!data || data.records.length === 0}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
            >
              ↓ Exportar Excel
            </button>
          </div>
        </div>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Hoy ({data.resumen.fechaHoy})</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{data.resumen.hoy}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Total registros</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{data.resumen.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 col-span-2">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-2">Hoy por sucursal</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.resumen.porSucursal).map(([suc, val]) => (
                  <span key={suc} className="text-xs bg-[#FAF7F2] border border-[#EDE0CC] rounded-full px-2 py-0.5 text-[#2C1810]">
                    {suc}: <strong className="text-green-700">{val.entrada}↑</strong> <strong className="text-blue-700">{val.salida}↓</strong>
                  </span>
                ))}
                {Object.keys(data.resumen.porSucursal).length === 0 && (
                  <span className="text-xs text-[#B89070] italic">Sin registros hoy</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
          <EmpleadoMultiSelect value={nombresFiltro} onChange={setNombresFiltro} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Desde</label>
            <input
              type="date"
              value={desdeFiltro}
              onChange={(e) => setDesdeFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Hasta</label>
            <input
              type="date"
              value={hastaFiltro}
              onChange={(e) => setHastaFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
            <select
              value={sucursalFiltro}
              onChange={(e) => setSucursalFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            >
              {SUCURSALES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {vistaPlana ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Tipo</label>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              >
                {["Todos", "Entrada", "Salida"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Mostrar</label>
              <select
                value={tipoUnificadoFiltro}
                onChange={(e) => { setTipoUnificadoFiltro(e.target.value as typeof tipoUnificadoFiltro); setExpandido(null); }}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              >
                <option value="Todos">Todos</option>
                <option value="Asistencias">Solo asistencias</option>
                <option value="Inasistencias">Solo inasistencias</option>
              </select>
            </div>
          )}
          {hayFiltros && (
            <button
              onClick={() => { setSucursalFiltro("Todas"); setTipoFiltro("Todos"); setTipoUnificadoFiltro("Todos"); setDesdeFiltro(""); setHastaFiltro(""); setNombresFiltro([]); }}
              className="text-xs text-[#8B6347] hover:text-red-500 underline"
            >
              Limpiar filtros
            </button>
          )}
          <button
            onClick={() => setVistaPlana((v) => !v)}
            className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium ml-auto"
          >
            {vistaPlana ? "← Ver por turno" : "Ver como lista de marcaciones →"}
          </button>
        </div>

        {rechazadas.length > 0 && (
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <h2 className="text-sm font-bold text-red-700">
                ⚠️ Intentos de marcación con problemas ({rechazadas.length})
              </h2>
              <p className="text-xs text-red-600 mt-0.5">
                Ubicación fuera de rango: si el rechazo fue un error nuestro, aprobalo para que quede como asistencia válida.
                Celular no registrado / WhatsApp no autorizado: revisá y corregí en Empleados, después descartá la alerta.
              </p>
            </div>
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Motivo</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha / hora</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rechazadas.map((r) => {
                  const puedeAprobar = r.sucursal_id != null && r.tipo != null;
                  return (
                    <tr key={r.id} className="border-b border-[#EDE0CC]">
                      <td className="px-4 py-2.5 font-medium text-[#2C1810]" data-label="Empleado">{r.nombre ?? r.phone}</td>
                      <td className="px-4 py-2.5 text-[#5C3D2E]" data-label="Sucursal">{r.sucursal_nombre ?? <span className="italic text-[#B89070]">—</span>}</td>
                      <td className="px-4 py-2.5" data-label="Tipo">{r.tipo ? <BadgeTipo tipo={r.tipo} /> : <span className="italic text-[#B89070] text-xs">—</span>}</td>
                      <td className="px-4 py-2.5 text-[#8B6347]" data-label="Motivo">
                        {motivoLabel(r.motivo)}
                        {r.distancia_metros != null && <span className="text-[#B89070]"> ({r.distancia_metros}m)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#8B6347] whitespace-nowrap" data-label="Fecha / hora">
                        {formatFecha(r.created_at)} {formatHora(r.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {puedeAprobar && (
                          <button
                            onClick={() => resolverRechazo(r.id, "aprobar")}
                            disabled={procesandoRechazo === r.id}
                            className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-2 py-1 rounded mr-2"
                          >
                            Aprobar
                          </button>
                        )}
                        <button
                          onClick={() => resolverRechazo(r.id, "descartar")}
                          disabled={procesandoRechazo === r.id}
                          className="text-xs font-medium text-[#8B6347] hover:text-red-600 underline disabled:opacity-50"
                        >
                          Descartar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
              <h2 className="text-sm font-bold text-amber-700">
                ⏳ Marcaciones sin terminar ({pendientes.length})
              </h2>
              <p className="text-xs text-amber-700 mt-0.5">
                Escanearon el QR y arrancaron el trámite pero no llegaron a mandar la ubicación (o ni siquiera terminaron de decir su nombre). Se limpia solo a los 30 min de inactividad.
              </p>
            </div>
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado / Celular</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Quedó en</th>
                  <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Última actividad</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.phone} className="border-b border-[#EDE0CC]">
                    <td className="px-4 py-2.5 font-medium text-[#2C1810]" data-label="Empleado / Celular">{p.nombre ?? p.phone}</td>
                    <td className="px-4 py-2.5 text-[#5C3D2E]" data-label="Sucursal">{p.sucursalNombre ?? <span className="italic text-[#B89070]">—</span>}</td>
                    <td className="px-4 py-2.5" data-label="Tipo">{p.tipo ? <BadgeTipo tipo={p.tipo} /> : <span className="italic text-[#B89070] text-xs">—</span>}</td>
                    <td className="px-4 py-2.5 text-[#8B6347]" data-label="Quedó en">{stepLabel(p.step)}</td>
                    <td className="px-4 py-2.5 text-[#8B6347] whitespace-nowrap" data-label="Última actividad">{haceLabel(p.updated_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => descartarPendiente(p.phone)}
                        disabled={procesandoPendiente === p.phone}
                        className="text-xs font-medium text-[#8B6347] hover:text-red-600 underline disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {vistaPlana && (
        <>
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-[#D4A843] bg-[#FDF6E3] px-4 py-2.5">
            <span className="text-sm font-medium text-[#2C1810]">{selected.size} seleccionadas</span>
            {confirmBulk ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B6347]">¿Eliminar {selected.size} marcaciones?</span>
                <button
                  onClick={eliminarSeleccionados}
                  disabled={deleting}
                  className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? "..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setConfirmBulk(false)}
                  className="text-xs text-[#8B6347] underline hover:text-[#2C1810]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBulk(true)}
                className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600 active:scale-95"
              >
                Eliminar seleccionadas
              </button>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          )}

          {!loading && data && data.records.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">
              {hayFiltros ? "Ningún registro coincide con los filtros." : "Aún no hay registros de asistencia."}
            </div>
          )}

          {!loading && data && data.records.length > 0 && (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={data.records.length > 0 && selected.size === data.records.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Celular</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Hora</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => {
                  const isSelected = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${
                        i % 2 === 0 ? "" : "bg-[#FDFAF6]"
                      } ${isSelected ? "bg-[#FDF6E3]" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.id)}
                          className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Empleado">{r.nombre ?? r.phone}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#8B6347]" data-label="Celular">{r.celular ?? <span className="italic text-[#B89070]">—</span>}</td>
                      <td className="px-4 py-3 text-[#5C3D2E]" data-label="Sucursal">{r.sucursal_nombre}</td>
                      <td className="px-4 py-3" data-label="Tipo"><BadgeTipo tipo={r.tipo} /></td>
                      <td className="px-4 py-3 text-[#8B6347] whitespace-nowrap" data-label="Fecha">{formatFecha(r.created_at)}</td>
                      <td className="px-4 py-3 text-[#8B6347] font-mono" data-label="Hora">{formatHora(r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {confirmDelete === r.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => eliminarUno(r.id)}
                              disabled={deleting}
                              className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {deleting ? "..." : "Confirmar"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-[#8B6347] underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(r.id)}
                            className="text-xs font-medium text-red-400 underline hover:text-red-600"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && data && (
          <p className="text-xs text-[#B89070] text-right">
            Mostrando {data.records.length} registros
          </p>
        )}
        </>
        )}

        {!vistaPlana && (
          <UnifiedTableSection
            cumplimiento={cumplimiento}
            ausenciasUnificadas={ausenciasUnificadas}
            huerfanas={huerfanas}
            loadingUnificada={loadingUnificada}
            sucursalFiltro={sucursalFiltro}
            tipoUnificadoFiltro={tipoUnificadoFiltro}
            expandido={expandido}
            setExpandido={setExpandido}
            abrirManual={abrirManual}
            eliminarUno={eliminarUno}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            deleting={deleting}
          />
        )}
      </div>

      {showManual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-[#2C1810]">Marcar asistencia manual</h2>
            <p className="text-xs text-[#8B6347]">
              Para cargar una marcación a mano (ej: mientras WhatsApp no responde). No queda registrada la ubicación GPS.
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Empleado</label>
              <select
                value={manualEmpleadoId}
                onChange={(e) => setManualEmpleadoId(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              >
                <option value="">Elegir empleado...</option>
                {empleadosOpciones.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
              <select
                value={manualSucursalId}
                onChange={(e) => setManualSucursalId(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              >
                <option value="">Elegir sucursal...</option>
                {sucursalesOpciones.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Fecha y hora</label>
              <input
                type="datetime-local"
                value={manualFechaHora}
                onChange={(e) => setManualFechaHora(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Tipo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setManualTipo("entrada")}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    manualTipo === "entrada"
                      ? "bg-green-100 border-green-300 text-green-700 font-medium"
                      : "border-[#EDE0CC] text-[#8B6347]"
                  }`}
                >
                  ↑ Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setManualTipo("salida")}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    manualTipo === "salida"
                      ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
                      : "border-[#EDE0CC] text-[#8B6347]"
                  }`}
                >
                  ↓ Salida
                </button>
              </div>
            </div>

            {manualError && <p className="text-xs text-red-500">{manualError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowManual(false)}
                className="text-xs text-[#8B6347] hover:text-[#2C1810] px-3 py-1.5 underline"
              >
                Cancelar
              </button>
              <button
                onClick={guardarManual}
                disabled={manualSaving}
                className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 px-4 py-1.5 rounded-full font-medium transition-colors"
              >
                {manualSaving ? "Guardando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface UnifiedRow {
  key: string;
  tipo: "turno" | "ausencia" | "huerfana";
  nombre: string;
  sucursal_nombre: string | null;
  fecha: string;
  turno?: CumplimientoRow;
  ausencia?: AusenciaRow;
  huerfana?: AsistenciaRecord;
}

type AbrirManualPrefill = { nombreEmpleado?: string; nombreSucursal?: string | null; fecha?: string; hora?: string; tipo?: "entrada" | "salida" };

function UnifiedTableSection({
  cumplimiento,
  ausenciasUnificadas,
  huerfanas,
  loadingUnificada,
  sucursalFiltro,
  tipoUnificadoFiltro,
  expandido,
  setExpandido,
  abrirManual,
  eliminarUno,
  confirmDelete,
  setConfirmDelete,
  deleting,
}: {
  cumplimiento: CumplimientoRow[];
  ausenciasUnificadas: AusenciaRow[];
  huerfanas: AsistenciaRecord[];
  loadingUnificada: boolean;
  sucursalFiltro: string;
  tipoUnificadoFiltro: "Todos" | "Asistencias" | "Inasistencias";
  expandido: string | null;
  setExpandido: (v: string | null) => void;
  abrirManual: (prefill?: AbrirManualPrefill) => void;
  eliminarUno: (id: number) => void;
  confirmDelete: number | null;
  setConfirmDelete: (v: number | null) => void;
  deleting: boolean;
}) {
  const mostrarAsistencias = tipoUnificadoFiltro !== "Inasistencias";
  const mostrarInasistencias = tipoUnificadoFiltro !== "Asistencias";

  const filas: UnifiedRow[] = useMemo(() => {
    const resultado: UnifiedRow[] = [];

    if (mostrarAsistencias) {
      for (const c of cumplimiento) {
        resultado.push({
          key: `turno-${c.nombre}-${c.entrada_real}`,
          tipo: "turno",
          nombre: c.nombre,
          sucursal_nombre: c.sucursal_nombre,
          fecha: c.fecha,
          turno: c,
        });
      }
      for (const h of huerfanas) {
        resultado.push({
          key: `huerfana-${h.id}`,
          tipo: "huerfana",
          nombre: h.nombre ?? h.phone,
          sucursal_nombre: h.sucursal_nombre,
          fecha: toISODay(h.created_at),
          huerfana: h,
        });
      }
    }

    if (mostrarInasistencias) {
      for (const a of ausenciasUnificadas) {
        if (sucursalFiltro !== "Todas" && a.sucursal_nombre !== sucursalFiltro) continue;
        resultado.push({
          key: `ausencia-${a.empleado_nombre}-${a.fecha}-${a.hora_inicio}`,
          tipo: "ausencia",
          nombre: a.empleado_nombre,
          sucursal_nombre: a.sucursal_nombre,
          fecha: a.fecha,
          ausencia: a,
        });
      }
    }

    resultado.sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        (b.turno?.entrada_real ?? b.huerfana?.created_at ?? 0) - (a.turno?.entrada_real ?? a.huerfana?.created_at ?? 0)
    );
    return resultado;
  }, [cumplimiento, huerfanas, ausenciasUnificadas, mostrarAsistencias, mostrarInasistencias, sucursalFiltro]);

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
      {loadingUnificada ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
        </div>
      ) : filas.length === 0 ? (
        <div className="text-center py-16 text-[#8B6347] text-sm">Ningún turno en el rango seleccionado.</div>
      ) : (
        <table className="w-full text-sm responsive-table">
          <thead>
            <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Entrada</th>
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Salida</th>
              <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const isExpanded = expandido === f.key;
              const t = f.turno;
              const a = f.ausencia;
              const h = f.huerfana;
              return (
                <Fragment key={f.key}>
                  <tr
                    onClick={() => setExpandido(isExpanded ? null : f.key)}
                    className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-[#2C1810]" data-label="Empleado">{f.nombre}</td>
                    <td className="px-4 py-2.5 text-[#5C3D2E]" data-label="Sucursal">{f.sucursal_nombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[#8B6347]" data-label="Fecha">{formatFechaISO(f.fecha)}</td>
                    {t ? (
                      <>
                        <td className="px-4 py-2.5" data-label="Entrada">
                          <span className="font-mono text-[#2C1810]">{formatHora(t.entrada_real)}</span>
                          {t.entrada_esperada && (
                            <span className="text-xs text-[#B89070] ml-1.5">
                              (esperada {t.entrada_esperada} · {diffLabel(t.diff_entrada_min)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5" data-label="Salida">
                          {t.salida_real ? (
                            <span className="font-mono text-[#2C1810]">{formatHora(t.salida_real)}</span>
                          ) : (
                            <span className="italic text-amber-600 text-xs">en curso</span>
                          )}
                          {t.salida_esperada && t.salida_real && (
                            <span className="text-xs text-[#B89070] ml-1.5">
                              (esperada {t.salida_esperada} · {diffLabel(t.diff_salida_min)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5" data-label="Estado">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ESTADO_INFO[t.estado].className}`}>
                            {ESTADO_INFO[t.estado].label}
                          </span>
                          {t.en_curso && <span className="ml-1.5 text-xs text-amber-600">⏱ en curso</span>}
                        </td>
                      </>
                    ) : a ? (
                      <>
                        <td className="px-4 py-2.5 text-[#B89070] italic" colSpan={2} data-label="Horario esperado">
                          Inasistencia
                        </td>
                        <td className="px-4 py-2.5" data-label="Estado">
                          {a.justificada ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                              ✓ Con aviso
                            </span>
                          ) : (
                            <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                              ⚠ Sin aviso
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5" colSpan={2} data-label="Marcación">
                          <span className="italic text-[#B89070]">Falta la entrada</span>
                          <span className="font-mono text-[#2C1810] ml-2">salida {formatHora(h!.created_at)}</span>
                        </td>
                        <td className="px-4 py-2.5" data-label="Estado">
                          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                            ⚠ Salida sin entrada
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-[#B89070] text-xs">{isExpanded ? "▲ ocultar" : "▼ detalle"}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="detail-cell bg-[#FAF7F2] px-4 py-3">
                        <div className="text-xs text-[#5C3D2E] space-y-2">
                          {t ? (
                            <>
                              <DetalleMarcacion
                                label="Entrada"
                                hora={formatHora(t.entrada_real)}
                                id={t.entrada_id}
                                confirmDelete={confirmDelete}
                                setConfirmDelete={setConfirmDelete}
                                eliminarUno={eliminarUno}
                                deleting={deleting}
                              />
                              {t.salida_real !== null && t.salida_id !== null ? (
                                <DetalleMarcacion
                                  label="Salida"
                                  hora={formatHora(t.salida_real)}
                                  id={t.salida_id}
                                  confirmDelete={confirmDelete}
                                  setConfirmDelete={setConfirmDelete}
                                  eliminarUno={eliminarUno}
                                  deleting={deleting}
                                />
                              ) : (
                                <button
                                  onClick={() =>
                                    abrirManual({ nombreEmpleado: f.nombre, nombreSucursal: f.sucursal_nombre, fecha: f.fecha, tipo: "salida" })
                                  }
                                  className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                                >
                                  + Cargar salida
                                </button>
                              )}
                            </>
                          ) : a ? (
                            <>
                              <p className="text-[#2C1810]">
                                Horario esperado: <span className="font-mono">{a.hora_inicio}–{a.hora_fin}</span>
                              </p>
                              <button
                                onClick={() =>
                                  abrirManual({
                                    nombreEmpleado: f.nombre,
                                    nombreSucursal: f.sucursal_nombre,
                                    fecha: f.fecha,
                                    hora: a.hora_inicio,
                                    tipo: "entrada",
                                  })
                                }
                                className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                              >
                                + Cargar marcación
                              </button>
                            </>
                          ) : (
                            <>
                              <DetalleMarcacion
                                label="Salida"
                                hora={formatHora(h!.created_at)}
                                id={h!.id}
                                confirmDelete={confirmDelete}
                                setConfirmDelete={setConfirmDelete}
                                eliminarUno={eliminarUno}
                                deleting={deleting}
                              />
                              <button
                                onClick={() =>
                                  abrirManual({ nombreEmpleado: f.nombre, nombreSucursal: f.sucursal_nombre, fecha: f.fecha, tipo: "entrada" })
                                }
                                className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                              >
                                + Cargar entrada
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DetalleMarcacion({
  label,
  hora,
  id,
  confirmDelete,
  setConfirmDelete,
  eliminarUno,
  deleting,
}: {
  label: string;
  hora: string;
  id: number;
  confirmDelete: number | null;
  setConfirmDelete: (v: number | null) => void;
  eliminarUno: (id: number) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#2C1810] font-medium w-16">{label}</span>
      <span className="font-mono text-[#2C1810]">{hora}</span>
      {confirmDelete === id ? (
        <span className="flex items-center gap-2">
          <button
            onClick={() => eliminarUno(id)}
            disabled={deleting}
            className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded font-medium disabled:opacity-50"
          >
            {deleting ? "..." : "Confirmar"}
          </button>
          <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#8B6347] underline">
            Cancelar
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirmDelete(id)} className="text-xs text-red-400 hover:text-red-600 underline">
          Eliminar
        </button>
      )}
    </div>
  );
}
