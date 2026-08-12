"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";
import type { AusenciaRecord } from "@/app/api/rrhh/route";

interface Resumen {
  total: number;
  certificadosPendientes: number;
  porSucursal: Record<string, number>;
  porMotivo: Record<string, number>;
}

interface ApiResponse {
  ausencias: AusenciaRecord[];
  resumen: Resumen;
}

const SUCURSALES = ["Todas", "Fraga", "Campbell", "Mendoza", "Avenida", "Donado", "Montevideo", "Terminal"];
const MOTIVOS = ["Todos", "Enfermedad", "Motivo Personal", "Licencia", "Urgencia", "Otro"];

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

function toISODay(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clasificarMotivo(motivo: string): string {
  const m = motivo.toLowerCase();
  if (m.includes("urgencia")) return "Urgencia";
  if (m.includes("licencia")) return "Licencia";
  if (m.includes("enfermedad")) return "Enfermedad";
  if (m.includes("personal")) return "Motivo Personal";
  return "Otro";
}

function BadgeMotivo({ motivo }: { motivo: string }) {
  const tipo = clasificarMotivo(motivo);
  const colors: Record<string, string> = {
    Urgencia: "bg-red-100 text-red-700 border border-red-200",
    Licencia: "bg-blue-100 text-blue-700 border border-blue-200",
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

export default function RRHHPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sucursalFiltro, setSucursalFiltro] = useState("Todas");
  const [motivoFiltro, setMotivoFiltro] = useState("Todos");
  const [soloCertPendiente, setSoloCertPendiente] = useState(false);
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [detalle, setDetalle] = useState<AusenciaRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/rrhh");
      if (!res.ok) throw new Error("Error al cargar datos");
      const json = (await res.json()) as ApiResponse;
      setData(json);
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

  const ausenciasFiltradas = (data?.ausencias ?? []).filter((a) => {
    if (sucursalFiltro !== "Todas" && a.sucursal !== sucursalFiltro) return false;
    if (motivoFiltro !== "Todos" && clasificarMotivo(a.motivo) !== motivoFiltro) return false;
    if (soloCertPendiente && !a.certificadoPendiente) return false;
    if (fechaFiltro && toISODay(a.fecha) !== fechaFiltro) return false;
    if (nombresFiltro.length > 0 && !nombresFiltro.includes(a.nombre)) return false;
    return true;
  });

  async function eliminarRegistro(id: number) {
    await fetch(`/api/rrhh/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchData();
  }

  function exportarExcel() {
    const params = new URLSearchParams();
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (motivoFiltro !== "Todos") params.set("motivo", motivoFiltro);
    if (soloCertPendiente) params.set("cert", "1");
    if (fechaFiltro) params.set("fecha", fechaFiltro);
    window.location.href = `/api/rrhh/export?${params.toString()}`;
  }

  const hayFiltrosActivos = sucursalFiltro !== "Todas" || motivoFiltro !== "Todos" || soloCertPendiente || nombresFiltro.length > 0 || fechaFiltro;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Panel de RRHH" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Título */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#2C1810]">Ausentismo y Novedades</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ↻ Actualizar
            </button>
            <button
              onClick={exportarExcel}
              disabled={ausenciasFiltradas.length === 0}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
            >
              ↓ Exportar Excel
            </button>
          </div>
        </div>

        {/* Cards resumen */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Total registros</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{data.resumen.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Cert. pendientes</p>
              <p className={`text-3xl font-bold mt-1 ${data.resumen.certificadosPendientes > 0 ? "text-amber-600" : "text-[#2C1810]"}`}>
                {data.resumen.certificadosPendientes}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 col-span-2">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-2">Por tipo</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.resumen.porMotivo).map(([k, v]) => (
                  <span key={k} className="text-xs bg-[#FAF7F2] border border-[#EDE0CC] rounded-full px-2 py-0.5 text-[#2C1810]">
                    {k}: <strong>{v}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Por sucursal */}
        {data && Object.keys(data.resumen.porSucursal).length > 0 && (
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
            <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-3">Por sucursal</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.resumen.porSucursal)
                .sort((a, b) => b[1] - a[1])
                .map(([suc, count]) => {
                  const max = Math.max(...Object.values(data.resumen.porSucursal));
                  const pct = Math.round((count / max) * 100);
                  return (
                    <div key={suc} className="flex-1 min-w-[100px]">
                      <div className="flex justify-between text-xs text-[#2C1810] mb-1">
                        <span className="font-medium">{suc}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 bg-[#EDE0CC] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#D4A843] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
          <EmpleadoMultiSelect value={nombresFiltro} onChange={setNombresFiltro} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Fecha</label>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
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
              value={motivoFiltro}
              onChange={(e) => setMotivoFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            >
              {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloCertPendiente}
              onChange={(e) => setSoloCertPendiente(e.target.checked)}
              className="accent-[#D4A843] w-4 h-4"
            />
            <span className="text-sm text-[#2C1810]">Solo cert. pendientes</span>
          </label>
          {hayFiltrosActivos && (
            <button
              onClick={() => { setSucursalFiltro("Todas"); setMotivoFiltro("Todos"); setSoloCertPendiente(false); setNombresFiltro([]); setFechaFiltro(""); }}
              className="text-xs text-[#8B6347] hover:text-red-500 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-16 text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && ausenciasFiltradas.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">
              {data?.resumen.total === 0
                ? "Aún no hay registros de ausentismo."
                : "Ningún registro coincide con los filtros."}
            </div>
          )}

          {!loading && ausenciasFiltradas.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Certificado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ausenciasFiltradas.map((a, i) => (
                  <tr
                    key={a.id}
                    className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}
                  >
                    <td className="px-4 py-3 font-medium text-[#2C1810]">{a.nombre}</td>
                    <td className="px-4 py-3 text-[#5C3D2E]">{a.sucursal}</td>
                    <td className="px-4 py-3"><BadgeMotivo motivo={a.motivo} /></td>
                    <td className="px-4 py-3 text-[#8B6347] whitespace-nowrap">
                      {formatDate(a.fecha)}
                      <span className="text-xs ml-1 text-[#B89070]">{formatTime(a.fecha)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {a.certificadoPendiente ? (
                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                          ⚠ Pendiente
                        </span>
                      ) : (
                        <span className="text-xs text-[#8B6347]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDetalle(a)}
                          className="text-xs text-[#D4A843] hover:text-[#2C1810] font-medium underline"
                        >
                          Ver detalle
                        </button>
                        {confirmDelete === a.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => eliminarRegistro(a.id)}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded font-medium active:scale-95 transition-colors"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(a.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Contador resultado */}
        {!loading && data && (
          <p className="text-xs text-[#B89070] text-right">
            Mostrando {ausenciasFiltradas.length} de {data.resumen.total} registros
          </p>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-[#2C1810] text-lg">{detalle.nombre}</h2>
                <p className="text-sm text-[#8B6347]">{detalle.sucursal} · {formatDate(detalle.fecha)} {formatTime(detalle.fecha)}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B6347] w-24 shrink-0">Tipo</span>
                <BadgeMotivo motivo={detalle.motivo} />
              </div>
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
            </div>

            <button
              onClick={() => setDetalle(null)}
              className="mt-5 w-full bg-[#2C1810] text-white rounded-xl py-2 text-sm font-medium hover:bg-[#3D2418] active:scale-95 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
