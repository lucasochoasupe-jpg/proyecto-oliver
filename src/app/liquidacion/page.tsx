"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import ParitariasPendientes from "@/components/ParitariasPendientes";
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
  dias_sin_goce: number;
  horas_sin_goce: number;
  descuento_sin_goce: number;
  dias_justificados_pagos: number;
  horas_justificadas_pagas: number;
  monto_ausencia_justificada: number;
  dias_feriado: number;
  dias_trabajados: number | null;
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
  aporte_sepelio: number;
  aporte_colonia: number;
  aporte_os_jornada_reducida: number;
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
  adelantos_blanco: number;
  adelantos_informal: number;
  legal: AportesLegales | null;
  total_blanco: number;
  informal: ParteDetalle | null;
  horas_extra: { horas: number; valor_hora: number | null; monto: number };
  escala: { categoria: string; vigente_desde: string; basico: number; no_remunerativo: number; fraccion_jornada: number } | null;
  modo_informal: "adicional" | "complemento";
  informal_pactado: number;
  total_informal: number;
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
              <p>
                Ausencias sin aviso: {p.dias_ausencia} día{p.dias_ausencia === 1 ? "" : "s"} — no genera jornal ese día
              </p>
              {p.dias_ausencia_justificada > 0 && (
                <p className="text-emerald-700">
                  ✓ Ausencias justificadas con goce: {p.dias_ausencia_justificada} día
                  {p.dias_ausencia_justificada === 1 ? "" : "s"}
                </p>
              )}
              {p.dias_feriado > 0 && (
                <p className="text-emerald-700">
                  ✓ Feriados no trabajados: {p.dias_feriado} día{p.dias_feriado === 1 ? "" : "s"} — no cuentan como falta
                </p>
              )}
              {p.monto_ausencia_justificada > 0 && (
                <p className="text-emerald-700">
                  Se pagan las horas de esos turnos ({formatHoras(p.horas_justificadas_pagas)} ×{" "}
                  {p.valor_hora ? formatMoneda(p.valor_hora) : "—"} = + {formatMoneda(p.monto_ausencia_justificada)})
                </p>
              )}
              {p.dias_sin_goce > 0 && (
                <p className="text-sky-700">
                  Motivo personal sin goce: {p.dias_sin_goce} día{p.dias_sin_goce === 1 ? "" : "s"} — no genera jornal ese día
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
          {p.dias_feriado > 0 && (
            <p className="text-emerald-700">
              ✓ Feriados no trabajados: {p.dias_feriado} día{p.dias_feriado === 1 ? "" : "s"} — no se descuentan ni afectan el presentismo
            </p>
          )}
          {p.dias_sin_goce > 0 && (
            <p className="text-sky-700">
              Motivo personal sin goce: {p.dias_sin_goce} día{p.dias_sin_goce === 1 ? "" : "s"}
              {p.horas_sin_goce > 0 && ` (${formatHoras(p.horas_sin_goce)})`}
              {p.descuento_sin_goce > 0 && ` (- ${formatMoneda(p.descuento_sin_goce)})`} — justificada, no pierde presentismo
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
        {legal.aporte_sindical > 0 && ` · sindical ${formatMoneda(legal.aporte_sindical)}`}
        {legal.aporte_sepelio > 0 && ` · sepelio ${formatMoneda(legal.aporte_sepelio)}`}
        {legal.aporte_colonia > 0 && ` · colonia de vacaciones ${formatMoneda(legal.aporte_colonia)}`}
        {legal.aporte_os_jornada_reducida > 0 && ` · obra social jornada reducida ${formatMoneda(legal.aporte_os_jornada_reducida)}`} — total -{" "}
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

// ── Aguinaldo ─────────────────────────────────────────────────────────────

interface AguinaldoParte {
  mejor_remuneracion: number;
  mes_mejor_remuneracion: string | null;
  meses_computados: number;
}

interface AguinaldoEmpleado {
  empleado_id: number;
  nombre: string;
  blanco: AguinaldoParte | null;
  aguinaldo_blanco: number;
  legal: AportesLegales | null;
  neto_blanco: number;
  informal: AguinaldoParte | null;
  aguinaldo_informal: number;
  total_neto: number;
  advertencias: string[];
}

interface AguinaldoApiResponse {
  anio: number;
  numero: 1 | 2;
  desde: string;
  hasta: string;
  filas: AguinaldoEmpleado[];
}

function mesLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1]} ${y}`;
}

export default function LiquidacionPage() {
  const [modo, setModo] = useState<"mensual" | "aguinaldo">("mensual");

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Liquidación de sueldos" />

      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="inline-flex rounded-full border border-[#EDE0CC] bg-white p-1">
          <button
            onClick={() => setModo("mensual")}
            className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
              modo === "mensual" ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setModo("aguinaldo")}
            className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
              modo === "aguinaldo" ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
            }`}
          >
            Aguinaldo (SAC)
          </button>
        </div>
      </div>

      {modo === "mensual" ? <LiquidacionMensual /> : <LiquidacionAguinaldo />}
    </div>
  );
}

function LiquidacionMensual() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalRecibos, setModalRecibos] = useState(false);
  const [seleccionRecibos, setSeleccionRecibos] = useState<Set<string>>(new Set());
  const [busquedaRecibos, setBusquedaRecibos] = useState("");

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

  function abrirModalRecibos() {
    setSeleccionRecibos(new Set(filas.map((f) => f.nombre)));
    setBusquedaRecibos("");
    setModalRecibos(true);
  }

  function toggleRecibo(nombre: string) {
    setSeleccionRecibos((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  // Selecciona/deselecciona solo los empleados visibles con la búsqueda
  // actual, no la lista completa — así el botón sirve para elegir "todos los
  // que coinciden con la búsqueda" sin perder la selección de los demás.
  function toggleTodosRecibos(visibles: LiquidacionEmpleado[]) {
    const todosVisiblesSeleccionados = visibles.every((f) => seleccionRecibos.has(f.nombre));
    setSeleccionRecibos((prev) => {
      const next = new Set(prev);
      for (const f of visibles) {
        if (todosVisiblesSeleccionados) next.delete(f.nombre);
        else next.add(f.nombre);
      }
      return next;
    });
  }

  function descargarRecibosSeleccionados() {
    if (seleccionRecibos.size === 0) return;
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    params.set("nombres", Array.from(seleccionRecibos).join(","));
    window.location.href = `/api/liquidacion/recibos-zip?${params.toString()}`;
    setModalRecibos(false);
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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <ParitariasPendientes />
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
          <button
            onClick={abrirModalRecibos}
            disabled={filas.length === 0}
            title="Elegí a quién generarle el recibo y descargá un .zip"
            className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
          >
            ↓ Recibos masivos
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
                  f.descuento_sin_goce +
                  f.adelantos +
                  (f.legal?.total_aportes_empleado ?? 0) +
                  (f.informal?.descuento_tardanza ?? 0) +
                  (f.informal?.descuento_ausencia ?? 0) +
                  (f.informal?.descuento_sin_goce ?? 0);
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
                        {(f.informal || f.horas_extra.monto > 0) && (
                          <div className="text-[10px] font-normal text-[#8B6347] mt-0.5">
                            Blanco {formatMoneda(f.total_blanco)} · Informal {formatMoneda(f.total_informal)}
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
                              <p className="text-red-600">
                                Adelantos en el período: - {formatMoneda(f.adelantos)}
                                {f.adelantos_informal > 0 && f.adelantos_blanco > 0 && (
                                  <> (informal - {formatMoneda(f.adelantos_informal)} · blanco - {formatMoneda(f.adelantos_blanco)})</>
                                )}
                                {f.adelantos_informal > 0 && f.adelantos_blanco === 0 && " (descontado de la parte informal)"}
                              </p>
                            )}
                            {(f.informal || f.horas_extra.monto > 0) && <p className="font-semibold text-[#2C1810]">Blanco</p>}
                            {f.escala && (
                              <p className="text-sky-800">
                                Sueldo según escala: {f.escala.categoria} (vigente desde {f.escala.vigente_desde.slice(5)}/
                                {f.escala.vigente_desde.slice(0, 4)}) {formatMoneda(f.escala.basico)}
                                {f.escala.fraccion_jornada !== 1 &&
                                  ` × ${Math.round(f.escala.fraccion_jornada * 10000) / 100}% de jornada = ${formatMoneda(f.escala.basico * f.escala.fraccion_jornada)}`}
                              </p>
                            )}
                            <DetalleParte p={{ ...f, total: f.total_blanco }} />
                            {f.legal && <DetalleLegal legal={f.legal} />}
                            {(f.informal || f.horas_extra.monto > 0) && (
                              <>
                                <p className="font-semibold text-[#2C1810] pt-2 border-t border-[#EDE0CC] mt-2">
                                  Informal
                                  {f.informal &&
                                    ` — ${f.informal.tipo_pago === "mensual" ? "Mensual" : f.informal.tipo_pago === "hora" ? "Por hora" : "Por día"}`}
                                </p>
                                {f.informal && <DetalleParte p={f.informal} />}
                                {f.informal && f.modo_informal === "complemento" && (
                                  <p className="text-sky-800">
                                    Total pactado {formatMoneda(f.informal_pactado)} − neto del recibo → se paga en informal lo que falta
                                  </p>
                                )}
                                {f.horas_extra.horas > 0 && (
                                  <p>
                                    Horas extra (por encima del turno pactado): {formatHoras(f.horas_extra.horas)}
                                    {f.horas_extra.valor_hora !== null &&
                                      ` × ${formatMoneda(f.horas_extra.valor_hora)} = + ${formatMoneda(f.horas_extra.monto)}`}
                                  </p>
                                )}
                                {f.adelantos_informal > 0 && <p className="text-red-600">Adelantos: - {formatMoneda(f.adelantos_informal)}</p>}
                                <p className="font-medium">Total informal: {formatMoneda(f.total_informal)}</p>
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

      {modalRecibos && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalRecibos(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-bold text-[#2C1810] text-lg">Recibos masivos</h2>
              <button
                onClick={() => setModalRecibos(false)}
                className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-[#8B6347] mb-3">
              Elegí a quién generarle el recibo del período {desde} → {hasta}.
            </p>

            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={busquedaRecibos}
              onChange={(e) => setBusquedaRecibos(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] mb-2"
            />

            {(() => {
              const filasVisibles = filas.filter((f) =>
                f.nombre.toLowerCase().includes(busquedaRecibos.trim().toLowerCase())
              );
              return (
                <>
                  <button
                    onClick={() => toggleTodosRecibos(filasVisibles)}
                    disabled={filasVisibles.length === 0}
                    className="text-xs text-[#8B6347] hover:text-[#2C1810] underline mb-2 self-start disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {filasVisibles.length > 0 && filasVisibles.every((f) => seleccionRecibos.has(f.nombre))
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </button>

                  <div className="flex-1 overflow-y-auto border border-[#EDE0CC] rounded-lg divide-y divide-[#EDE0CC]">
                    {filasVisibles.length === 0 ? (
                      <p className="text-sm text-[#8B6347] italic p-3">Sin coincidencias.</p>
                    ) : (
                      filasVisibles.map((f) => (
                        <label
                          key={f.empleado_id}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#FAF7F2] select-none"
                        >
                          <input
                            type="checkbox"
                            checked={seleccionRecibos.has(f.nombre)}
                            onChange={() => toggleRecibo(f.nombre)}
                            className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                          />
                          <span className="text-sm text-[#2C1810]">{f.nombre}</span>
                          {(f.informal || f.horas_extra.monto > 0) && <span className="text-[10px] text-amber-700">+ informal</span>}
                        </label>
                      ))
                    )}
                  </div>
                </>
              );
            })()}

            <p className="text-xs text-[#B89070] mt-2">{seleccionRecibos.size} seleccionados</p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={descargarRecibosSeleccionados}
                disabled={seleccionRecibos.size === 0}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
              >
                Descargar ZIP
              </button>
              <button
                onClick={() => setModalRecibos(false)}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiquidacionAguinaldo() {
  const hoy = new Date();
  const [data, setData] = useState<AguinaldoApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [numero, setNumero] = useState<1 | 2>(hoy.getMonth() < 6 ? 1 : 2);
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalRecibos, setModalRecibos] = useState(false);
  const [seleccionRecibos, setSeleccionRecibos] = useState<Set<string>>(new Set());
  const [busquedaRecibos, setBusquedaRecibos] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("anio", String(anio));
    params.set("numero", String(numero));
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    const res = await fetch(`/api/aguinaldo?${params}`);
    const json = (await res.json()) as AguinaldoApiResponse;
    setData(json);
    setLoading(false);
  }, [anio, numero, nombresFiltro]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportarExcel() {
    const params = new URLSearchParams();
    params.set("anio", String(anio));
    params.set("numero", String(numero));
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    window.location.href = `/api/aguinaldo/export?${params.toString()}`;
  }

  function abrirModalRecibos() {
    setSeleccionRecibos(new Set(filas.map((f) => f.nombre)));
    setBusquedaRecibos("");
    setModalRecibos(true);
  }

  function toggleRecibo(nombre: string) {
    setSeleccionRecibos((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  function toggleTodosRecibos(visibles: AguinaldoEmpleado[]) {
    const todosVisiblesSeleccionados = visibles.every((f) => seleccionRecibos.has(f.nombre));
    setSeleccionRecibos((prev) => {
      const next = new Set(prev);
      for (const f of visibles) {
        if (todosVisiblesSeleccionados) next.delete(f.nombre);
        else next.add(f.nombre);
      }
      return next;
    });
  }

  function descargarRecibosSeleccionados() {
    if (seleccionRecibos.size === 0) return;
    const params = new URLSearchParams();
    params.set("anio", String(anio));
    params.set("numero", String(numero));
    params.set("nombres", Array.from(seleccionRecibos).join(","));
    window.location.href = `/api/aguinaldo/recibos-zip?${params.toString()}`;
    setModalRecibos(false);
  }

  function descargarRecibo(empleadoId: number) {
    const params = new URLSearchParams();
    params.set("empleadoId", String(empleadoId));
    params.set("anio", String(anio));
    params.set("numero", String(numero));
    window.location.href = `/api/aguinaldo/recibo?${params.toString()}`;
  }

  const filas = data?.filas ?? [];
  const totalPeriodo = filas.reduce((acc, f) => acc + f.total_neto, 0);
  const conAlertas = filas.filter((f) => f.advertencias.length > 0).length;
  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Aguinaldo (S.A.C.)</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            50% de la mejor remuneración bruta del semestre, proporcional a los meses de antigüedad — cálculo interno
            aproximado, no reemplaza el recibo de SAC oficial.
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
          <button
            onClick={abrirModalRecibos}
            disabled={filas.length === 0}
            title="Elegí a quién generarle el recibo de aguinaldo y descargá un .zip"
            className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
          >
            ↓ Recibos masivos
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
            <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Total del semestre</p>
            <p className="text-3xl font-bold text-[#2C1810] mt-1">{formatMoneda(totalPeriodo)}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
            <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Empleados</p>
            <p className="text-3xl font-bold text-[#2C1810] mt-1">{filas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 col-span-2">
            <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium mb-1">Semestre</p>
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
          <label className="text-xs text-[#8B6347] font-medium">Año</label>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#8B6347] font-medium">Semestre</label>
          <select
            value={numero}
            onChange={(e) => setNumero(Number(e.target.value) as 1 | 2)}
            className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
          >
            <option value={1}>1° (enero - junio)</option>
            <option value={2}>2° (julio - diciembre)</option>
          </select>
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
            Ningún empleado activo en este semestre.
          </div>
        )}

        {!loading && filas.length > 0 && (
          <table className="w-full text-sm responsive-table">
            <thead>
              <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Mejor remuneración</th>
                <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Meses</th>
                <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Descuentos</th>
                <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Total neto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const descuentos = f.legal?.total_aportes_empleado ?? 0;
                const meses = f.blanco?.meses_computados ?? f.informal?.meses_computados ?? 0;
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
                      </td>
                      <td className="px-4 py-3 font-mono text-[#8B6347]" data-label="Mejor remuneración">
                        {f.blanco ? (
                          <>
                            {formatMoneda(f.blanco.mejor_remuneracion)}
                            <div className="text-[10px] font-normal text-[#B89070]">
                              {mesLabel(f.blanco.mes_mejor_remuneracion)}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#8B6347]" data-label="Meses">
                        {meses}/6
                      </td>
                      <td className="px-4 py-3 font-mono text-red-500" data-label="Descuentos">
                        {descuentos > 0 ? `- ${formatMoneda(descuentos)}` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#2C1810] font-semibold" data-label="Total neto">
                        {formatMoneda(f.total_neto)}
                        {f.informal && (
                          <div className="text-[10px] font-normal text-[#8B6347] mt-0.5">
                            Blanco {formatMoneda(f.neto_blanco)} · Informal {formatMoneda(f.aguinaldo_informal)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#B89070] text-xs whitespace-nowrap">
                        {f.blanco && (
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
                            {f.blanco && (
                              <>
                                <p className="font-semibold text-[#2C1810]">Blanco</p>
                                <p>
                                  Mejor remuneración bruta ({mesLabel(f.blanco.mes_mejor_remuneracion)}):{" "}
                                  {formatMoneda(f.blanco.mejor_remuneracion)}
                                </p>
                                <p>
                                  Meses computados: {f.blanco.meses_computados}/6 — Aguinaldo bruto:{" "}
                                  {formatMoneda(f.aguinaldo_blanco)}
                                </p>
                                {f.legal && <DetalleLegal legal={f.legal} />}
                                <p className="font-medium">Neto blanco: {formatMoneda(f.neto_blanco)}</p>
                              </>
                            )}
                            {f.informal && (
                              <>
                                <p className="font-semibold text-[#2C1810] pt-2 border-t border-[#EDE0CC] mt-2">
                                  Informal (estimado)
                                </p>
                                <p>Mejor remuneración informal: {formatMoneda(f.informal.mejor_remuneracion)}</p>
                                <p>
                                  Meses computados: {f.informal.meses_computados}/6 — Aguinaldo:{" "}
                                  {formatMoneda(f.aguinaldo_informal)}
                                </p>
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

      {modalRecibos && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalRecibos(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-bold text-[#2C1810] text-lg">Recibos de aguinaldo masivos</h2>
              <button
                onClick={() => setModalRecibos(false)}
                className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-[#8B6347] mb-3">
              Elegí a quién generarle el recibo del {numero}° semestre {anio}.
            </p>

            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={busquedaRecibos}
              onChange={(e) => setBusquedaRecibos(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] mb-2"
            />

            {(() => {
              const filasVisibles = filas.filter((f) =>
                f.nombre.toLowerCase().includes(busquedaRecibos.trim().toLowerCase())
              );
              return (
                <>
                  <button
                    onClick={() => toggleTodosRecibos(filasVisibles)}
                    disabled={filasVisibles.length === 0}
                    className="text-xs text-[#8B6347] hover:text-[#2C1810] underline mb-2 self-start disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {filasVisibles.length > 0 && filasVisibles.every((f) => seleccionRecibos.has(f.nombre))
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </button>

                  <div className="flex-1 overflow-y-auto border border-[#EDE0CC] rounded-lg divide-y divide-[#EDE0CC]">
                    {filasVisibles.length === 0 ? (
                      <p className="text-sm text-[#8B6347] italic p-3">Sin coincidencias.</p>
                    ) : (
                      filasVisibles.map((f) => (
                        <label
                          key={f.empleado_id}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#FAF7F2] select-none"
                        >
                          <input
                            type="checkbox"
                            checked={seleccionRecibos.has(f.nombre)}
                            onChange={() => toggleRecibo(f.nombre)}
                            className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                          />
                          <span className="text-sm text-[#2C1810]">{f.nombre}</span>
                          {f.informal && <span className="text-[10px] text-amber-700">+ informal</span>}
                        </label>
                      ))
                    )}
                  </div>
                </>
              );
            })()}

            <p className="text-xs text-[#B89070] mt-2">{seleccionRecibos.size} seleccionados</p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={descargarRecibosSeleccionados}
                disabled={seleccionRecibos.size === 0}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
              >
                Descargar ZIP
              </button>
              <button
                onClick={() => setModalRecibos(false)}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
