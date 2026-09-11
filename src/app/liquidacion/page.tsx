"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

interface LiquidacionEmpleado {
  empleado_id: number;
  nombre: string;
  tipo_pago: "mensual" | "hora" | "dia" | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null;
  horas_trabajadas: number | null;
  horas_en_curso: boolean;
  horas_pactadas: number | null;
  valor_hora_equivalente: number | null;
  minutos_perdidos: number;
  descuento_tardanza: number;
  dias_ausencia: number;
  horas_ausencia: number;
  descuento_ausencia: number;
  dias_ausencia_justificada: number;
  horas_ausencia_justificada: number;
  dias_trabajados: number | null;
  horas_extra: number | null;
  total_por_horas: number | null;
  adelantos: number;
  total: number;
  advertencias: string[];
}

interface ApiResponse {
  desde: string;
  hasta: string;
  filas: LiquidacionEmpleado[];
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Compara el total (sueldo fijo mensual, o jornal por día) contra lo que
// cobraría estrictamente por horas trabajadas × valor hora — para detectar de
// un vistazo si el sueldo fijo está pagando de más o de menos.
function ComparacionPorHoras({ f }: { f: LiquidacionEmpleado }) {
  if (f.total_por_horas === null) return null;
  const diff = f.total - f.total_por_horas;
  const igual = Math.abs(diff) <= 1;
  return (
    <p className={igual ? "" : diff > 0 ? "text-red-600" : "text-blue-600"}>
      Según horas trabajadas × valor hora: {formatMoneda(f.total_por_horas)}
      {!igual && ` — cobra ${formatMoneda(Math.abs(diff))} ${diff > 0 ? "de más" : "de menos"} que eso`}
    </p>
  );
}

function formatHoras(h: number) {
  const horas = Math.floor(h);
  const minutos = Math.round((h - horas) * 60);
  return `${horas}h ${minutos.toString().padStart(2, "0")}m`;
}

export default function LiquidacionPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [expandido, setExpandido] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    const res = await fetch(`/api/liquidacion?${params}`);
    const json = (await res.json()) as ApiResponse;
    setData(json);
    setLoading(false);
    if (!desde) setDesde(json.desde);
    if (!hasta) setHasta(json.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, nombresFiltro]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportarExcel() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    window.location.href = `/api/liquidacion/export?${params.toString()}`;
  }

  const filas = data?.filas ?? [];
  const totalPeriodo = filas.reduce((acc, f) => acc + f.total, 0);
  const conAlertas = filas.filter((f) => f.advertencias.length > 0).length;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Liquidación de sueldos" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Liquidación de sueldos</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              Cálculo interno aproximado a partir de asistencia y horarios — no reemplaza el recibo de sueldo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ↻ Actualizar
            </button>
            <button
              onClick={exportarExcel}
              disabled={filas.length === 0}
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
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{formatMoneda(totalPeriodo)}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Empleados</p>
              <p className="text-3xl font-bold text-[#2C1810] mt-1">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 col-span-2">
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-1">Rango</p>
              <p className="text-sm text-[#2C1810] mt-1">{data.desde} → {data.hasta}</p>
              {conAlertas > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ {conAlertas} empleado{conAlertas > 1 ? "s" : ""} con datos incompletos (ver detalle)
                </p>
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
          {nombresFiltro.length > 0 && (
            <button
              onClick={() => setNombresFiltro([])}
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

          {!loading && filas.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">
              Ningún empleado activo en el rango seleccionado.
            </div>
          )}

          {!loading && filas.length > 0 && (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Base</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Descuentos</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const descuentos = f.descuento_tardanza + f.descuento_ausencia + f.adelantos;
                  return (
                    <Fragment key={f.empleado_id}>
                      <tr
                        onClick={() => setExpandido(expandido === f.empleado_id ? null : f.empleado_id)}
                        className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Empleado">
                          {f.nombre}
                          {f.advertencias.length > 0 && (
                            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              ⚠ {f.advertencias.length}
                            </span>
                          )}
                          {f.horas_en_curso && (
                            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                              ⏱ en curso
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#5C3D2E]" data-label="Tipo">
                          {f.tipo_pago === "mensual"
                            ? "Mensual"
                            : f.tipo_pago === "hora"
                            ? "Por hora"
                            : f.tipo_pago === "dia"
                            ? "Por día"
                            : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#8B6347]" data-label="Base">
                          {f.tipo_pago === "mensual"
                            ? f.sueldo_mensual !== null
                              ? formatMoneda(f.sueldo_mensual)
                              : "—"
                            : f.tipo_pago === "hora"
                            ? f.horas_trabajadas !== null
                              ? `${formatHoras(f.horas_trabajadas)} × ${f.valor_hora ? formatMoneda(f.valor_hora) : "—"}`
                              : "—"
                            : f.tipo_pago === "dia"
                            ? f.dias_trabajados !== null
                              ? `${f.dias_trabajados} día${f.dias_trabajados === 1 ? "" : "s"} × ${f.valor_dia ? formatMoneda(f.valor_dia) : "—"}`
                              : f.horas_trabajadas !== null
                              ? `${formatHoras(f.horas_trabajadas)} × ${f.valor_hora ? formatMoneda(f.valor_hora) : "—"}`
                              : "—"
                            : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-red-500" data-label="Descuentos">
                          {descuentos > 0 ? `- ${formatMoneda(descuentos)}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#2C1810] font-semibold" data-label="Total">{formatMoneda(f.total)}</td>
                        <td className="px-4 py-3 text-[#B89070] text-xs">{expandido === f.empleado_id ? "▲ ocultar" : "▼ detalle"}</td>
                      </tr>
                      {expandido === f.empleado_id && (
                        <tr key={`${f.empleado_id}-detalle`}>
                          <td colSpan={6} className="detail-cell bg-[#FAF7F2] px-4 py-3">
                            <div className="text-xs text-[#5C3D2E] space-y-1">
                              {f.advertencias.map((a, j) => (
                                <p key={j} className="text-amber-700">⚠ {a}</p>
                              ))}
                              {f.adelantos > 0 && (
                                <p className="text-red-600">Adelantos en el período: - {formatMoneda(f.adelantos)}</p>
                              )}
                              {f.tipo_pago === "hora" && (
                                <p>Horas trabajadas en el período: {f.horas_trabajadas !== null ? formatHoras(f.horas_trabajadas) : "—"}</p>
                              )}
                              {f.tipo_pago === "dia" && (
                                <>
                                  <p>Horas trabajadas en el período: {f.horas_trabajadas !== null ? formatHoras(f.horas_trabajadas) : "—"}</p>
                                  <ComparacionPorHoras f={f} />
                                  {f.dias_trabajados !== null ? (
                                    <>
                                      <p>
                                        Días trabajados (con jornal): {f.dias_trabajados} × {f.valor_dia ? formatMoneda(f.valor_dia) : "—"}
                                      </p>
                                      {f.horas_extra !== null && f.horas_extra > 0 && (
                                        <p>
                                          Horas extra (por encima del turno pactado): {formatHoras(f.horas_extra)}
                                          {f.valor_hora && ` (+ ${formatMoneda(f.horas_extra * f.valor_hora)})`}
                                        </p>
                                      )}
                                      <p>
                                        Ausencias sin aviso: {f.dias_ausencia} día{f.dias_ausencia === 1 ? "" : "s"} — no genera jornal ese día
                                      </p>
                                      {f.dias_ausencia_justificada > 0 && (
                                        <p className="text-emerald-700">
                                          ✓ Ausencias justificadas (avisadas): {f.dias_ausencia_justificada} día
                                          {f.dias_ausencia_justificada === 1 ? "" : "s"}
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-amber-700">
                                      ⚠ Sin horario cargado — se pagó directo por hora trabajada (sin jornal ni horas extra).
                                    </p>
                                  )}
                                </>
                              )}
                              {f.tipo_pago === "mensual" && (
                                <>
                                  <p>Horas pactadas en el período: {f.horas_pactadas !== null ? formatHoras(f.horas_pactadas) : "—"}</p>
                                  <p>Horas trabajadas (fichadas) en el período: {f.horas_trabajadas !== null ? formatHoras(f.horas_trabajadas) : "—"}</p>
                                  <p>
                                    Valor hora equivalente (sueldo ÷ horas pactadas):{" "}
                                    {f.valor_hora_equivalente !== null ? formatMoneda(f.valor_hora_equivalente) : "—"}
                                  </p>
                                  <ComparacionPorHoras f={f} />
                                  <p>
                                    Tardanzas / salidas anticipadas: {f.minutos_perdidos} min
                                    {f.descuento_tardanza > 0 && ` (- ${formatMoneda(f.descuento_tardanza)})`}
                                  </p>
                                  <p>
                                    Ausencias sin aviso: {f.dias_ausencia} día{f.dias_ausencia === 1 ? "" : "s"}
                                    {f.horas_ausencia > 0 && ` (${formatHoras(f.horas_ausencia)})`}
                                    {f.descuento_ausencia > 0 && ` (- ${formatMoneda(f.descuento_ausencia)})`}
                                  </p>
                                  {f.dias_ausencia_justificada > 0 && (
                                    <p className="text-emerald-700">
                                      ✓ Ausencias justificadas (avisadas): {f.dias_ausencia_justificada} día
                                      {f.dias_ausencia_justificada === 1 ? "" : "s"}
                                      {f.horas_ausencia_justificada > 0 && ` (${formatHoras(f.horas_ausencia_justificada)})`} — no se descuentan
                                    </p>
                                  )}
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
      </div>
    </div>
  );
}
