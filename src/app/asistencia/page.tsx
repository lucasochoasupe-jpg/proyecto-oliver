"use client";

import { useEffect, useState, useCallback } from "react";
import type { AsistenciaRecord } from "@/lib/db";
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
    if (action === "aprobar") fetchData();
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

  function abrirManual() {
    setManualError(null);
    setManualEmpleadoId("");
    setManualSucursalId("");
    setManualTipo("entrada");
    setManualFechaHora(nowARDateTimeLocal());
    setShowManual(true);
    if (empleadosOpciones.length === 0) {
      fetch("/api/empleados").then((r) => r.json()).then((data: EmpleadoOpcion[]) =>
        setEmpleadosOpciones(data.filter((e) => e.activo))
      );
    }
    if (sucursalesOpciones.length === 0) {
      fetch("/api/sucursales").then((r) => r.json()).then((data: SucursalOpcion[]) => setSucursalesOpciones(data));
    }
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

  const hayFiltros = sucursalFiltro !== "Todas" || tipoFiltro !== "Todos" || desdeFiltro || hastaFiltro || nombresFiltro.length > 0;

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#2C1810]">Asistencia</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={abrirManual}
              className="text-xs text-white bg-[#D4A843] hover:bg-[#C4983A] px-3 py-1 rounded-full active:scale-95 transition-colors font-medium"
            >
              + Marcar manual
            </button>
            <button
              onClick={fetchData}
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
          {hayFiltros && (
            <button
              onClick={() => { setSucursalFiltro("Todas"); setTipoFiltro("Todos"); setDesdeFiltro(""); setHastaFiltro(""); setNombresFiltro([]); }}
              className="text-xs text-[#8B6347] hover:text-red-500 underline"
            >
              Limpiar filtros
            </button>
          )}
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
            <table className="w-full text-sm">
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
                      <td className="px-4 py-2.5 font-medium text-[#2C1810]">{r.nombre ?? r.phone}</td>
                      <td className="px-4 py-2.5 text-[#5C3D2E]">{r.sucursal_nombre ?? <span className="italic text-[#B89070]">—</span>}</td>
                      <td className="px-4 py-2.5">{r.tipo ? <BadgeTipo tipo={r.tipo} /> : <span className="italic text-[#B89070] text-xs">—</span>}</td>
                      <td className="px-4 py-2.5 text-[#8B6347]">
                        {motivoLabel(r.motivo)}
                        {r.distancia_metros != null && <span className="text-[#B89070]"> ({r.distancia_metros}m)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#8B6347] whitespace-nowrap">
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
            <table className="w-full text-sm">
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
                    <td className="px-4 py-2.5 font-medium text-[#2C1810]">{p.nombre ?? p.phone}</td>
                    <td className="px-4 py-2.5 text-[#5C3D2E]">{p.sucursalNombre ?? <span className="italic text-[#B89070]">—</span>}</td>
                    <td className="px-4 py-2.5">{p.tipo ? <BadgeTipo tipo={p.tipo} /> : <span className="italic text-[#B89070] text-xs">—</span>}</td>
                    <td className="px-4 py-2.5 text-[#8B6347]">{stepLabel(p.step)}</td>
                    <td className="px-4 py-2.5 text-[#8B6347] whitespace-nowrap">{haceLabel(p.updated_at)}</td>
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
            <table className="w-full text-sm">
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
                      <td className="px-4 py-3 font-medium text-[#2C1810]">{r.nombre ?? r.phone}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#8B6347]">{r.celular ?? <span className="italic text-[#B89070]">—</span>}</td>
                      <td className="px-4 py-3 text-[#5C3D2E]">{r.sucursal_nombre}</td>
                      <td className="px-4 py-3"><BadgeTipo tipo={r.tipo} /></td>
                      <td className="px-4 py-3 text-[#8B6347] whitespace-nowrap">{formatFecha(r.created_at)}</td>
                      <td className="px-4 py-3 text-[#8B6347] font-mono">{formatHora(r.created_at)}</td>
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
