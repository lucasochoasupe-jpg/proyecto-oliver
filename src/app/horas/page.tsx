"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import type { Turno } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

interface ResumenEmpleado {
  nombre: string;
  totalHoras: number;
  enCurso: boolean;
}

interface ApiResponse {
  desde: string;
  hasta: string;
  turnos: Turno[];
  resumen: ResumenEmpleado[];
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

function formatHoras(h: number) {
  const horas = Math.floor(h);
  const minutos = Math.round((h - horas) * 60);
  return `${horas}h ${minutos.toString().padStart(2, "0")}m`;
}

export default function HorasPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sucursalFiltro, setSucursalFiltro] = useState("Todas");
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [expandido, setExpandido] = useState<string | null>(null);

  const ESTADO_PARAM: Record<string, string> = { Todos: "todos", Terminados: "terminados", "En curso": "encurso" };

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    if (estadoFiltro !== "Todos") params.set("estado", ESTADO_PARAM[estadoFiltro]);
    const res = await fetch(`/api/asistencia/horas?${params}`);
    const json = (await res.json()) as ApiResponse;
    setData(json);
    setLoading(false);
    if (!desde) setDesde(json.desde);
    if (!hasta) setHasta(json.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalFiltro, nombresFiltro, estadoFiltro]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const hayFiltros = sucursalFiltro !== "Todas" || nombresFiltro.length > 0 || estadoFiltro !== "Todos";
  const totalPeriodo = data?.resumen.reduce((acc, e) => acc + e.totalHoras, 0) ?? 0;

  function turnosDe(nombre: string) {
    return data?.turnos.filter((t) => t.nombre === nombre) ?? [];
  }

  function exportarExcel() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    if (estadoFiltro !== "Todos") params.set("estado", ESTADO_PARAM[estadoFiltro]);
    window.location.href = `/api/asistencia/horas/export?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Horas trabajadas" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#2C1810]">Horas trabajadas</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ↻ Actualizar
            </button>
            <button
              onClick={exportarExcel}
              disabled={!data || data.resumen.length === 0}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
            >
              ↓ Exportar Excel
            </button>
          </div>
        </div>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Total del período</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{formatHoras(totalPeriodo)}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Empleados</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{data.resumen.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 col-span-2">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-1">Rango</p>
              <p className="text-sm text-[#2C1810] mt-1">{data.desde} → {data.hasta}</p>
              {data.resumen.some((e) => e.enCurso) && (
                <p className="text-xs text-amber-600 mt-1">⏱ Hay turnos en curso (sin marcar salida todavía)</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
          <EmpleadoMultiSelect value={nombresFiltro} onChange={setNombresFiltro} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
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
            <label className="text-xs text-[#8B6347] font-medium">Estado</label>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            >
              {["Todos", "Terminados", "En curso"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {hayFiltros && (
            <button
              onClick={() => { setSucursalFiltro("Todas"); setNombresFiltro([]); setEstadoFiltro("Todos"); }}
              className="text-xs text-[#8B6347] hover:text-red-500 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          )}

          {!loading && data && data.resumen.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">
              Ningún turno registrado en el rango seleccionado.
            </div>
          )}

          {!loading && data && data.resumen.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Total horas</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {data.resumen.map((e, i) => (
                  <Fragment key={e.nombre}>
                    <tr
                      onClick={() => setExpandido(expandido === e.nombre ? null : e.nombre)}
                      className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}
                    >
                      <td className="px-4 py-3 font-medium text-[#2C1810]">
                        {e.nombre}
                        {e.enCurso && (
                          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            ⏱ en curso
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#2C1810] font-semibold">{formatHoras(e.totalHoras)}</td>
                      <td className="px-4 py-3 text-[#B89070] text-xs">{expandido === e.nombre ? "▲ ocultar" : "▼ detalle"}</td>
                    </tr>
                    {expandido === e.nombre && (
                      <tr key={`${e.nombre}-detalle`}>
                        <td colSpan={4} className="bg-[#FAF7F2] px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[#8B6347] uppercase tracking-wide">
                                <th className="text-left py-1 pr-4">Sucursal</th>
                                <th className="text-left py-1 pr-4">Fecha</th>
                                <th className="text-left py-1 pr-4">Entrada</th>
                                <th className="text-left py-1 pr-4">Salida</th>
                                <th className="text-left py-1 pr-4">Horas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {turnosDe(e.nombre).map((t, j) => (
                                <tr key={j} className="border-t border-[#EDE0CC]">
                                  <td className="py-1.5 pr-4 text-[#5C3D2E]">{t.sucursal_nombre}</td>
                                  <td className="py-1.5 pr-4 text-[#8B6347]">{formatFecha(t.entrada_at)}</td>
                                  <td className="py-1.5 pr-4 font-mono text-[#8B6347]">{formatHora(t.entrada_at)}</td>
                                  <td className="py-1.5 pr-4 font-mono text-[#8B6347]">
                                    {t.salida_at ? formatHora(t.salida_at) : <span className="italic text-amber-600">en curso</span>}
                                  </td>
                                  <td className="py-1.5 pr-4 font-mono text-[#2C1810]">
                                    {t.horas !== null ? formatHoras(t.horas) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
