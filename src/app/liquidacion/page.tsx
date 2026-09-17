"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

interface ParteDetalle {
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
  total: number;
}

interface AportesLegales {
  presentismo: number;
  sueldo_bruto: number;
  aporte_jubilacion: number;
  aporte_ley19032: number;
  aporte_obra_social: number;
  aporte_sindical: number;
  total_aportes_empleado: number;
  costo_art: number;
  costo_jubilacion_patronal: number;
  costo_obra_social_patronal: number;
  costo_seguro_vida: number;
  costo_empleador_total: number;
  costo_total_empleador: number;
}

interface LiquidacionEmpleado extends Omit<ParteDetalle, "total"> {
  empleado_id: number;
  nombre: string;
  adelantos: number;
  legal: AportesLegales | null;
  total_blanco: number;
  informal: ParteDetalle | null;
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
function ComparacionPorHoras({ total, totalPorHoras }: { total: number; totalPorHoras: number | null }) {
  if (totalPorHoras === null) return null;
  const diff = total - totalPorHoras;
  const igual = Math.abs(diff) <= 1;
  return (
    <p className={igual ? "" : diff > 0 ? "text-red-600" : "text-blue-600"}>
      Según horas trabajadas × valor hora: {formatMoneda(totalPorHoras)}
      {!igual && ` — cobra ${formatMoneda(Math.abs(diff))} ${diff > 0 ? "de más" : "de menos"} que eso`}
    </p>
  );
}

function formatHoras(h: number) {
  const horas = Math.floor(h);
  const minutos = Math.round((h - horas) * 60);
  return `${horas}h ${minutos.toString().padStart(2, "0")}m`;
}

// Desglose de una parte (blanca o informal) — mismo bloque de texto para ambas,
// cada una con su propio tipo de pago y valores.
function DetalleParte({ p }: { p: ParteDetalle }) {
  return (
    <>
      {p.tipo_pago === "hora" && (
        <p>Horas trabajadas en el período: {p.horas_trabajadas !== null ? formatHoras(p.horas_trabajadas) : "—"}</p>
      )}
      {p.tipo_pago === "dia" && (
        <>
          <p>Horas trabajadas en el período: {p.horas_trabajadas !== null ? formatHoras(p.horas_trabajadas) : "—"}</p>
          <ComparacionPorHoras total={p.total} totalPorHoras={p.total_por_horas} />
          {p.dias_trabajados !== null ? (
            <>
              <p>
                Días trabajados (con jornal): {p.dias_trabajados} × {p.valor_dia ? formatMoneda(p.valor_dia) : "—"}
              </p>
              {p.horas_extra !== null && p.horas_extra > 0 && (
                <p>
                  Horas extra (por encima del turno pactado): {formatHoras(p.horas_extra)}
                  {p.valor_hora && ` (+ ${formatMoneda(p.horas_extra * p.valor_hora)})`}
                </p>
              )}
              <p>
                Ausencias sin aviso: {p.dias_ausencia} día{p.dias_ausencia === 1 ? "" : "s"} — no genera jornal ese día
              </p>
              {p.dias_ausencia_justificada > 0 && (
                <p className="text-emerald-700">
                  ✓ Ausencias justificadas (avisadas): {p.dias_ausencia_justificada} día
                  {p.dias_ausencia_justificada === 1 ? "" : "s"}
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
      {p.tipo_pago === "mensual" && (
        <>
          <p>Horas pactadas en el período: {p.horas_pactadas !== null ? formatHoras(p.horas_pactadas) : "—"}</p>
          <p>Horas trabajadas (fichadas) en el período: {p.horas_trabajadas !== null ? formatHoras(p.horas_trabajadas) : "—"}</p>
          <p>
            Valor hora equivalente (sueldo ÷ horas pactadas):{" "}
            {p.valor_hora_equivalente !== null ? formatMoneda(p.valor_hora_equivalente) : "—"}
          </p>
          <ComparacionPorHoras total={p.total} totalPorHoras={p.total_por_horas} />
          <p>
            Tardanzas / salidas anticipadas: {p.minutos_perdidos} min
            {p.descuento_tardanza > 0 && ` (- ${formatMoneda(p.descuento_tardanza)})`}
          </p>
          <p>
            Ausencias sin aviso: {p.dias_ausencia} día{p.dias_ausencia === 1 ? "" : "s"}
            {p.horas_ausencia > 0 && ` (${formatHoras(p.horas_ausencia)})`}
            {p.descuento_ausencia > 0 && ` (- ${formatMoneda(p.descuento_ausencia)})`}
          </p>
          {p.dias_ausencia_justificada > 0 && (
            <p className="text-emerald-700">
              ✓ Ausencias justificadas (avisadas): {p.dias_ausencia_justificada} día
              {p.dias_ausencia_justificada === 1 ? "" : "s"}
              {p.horas_ausencia_justificada > 0 && ` (${formatHoras(p.horas_ausencia_justificada)})`} — no se descuentan
            </p>
          )}
        </>
      )}
    </>
  );
}

// Presentismo + aportes legales + costo empleador de la parte blanca — solo
// existe cuando el empleado tiene tipo_pago configurado (ver `legal` en
// LiquidacionEmpleado).
function DetalleLegal({ legal }: { legal: AportesLegales }) {
  return (
    <>
      {legal.presentismo > 0 && <p>Presentismo: + {formatMoneda(legal.presentismo)}</p>}
      <p>Sueldo bruto: {formatMoneda(legal.sueldo_bruto)}</p>
      <p>
        Aportes del empleado: jubilación {formatMoneda(legal.aporte_jubilacion)} · ley 19032{" "}
        {formatMoneda(legal.aporte_ley19032)} · obra social {formatMoneda(legal.aporte_obra_social)}
        {legal.aporte_sindical > 0 && ` · sindical ${formatMoneda(legal.aporte_sindical)}`} — total -{" "}
        {formatMoneda(legal.total_aportes_empleado)}
      </p>
      <p className="text-[#8B6347]">
        Costo empleador (no se descuenta del sueldo): ART {formatMoneda(legal.costo_art)} · jubilación patronal{" "}
        {formatMoneda(legal.costo_jubilacion_patronal)} · obra social patronal{" "}
        {formatMoneda(legal.costo_obra_social_patronal)}
        {legal.costo_seguro_vida > 0 && ` · seguro de vida ${formatMoneda(legal.costo_seguro_vida)}`} — costo total
        empleador {formatMoneda(legal.costo_total_empleador)}
      </p>
    </>
  );
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

  function descargarRecibo(empleadoId: number) {
    const params = new URLSearchParams();
    params.set("empleadoId", String(empleadoId));
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    window.location.href = `/api/liquidacion/recibo?${params.toString()}`;
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
                  const descuentos =
                    f.descuento_tardanza +
                    f.descuento_ausencia +
                    f.adelantos +
                    (f.legal?.total_aportes_empleado ?? 0) +
                    (f.informal?.descuento_tardanza ?? 0) +
                    (f.informal?.descuento_ausencia ?? 0);
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
                        <td className="px-4 py-3 font-mono text-[#2C1810] font-semibold" data-label="Total">
                          {formatMoneda(f.total)}
                          {f.informal && (
                            <div className="text-[10px] font-normal text-[#8B6347] mt-0.5">
                              Blanco {formatMoneda(f.total_blanco)} · Informal {formatMoneda(f.informal.total)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#B89070] text-xs whitespace-nowrap">
                          {f.tipo_pago !== null && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                descargarRecibo(f.empleado_id);
                              }}
                              className="mr-3 text-[#8B6347] hover:text-[#2C1810] underline"
                            >
                              Recibo (PDF)
                            </button>
                          )}
                          {expandido === f.empleado_id ? "▲ ocultar" : "▼ detalle"}
                        </td>
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
                              {f.informal && <p className="font-semibold text-[#2C1810]">Blanco</p>}
                              <DetalleParte p={{ ...f, total: f.total_blanco }} />
                              {f.legal && <DetalleLegal legal={f.legal} />}
                              {f.informal && (
                                <>
                                  <p className="font-semibold text-[#2C1810] pt-2 border-t border-[#EDE0CC] mt-2">
                                    Informal —{" "}
                                    {f.informal.tipo_pago === "mensual" ? "Mensual" : f.informal.tipo_pago === "hora" ? "Por hora" : "Por día"}
                                  </p>
                                  <DetalleParte p={f.informal} />
                                  <p className="font-medium">Total informal: {formatMoneda(f.informal.total)}</p>
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
