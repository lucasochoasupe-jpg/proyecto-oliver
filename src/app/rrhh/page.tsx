"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";
import CalendarioFaltas from "./CalendarioFaltas";
import {
  ESTADO_LABEL,
  FILTROS_VACIOS,
  estadoTexto,
  TIPOS,
  diasDelRango,
  filtrarRegistros,
  filtrosAParams,
  hoyAR,
  rangoTexto,
  type EstadoAusencia,
  type FiltrosRRHH,
  type RegistroRRHH,
} from "@/lib/rrhh-shared";

const SUCURSALES = ["Todas", "Fraga", "Campbell", "Mendoza", "Avenida", "Donado", "Montevideo", "Terminal"];
const CATEGORIAS_MANUALES = ["Vacaciones", "Enfermedad", "Motivo Personal"] as const;
const ESTADOS_FILTRO: EstadoAusencia[] = ["pendiente", "aprobado", "rechazado"];

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTamanio(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function puedeDecidirse(r: RegistroRRHH): boolean {
  return r.ausenciaId !== null && (r.tipo === "Vacaciones" || r.tipo === "Enfermedad" || r.tipo === "Motivo Personal");
}

function BadgeMotivo({ tipo }: { tipo: string }) {
  const colors: Record<string, string> = {
    Urgencia: "bg-red-100 text-red-700 border border-red-200",
    Vacaciones: "bg-blue-100 text-blue-700 border border-blue-200",
    Enfermedad: "bg-amber-100 text-amber-700 border border-amber-200",
    "Motivo Personal": "bg-purple-100 text-purple-700 border border-purple-200",
    Otro: "bg-gray-100 text-gray-600 border border-gray-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[tipo] ?? colors["Otro"]}`}>
      {tipo}
    </span>
  );
}

function BadgeEstado({ estado, goceSueldo }: { estado: EstadoAusencia | null; goceSueldo: boolean | null }) {
  if (!estado) return <span className="text-xs text-[#8B6347]">—</span>;
  const estilos: Record<EstadoAusencia, string> = {
    pendiente: "bg-amber-50 text-amber-700 border border-amber-300 border-dashed",
    aprobado:
      goceSueldo === false
        ? "bg-sky-50 text-sky-700 border border-sky-200"
        : "bg-emerald-100 text-emerald-700 border border-emerald-200",
    rechazado: "bg-red-100 text-red-700 border border-red-200",
  };
  const icono: Record<EstadoAusencia, string> = { pendiente: "⏳ ", aprobado: "✓ ", rechazado: "✕ " };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${estilos[estado]}`}>
      {icono[estado]}
      {estadoTexto(estado, goceSueldo)}
    </span>
  );
}

interface DecisionEnCurso {
  registro: RegistroRRHH;
  decision: "aprobado" | "rechazado";
}

export default function RRHHPage() {
  const [vista, setVista] = useState<"listado" | "calendario">("listado");
  const [registros, setRegistros] = useState<RegistroRRHH[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosRRHH>(FILTROS_VACIOS);
  const [detalle, setDetalle] = useState<RegistroRRHH | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "warn"; texto: string } | null>(null);

  // Aprobar / rechazar
  const [decisionEnCurso, setDecisionEnCurso] = useState<DecisionEnCurso | null>(null);
  const [comentario, setComentario] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [goceSueldo, setGoceSueldo] = useState<boolean | null>(null);
  const [guardandoDecision, setGuardandoDecision] = useState(false);
  const [errorDecision, setErrorDecision] = useState("");

  // Carga manual
  const [mostrarForm, setMostrarForm] = useState(false);
  const [empleados, setEmpleados] = useState<{ id: number; nombre: string; activo: number }[]>([]);
  const [nuevoEmpleadoId, setNuevoEmpleadoId] = useState("");
  const [nuevaSucursal, setNuevaSucursal] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState<(typeof CATEGORIAS_MANUALES)[number]>("Vacaciones");
  const [nuevaFechaInicio, setNuevaFechaInicio] = useState(hoyAR());
  const [nuevaFechaFin, setNuevaFechaFin] = useState(hoyAR());
  const [nuevoCertificado, setNuevoCertificado] = useState(true);
  const [nuevoGoce, setNuevoGoce] = useState<"" | "con" | "sin">("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [guardandoManual, setGuardandoManual] = useState(false);
  const [errorManual, setErrorManual] = useState("");
  const [avisoManual, setAvisoManual] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/rrhh");
      if (!res.ok) throw new Error("Error al cargar datos");
      const json = (await res.json()) as { ausencias: RegistroRRHH[] };
      setRegistros(json.ausencias);
      setError(null);
    } catch (e) {
      setError("No se pudieron cargar los datos de RRHH.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data: { id: number; nombre: string; activo: number }[]) => setEmpleados(data.filter((e) => e.activo)));
  }, []);

  useEffect(() => {
    if (!registros) return;
    const idsPresentes = new Set(registros.map((a) => a.id));
    setSelected((prev) => new Set([...prev].filter((id) => idsPresentes.has(id))));
    // Mantener el modal de detalle al día tras un refresco (p.ej. después de decidir).
    setDetalle((prev) => (prev ? registros.find((r) => r.id === prev.id) ?? null : null));
  }, [registros]);

  function setFiltro<K extends keyof FiltrosRRHH>(k: K, v: FiltrosRRHH[K]) {
    setFiltros((prev) => ({ ...prev, [k]: v }));
  }

  async function cargarManual(e: React.FormEvent) {
    e.preventDefault();
    setErrorManual("");
    setAvisoManual("");
    if (!nuevoEmpleadoId) { setErrorManual("Elegí un empleado"); return; }
    if (!nuevaFechaInicio || !nuevaFechaFin || nuevaFechaInicio > nuevaFechaFin) {
      setErrorManual("El rango de fechas es inválido");
      return;
    }
    if (nuevaCategoria === "Motivo Personal" && !nuevoGoce) {
      setErrorManual("Elegí si es con goce o sin goce de sueldo");
      return;
    }
    setGuardandoManual(true);
    const res = await fetch("/api/rrhh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empleadoId: Number(nuevoEmpleadoId),
        categoria: nuevaCategoria,
        sucursal: nuevaSucursal || null,
        fechaInicio: nuevaFechaInicio,
        fechaFin: nuevaFechaFin,
        certificadoPendiente: nuevaCategoria === "Enfermedad" ? !nuevoCertificado : false,
        goceSueldo: nuevaCategoria === "Motivo Personal" ? nuevoGoce === "con" : null,
        nota: nuevaNota,
      }),
    });
    setGuardandoManual(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorManual(body.error ?? "No se pudo cargar el pedido");
      return;
    }
    const body = (await res.json()) as { advertencia: string | null };
    if (body.advertencia) setAvisoManual(body.advertencia);
    setNuevaNota("");
    setNuevoGoce("");
    fetchData();
  }

  const filtrados = useMemo(() => filtrarRegistros(registros ?? [], filtros), [registros, filtros]);

  // Resumen de lo que se está viendo (respeta los filtros).
  const resumen = useMemo(() => {
    const porSucursal: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const a of filtrados) {
      porSucursal[a.sucursal] = (porSucursal[a.sucursal] ?? 0) + 1;
      porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
    }
    return {
      total: filtrados.length,
      pendientesAprobacion: filtrados.filter((a) => a.estado === "pendiente").length,
      certificadosPendientes: filtrados.filter((a) => a.certificadoPendiente).length,
      porSucursal,
      porTipo,
    };
  }, [filtrados]);

  const pendientesTotales = (registros ?? []).filter((a) => a.estado === "pendiente").length;

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelected = filtrados.length > 0 && filtrados.every((a) => selected.has(a.id));
    setSelected(allSelected ? new Set() : new Set(filtrados.map((a) => a.id)));
  }

  async function eliminar(ids: number[]) {
    setDeleting(true);
    if (ids.length === 1) {
      await fetch(`/api/rrhh/${ids[0]}`, { method: "DELETE" });
    } else {
      await fetch("/api/rrhh", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    }
    setConfirmarBorrado(null);
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    setDeleting(false);
    if (detalle && ids.includes(detalle.id)) setDetalle(null);
    fetchData();
  }

  function abrirDecision(registro: RegistroRRHH, decision: "aprobado" | "rechazado") {
    setDecisionEnCurso({ registro, decision });
    setComentario("");
    setNotificar(true);
    setGoceSueldo(null);
    setErrorDecision("");
  }

  async function confirmarDecision() {
    if (!decisionEnCurso) return;
    const { registro, decision } = decisionEnCurso;
    if (decision === "aprobado" && registro.tipo === "Motivo Personal" && goceSueldo === null) {
      setErrorDecision("Elegí si es con goce o sin goce de sueldo");
      return;
    }
    setGuardandoDecision(true);
    setErrorDecision("");
    const res = await fetch(`/api/rrhh/${registro.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comentario, notificar, goceSueldo }),
    });
    setGuardandoDecision(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorDecision(body.error ?? "No se pudo guardar la decisión");
      return;
    }
    const verbo =
      decision === "rechazado"
        ? "Rechazado"
        : registro.tipo === "Motivo Personal"
        ? `Aprobado ${goceSueldo ? "con goce" : "sin goce"}`
        : "Aprobado";
    if (!notificar) {
      setAviso({ tipo: "ok", texto: `${verbo}: ${registro.nombre}. No se le mandó mensaje.` });
    } else if (body.notificado) {
      setAviso({ tipo: "ok", texto: `${verbo}: ${registro.nombre}. Se le avisó por WhatsApp.` });
    } else {
      setAviso({ tipo: "warn", texto: `${verbo}: ${registro.nombre}, pero no se pudo avisar. ${body.motivoNoNotificado ?? ""}` });
    }
    setDecisionEnCurso(null);
    fetchData();
  }

  function exportarExcel() {
    window.location.href = `/api/rrhh/export?${filtrosAParams(filtros).toString()}`;
  }

  function verRegistroDesdeCalendario(id: number) {
    const r = registros?.find((x) => x.id === id);
    if (r) setDetalle(r);
  }

  const hayFiltrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);
  const aBorrar = confirmarBorrado ? (registros ?? []).filter((r) => confirmarBorrado.includes(r.id)) : [];
  const borraAprobados = aBorrar.some((r) => r.estado === "aprobado");

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Panel de RRHH" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Título + pestañas */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#2C1810]">Ausentismo y Novedades</h1>
            <div className="flex items-center gap-1 bg-white border border-[#EDE0CC] rounded-full p-1">
              {(["listado", "calendario"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                    vista === v ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
                  }`}
                >
                  {v === "listado" ? "Pedidos y avisos" : "Calendario de faltas"}
                  {v === "listado" && pendientesTotales > 0 && (
                    <span className="ml-1.5 text-[11px] font-bold bg-amber-400 text-[#2C1810] rounded-full px-1.5 py-0.5">
                      {pendientesTotales}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {vista === "listado" && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setMostrarForm((v) => !v); setErrorManual(""); setAvisoManual(""); }}
                className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] px-3 py-1 rounded-full transition-colors font-medium"
              >
                {mostrarForm ? "✕ Cerrar" : "+ Cargar manualmente"}
              </button>
              <button
                onClick={fetchData}
                className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
              >
                ↻ Actualizar
              </button>
              <button
                onClick={exportarExcel}
                disabled={filtrados.length === 0}
                className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
              >
                ↓ Exportar Excel
              </button>
            </div>
          )}
        </div>

        {aviso && (
          <div
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
              aviso.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-300 text-amber-800"
            }`}
          >
            <span>{aviso.tipo === "ok" ? "✅ " : "⚠ "}{aviso.texto}</span>
            <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100" aria-label="Cerrar">✕</button>
          </div>
        )}

        {vista === "calendario" && (
          <CalendarioFaltas sucursales={SUCURSALES} onVerRegistro={verRegistroDesdeCalendario} />
        )}

        {vista === "listado" && (
          <>
            {mostrarForm && (
              <form onSubmit={cargarManual} className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
                <h2 className="font-semibold text-[#2C1810] text-sm">Cargar pedido manualmente</h2>
                <p className="text-xs text-[#8B6347]">
                  Para cuando el empleado avisó de forma presencial y no por WhatsApp. Queda aprobado directamente (salvo una
                  Enfermedad sin certificado, que queda pendiente hasta que lo presente). En Motivo Personal elegís si es con o sin goce de sueldo.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Empleado</label>
                    <select
                      value={nuevoEmpleadoId}
                      onChange={(e) => setNuevoEmpleadoId(e.target.value)}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-48"
                    >
                      <option value="">Elegir...</option>
                      {empleados.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Categoría</label>
                    <select
                      value={nuevaCategoria}
                      onChange={(e) => setNuevaCategoria(e.target.value as (typeof CATEGORIAS_MANUALES)[number])}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    >
                      {CATEGORIAS_MANUALES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
                    <select
                      value={nuevaSucursal}
                      onChange={(e) => setNuevaSucursal(e.target.value)}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    >
                      <option value="">Sin especificar</option>
                      {SUCURSALES.filter((s) => s !== "Todas").map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Desde</label>
                    <input
                      type="date"
                      value={nuevaFechaInicio}
                      onChange={(e) => setNuevaFechaInicio(e.target.value)}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Hasta</label>
                    <input
                      type="date"
                      value={nuevaFechaFin}
                      onChange={(e) => setNuevaFechaFin(e.target.value)}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    />
                  </div>
                  {nuevaCategoria === "Enfermedad" && (
                    <label className="flex items-center gap-2 cursor-pointer select-none pb-1.5">
                      <input
                        type="checkbox"
                        checked={nuevoCertificado}
                        onChange={(e) => setNuevoCertificado(e.target.checked)}
                        className="accent-[#D4A843] w-4 h-4"
                      />
                      <span className="text-sm text-[#2C1810]">Ya presentó el certificado</span>
                    </label>
                  )}
                  {nuevaCategoria === "Motivo Personal" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#8B6347] font-medium">Goce de sueldo</label>
                      <select
                        value={nuevoGoce}
                        onChange={(e) => setNuevoGoce(e.target.value as "" | "con" | "sin")}
                        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      >
                        <option value="">Elegir...</option>
                        <option value="con">Con goce</option>
                        <option value="sin">Sin goce (se descuenta)</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-[#8B6347] font-medium block mb-1">Nota (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: avisó de forma presencial"
                    value={nuevaNota}
                    onChange={(e) => setNuevaNota(e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-full max-w-md"
                  />
                </div>
                {errorManual && <p className="text-xs text-red-500">{errorManual}</p>}
                {avisoManual && <p className="text-xs text-amber-600">⚠ {avisoManual}</p>}
                <button
                  type="submit"
                  disabled={guardandoManual}
                  className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-1.5 rounded-lg font-medium active:scale-95 transition-colors"
                >
                  {guardandoManual ? "Guardando..." : "Cargar pedido"}
                </button>
              </form>
            )}

            {/* Cards resumen (respetan los filtros) */}
            {registros && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Registros</p>
                  <p className="text-3xl font-bold text-[#2C1810] mt-1">{resumen.total}</p>
                </div>
                <button
                  onClick={() => setFiltro("estado", filtros.estado === "pendiente" ? "Todos" : "pendiente")}
                  className={`text-left bg-white rounded-xl border p-4 transition-colors ${
                    filtros.estado === "pendiente" ? "border-amber-400 ring-1 ring-amber-300" : "border-[#EDE0CC] hover:border-amber-300"
                  }`}
                >
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Por aprobar</p>
                  <p className={`text-3xl font-bold mt-1 ${resumen.pendientesAprobacion > 0 ? "text-amber-600" : "text-[#2C1810]"}`}>
                    {resumen.pendientesAprobacion}
                  </p>
                </button>
                <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Cert. pendientes</p>
                  <p className={`text-3xl font-bold mt-1 ${resumen.certificadosPendientes > 0 ? "text-amber-600" : "text-[#2C1810]"}`}>
                    {resumen.certificadosPendientes}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-2">Por tipo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(resumen.porTipo).map(([k, v]) => (
                      <span key={k} className="text-xs bg-[#FAF7F2] border border-[#EDE0CC] rounded-full px-2 py-0.5 text-[#2C1810]">
                        {k}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Por sucursal */}
            {Object.keys(resumen.porSucursal).length > 0 && (
              <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
                <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-3">Por sucursal</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(resumen.porSucursal)
                    .sort((a, b) => b[1] - a[1])
                    .map(([suc, count]) => {
                      const max = Math.max(...Object.values(resumen.porSucursal));
                      const pct = Math.round((count / max) * 100);
                      return (
                        <div key={suc} className="flex-1 min-w-[100px]">
                          <div className="flex justify-between text-xs text-[#2C1810] mb-1">
                            <span className="font-medium">{suc}</span>
                            <span>{count}</span>
                          </div>
                          <div className="h-2 bg-[#EDE0CC] rounded-full overflow-hidden">
                            <div className="h-full bg-[#D4A843] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
              <EmpleadoMultiSelect value={filtros.nombres} onChange={(v) => setFiltro("nombres", v)} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium" title="Muestra quién estaba ausente ese día (dentro del rango pedido), no el día en que avisó">
                  Día de ausencia
                </label>
                <input
                  type="date"
                  value={filtros.dia}
                  onChange={(e) => setFiltro("dia", e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
                <select
                  value={filtros.sucursal}
                  onChange={(e) => setFiltro("sucursal", e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                >
                  {SUCURSALES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Tipo</label>
                <select
                  value={filtros.tipo}
                  onChange={(e) => setFiltro("tipo", e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                >
                  <option>Todos</option>
                  {TIPOS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Estado</label>
                <select
                  value={filtros.estado}
                  onChange={(e) => setFiltro("estado", e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                >
                  <option value="Todos">Todos</option>
                  {ESTADOS_FILTRO.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none pb-1.5">
                <input
                  type="checkbox"
                  checked={filtros.soloCertPendiente}
                  onChange={(e) => setFiltro("soloCertPendiente", e.target.checked)}
                  className="accent-[#D4A843] w-4 h-4"
                />
                <span className="text-sm text-[#2C1810]">Solo cert. pendientes</span>
              </label>
              {hayFiltrosActivos && (
                <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-xs text-[#8B6347] hover:text-red-500 underline pb-2">
                  Limpiar filtros
                </button>
              )}
            </div>

            {selected.size > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-[#D4A843] bg-[#FDF6E3] px-4 py-2.5">
                <span className="text-sm font-medium text-[#2C1810]">{selected.size} seleccionados</span>
                <button
                  onClick={() => setConfirmarBorrado([...selected])}
                  className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600 active:scale-95"
                >
                  Eliminar seleccionados
                </button>
              </div>
            )}

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
                </div>
              )}

              {error && <div className="text-center py-16 text-red-500 text-sm">{error}</div>}

              {!loading && !error && filtrados.length === 0 && (
                <div className="text-center py-16 text-[#8B6347] text-sm">
                  {registros?.length === 0 ? "Aún no hay registros de ausentismo." : "Ningún registro coincide con los filtros."}
                </div>
              )}

              {!loading && filtrados.length > 0 && (
                <table className="w-full text-sm responsive-table">
                  <thead>
                    <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={filtrados.length > 0 && filtrados.every((a) => selected.has(a.id))}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Días de ausencia</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Estado</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Certificado</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Avisó</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((a, i) => {
                      const isSelected = selected.has(a.id);
                      const rango = rangoTexto(a);
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"} ${isSelected ? "bg-[#FDF6E3]" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(a.id)}
                              className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Empleado">
                            {a.nombre}
                            {a.origen === "manual" && (
                              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                Carga manual
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#5C3D2E]" data-label="Sucursal">{a.sucursal}</td>
                          <td className="px-4 py-3" data-label="Tipo"><BadgeMotivo tipo={a.tipo} /></td>
                          <td className="px-4 py-3 text-[#2C1810] whitespace-nowrap" data-label="Días de ausencia">
                            {rango ? (
                              <>
                                {rango}
                                {a.fechaInicio && a.fechaFin && a.fechaInicio !== a.fechaFin && (
                                  <span className="text-xs ml-1 text-[#B89070]">({diasDelRango(a.fechaInicio, a.fechaFin)} días)</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-[#8B6347]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3" data-label="Estado">
                            <div className="flex items-center gap-2 flex-wrap">
                              <BadgeEstado estado={a.estado} goceSueldo={a.goceSueldo} />
                              {a.estado === "pendiente" && puedeDecidirse(a) && (
                                <span className="flex items-center gap-1">
                                  <button
                                    onClick={() => abrirDecision(a, "aprobado")}
                                    className="text-xs text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded font-medium active:scale-95 transition-colors"
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() => abrirDecision(a, "rechazado")}
                                    className="text-xs text-red-600 border border-red-300 hover:bg-red-50 px-2 py-0.5 rounded font-medium active:scale-95 transition-colors"
                                  >
                                    Rechazar
                                  </button>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3" data-label="Certificado">
                            <div className="flex items-center gap-2 flex-wrap">
                              {a.certificadoPendiente ? (
                                <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                                  ⚠ Pendiente
                                </span>
                              ) : a.certificadoRecibidoEn ? (
                                <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                                  ✅ Recibido
                                </span>
                              ) : (
                                <span className="text-xs text-[#8B6347]">—</span>
                              )}
                              {a.archivos.length > 0 && (
                                <a
                                  href={`/api/legajos/${a.archivos[0].empleado_id}/${a.archivos[0].id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={a.archivos[0].etiqueta || a.archivos[0].nombre_original}
                                  className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium whitespace-nowrap"
                                >
                                  📎 {a.archivos.length === 1 ? "Ver archivo" : `Ver (${a.archivos.length})`}
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#8B6347] whitespace-nowrap" data-label="Avisó">
                            {formatDate(a.fecha)}
                            <span className="text-xs ml-1 text-[#B89070]">{formatTime(a.fecha)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setDetalle(a)}
                                className="text-xs text-[#D4A843] hover:text-[#2C1810] font-medium underline"
                              >
                                Ver detalle
                              </button>
                              <button
                                onClick={() => setConfirmarBorrado([a.id])}
                                className="text-xs text-red-400 hover:text-red-600 font-medium underline"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!loading && registros && (
              <p className="text-xs text-[#B89070] text-right">
                Mostrando {filtrados.length} de {registros.length} registros
              </p>
            )}
          </>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-[#2C1810] text-lg">{detalle.nombre}</h2>
                <p className="text-sm text-[#8B6347]">
                  {detalle.sucursal} · avisó el {formatDate(detalle.fecha)} {formatTime(detalle.fecha)}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0">Tipo</span>
                <BadgeMotivo tipo={detalle.tipo} />
              </div>
              {rangoTexto(detalle) && (
                <div className="flex gap-2">
                  <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Días</span>
                  <span className="text-sm text-[#2C1810]">
                    {rangoTexto(detalle)}
                    {detalle.fechaInicio && detalle.fechaFin && (
                      <span className="text-[#8B6347]"> ({diasDelRango(detalle.fechaInicio, detalle.fechaFin)} {diasDelRango(detalle.fechaInicio, detalle.fechaFin) === 1 ? "día" : "días"})</span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0">Estado</span>
                <BadgeEstado estado={detalle.estado} goceSueldo={detalle.goceSueldo} />
                {detalle.resueltoAt && detalle.estado !== "pendiente" && (
                  <span className="text-xs text-[#B89070]">el {formatDate(detalle.resueltoAt)}</span>
                )}
              </div>
              {detalle.respuesta && (
                <div className="flex gap-2">
                  <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Comentario</span>
                  <span className="text-sm text-[#2C1810]">{detalle.respuesta}</span>
                </div>
              )}
              {detalle.estado === "aprobado" && detalle.goceSueldo === false && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
                  Sin goce de sueldo: la falta queda justificada (no hace perder el presentismo), pero esos días se descuentan en la liquidación.
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Motivo</span>
                <span className="text-sm text-[#2C1810]">{detalle.motivo}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Detalle</span>
                <span className="text-sm text-[#2C1810]">{detalle.detalle}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Contacto</span>
                <span className="text-sm text-[#2C1810]">{detalle.contacto}</span>
              </div>
              {detalle.certificadoPendiente && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  ⚠ El empleado aún no presentó el certificado médico.
                </div>
              )}
              {detalle.certificadoRecibidoEn && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                  ✅ Certificado recibido el {formatDate(detalle.certificadoRecibidoEn)} a las {formatTime(detalle.certificadoRecibidoEn)}.
                </div>
              )}
              {detalle.archivos.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-1">Archivos</span>
                  <div className="flex-1 space-y-1.5">
                    {detalle.archivos.map((archivo) => (
                      <a
                        key={archivo.id}
                        href={`/api/legajos/${archivo.empleado_id}/${archivo.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 bg-[#FAF7F2] border border-[#EDE0CC] rounded-lg px-3 py-2 hover:border-[#D4A843] transition-colors"
                      >
                        <span className="text-sm text-[#2C1810] font-medium truncate">📎 {archivo.etiqueta || archivo.nombre_original}</span>
                        <span className="text-xs text-[#B89070] font-mono shrink-0">{formatTamanio(archivo.tamanio_bytes)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {detalle.empleadoId && (
                <div className="flex gap-2">
                  <span className="text-xs text-[#8B6347] w-24 shrink-0 pt-0.5">Legajo</span>
                  <Link href={`/legajos/${detalle.empleadoId}`} className="text-sm text-[#D4A843] hover:text-[#2C1810] underline font-medium">
                    Ver legajo completo →
                  </Link>
                </div>
              )}
            </div>

            {puedeDecidirse(detalle) && (
              <div className="mt-5 flex gap-2">
                {detalle.estado !== "aprobado" && (
                  <button
                    onClick={() => abrirDecision(detalle, "aprobado")}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-emerald-700 active:scale-95 transition-colors"
                  >
                    {detalle.estado === "rechazado" ? "Cambiar a aprobado" : "Aprobar"}
                  </button>
                )}
                {detalle.estado !== "rechazado" && (
                  <button
                    onClick={() => abrirDecision(detalle, "rechazado")}
                    className="flex-1 border border-red-300 text-red-600 rounded-xl py-2 text-sm font-medium hover:bg-red-50 active:scale-95 transition-colors"
                  >
                    {detalle.estado === "aprobado" ? "Cambiar a rechazado" : "Rechazar"}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setDetalle(null)}
              className="mt-3 w-full bg-[#2C1810] text-white rounded-xl py-2 text-sm font-medium hover:bg-[#3D2418] active:scale-95 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal aprobar / rechazar */}
      {decisionEnCurso && (() => {
        const { registro: r, decision } = decisionEnCurso;
        const aprobar = decision === "aprobado";
        const dias = r.fechaInicio && r.fechaFin ? diasDelRango(r.fechaInicio, r.fechaFin) : null;
        const excedeSaldo = aprobar && r.tipo === "Vacaciones" && r.saldoVacaciones !== null && dias !== null && dias > r.saldoVacaciones;
        const sinCertificado = aprobar && r.tipo === "Enfermedad" && r.archivos.length === 0;
        const eligeGoce = aprobar && r.tipo === "Motivo Personal";
        const tituloPedido =
          r.tipo === "Vacaciones" ? "vacaciones" : r.tipo === "Motivo Personal" ? "motivo personal" : "certificado de enfermedad";
        return (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => !guardandoDecision && setDecisionEnCurso(null)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-bold text-[#2C1810] text-lg">
                {aprobar ? "Aprobar" : "Rechazar"} {tituloPedido}
              </h2>
              <p className="text-sm text-[#8B6347] mt-1">
                {r.nombre} · {rangoTexto(r)}
                {dias !== null && ` (${dias} ${dias === 1 ? "día" : "días"})`}
              </p>

              <div className="mt-4 space-y-3">
                {eligeGoce ? (
                  <div>
                    <p className="text-xs text-[#8B6347] font-medium mb-1.5">¿Con goce o sin goce de sueldo?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([true, false] as const).map((conGoce) => (
                        <button
                          key={String(conGoce)}
                          type="button"
                          onClick={() => setGoceSueldo(conGoce)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                            goceSueldo === conGoce
                              ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
                              : "border-[#EDE0CC] hover:border-[#D4A843]"
                          }`}
                        >
                          <span className="block text-sm font-medium text-[#2C1810]">{conGoce ? "Con goce" : "Sin goce"}</span>
                          <span className="block text-xs text-[#8B6347] mt-0.5">
                            {conGoce
                              ? "Se paga: no se descuenta en la liquidación."
                              : "Queda justificada (no pierde presentismo), pero se descuenta."}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#5C3D2E]">
                    {aprobar
                      ? "Esos días quedan justificados: no se descuentan en la liquidación" +
                        (r.tipo === "Vacaciones" ? " y se restan del saldo de vacaciones." : " y el certificado se da por recibido.")
                      : "Esos días no quedan justificados: si faltó a un turno, se descuenta como falta sin aviso en la liquidación."}
                  </p>
                )}
                {r.tipo === "Vacaciones" && r.saldoVacaciones !== null && (
                  <p className={`text-xs rounded-lg px-3 py-2 border ${excedeSaldo ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-[#FAF7F2] border-[#EDE0CC] text-[#5C3D2E]"}`}>
                    {excedeSaldo ? "⚠ " : ""}Saldo de vacaciones disponible: <strong>{r.saldoVacaciones}</strong> días
                    {excedeSaldo && ` — pide ${dias}.`}
                  </p>
                )}
                {sinCertificado && (
                  <p className="text-xs rounded-lg px-3 py-2 border bg-amber-50 border-amber-300 text-amber-800">
                    ⚠ No hay certificado cargado en el sistema. Aprobalo solo si lo presentó en papel.
                  </p>
                )}
                <div>
                  <label className="text-xs text-[#8B6347] font-medium block mb-1">
                    Comentario para el empleado {aprobar ? "(opcional)" : "(recomendado)"}
                  </label>
                  <textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={2}
                    placeholder={aprobar ? "Ej: ¡Que las disfrutes!" : "Ej: esa semana ya hay dos personas de vacaciones en la sucursal"}
                    className="w-full border border-[#EDE0CC] rounded-lg px-3 py-2 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] resize-none"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notificar}
                    onChange={(e) => setNotificar(e.target.checked)}
                    className="accent-[#D4A843] w-4 h-4"
                  />
                  <span className="text-sm text-[#2C1810]">Avisarle a {r.nombre} por WhatsApp</span>
                </label>
                {errorDecision && <p className="text-xs text-red-500">{errorDecision}</p>}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setDecisionEnCurso(null)}
                  disabled={guardandoDecision}
                  className="flex-1 border border-[#EDE0CC] text-[#8B6347] rounded-xl py-2 text-sm font-medium hover:border-[#2C1810] hover:text-[#2C1810] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarDecision}
                  disabled={guardandoDecision || (eligeGoce && goceSueldo === null)}
                  className={`flex-1 text-white rounded-xl py-2 text-sm font-medium active:scale-95 transition-colors disabled:opacity-50 ${
                    aprobar ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"
                  }`}
                >
                  {guardandoDecision ? "Guardando..." : aprobar ? "Aprobar" : "Rechazar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal confirmar borrado */}
      {confirmarBorrado && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => !deleting && setConfirmarBorrado(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-[#2C1810] text-lg">
              ¿Eliminar {confirmarBorrado.length === 1 ? "este registro" : `${confirmarBorrado.length} registros`}?
            </h2>
            {aBorrar.length === 1 && (
              <p className="text-sm text-[#8B6347] mt-1">
                {aBorrar[0].nombre} · {aBorrar[0].tipo}
                {rangoTexto(aBorrar[0]) ? ` · ${rangoTexto(aBorrar[0])}` : ""}
              </p>
            )}
            <ul className="mt-4 space-y-2 text-sm text-[#5C3D2E] list-disc pl-5">
              <li>Sale del panel y del calendario. El mensaje en el chat <strong>no</strong> se borra.</li>
              <li className={borraAprobados ? "text-red-600 font-medium" : ""}>
                {borraAprobados
                  ? "Hay pedidos APROBADOS: esos días van a dejar de estar justificados y se van a descontar como falta sin aviso en la liquidación."
                  : "Si tenía días justificados, dejan de estarlo en la liquidación."}
              </li>
              <li>Si tenía un certificado pendiente, el bot deja de pedírselo.</li>
            </ul>
            <p className="text-xs text-[#8B6347] mt-3">
              Si lo que querés es que no cuente como justificado, usá <strong>Rechazar</strong> en vez de eliminar.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmarBorrado(null)}
                disabled={deleting}
                className="flex-1 border border-[#EDE0CC] text-[#8B6347] rounded-xl py-2 text-sm font-medium hover:border-[#2C1810] hover:text-[#2C1810] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminar(confirmarBorrado)}
                disabled={deleting}
                className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-600 active:scale-95 transition-colors disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
