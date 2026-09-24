"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";
import { ESTADO_LABEL, hoyAR, type EventoCalendario, type TipoCalendario } from "@/lib/rrhh-shared";

const TIPOS_CAL: TipoCalendario[] = ["Vacaciones", "Enfermedad", "Motivo Personal"];

const COLOR_TIPO: Record<TipoCalendario, { chip: string; dot: string; ring: string; toggle: string }> = {
  Vacaciones: { chip: "bg-blue-100 text-blue-800 border-blue-300", dot: "bg-blue-500", ring: "ring-blue-500", toggle: "border-blue-300 bg-blue-50 text-blue-800" },
  Enfermedad: { chip: "bg-amber-100 text-amber-800 border-amber-300", dot: "bg-amber-500", ring: "ring-amber-500", toggle: "border-amber-300 bg-amber-50 text-amber-800" },
  "Motivo Personal": { chip: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500", ring: "ring-purple-500", toggle: "border-purple-300 bg-purple-50 text-purple-800" },
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function chipClase(e: EventoCalendario): string {
  const base = `border ${COLOR_TIPO[e.tipo].chip}`;
  return e.estado === "pendiente" ? `${base} border-dashed` : base;
}

interface Props {
  sucursales: string[];
  onVerRegistro: (registroId: number) => void;
}

export default function CalendarioFaltas({ sucursales, onVerRegistro }: Props) {
  const [mes, setMes] = useState(() => hoyAR().slice(0, 7));
  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tiposVisibles, setTiposVisibles] = useState<Set<TipoCalendario>>(new Set(TIPOS_CAL));
  const [sucursal, setSucursal] = useState("Todas");
  const [nombres, setNombres] = useState<string[]>([]);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async (m: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/rrhh/calendario?mes=${m}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { eventos: EventoCalendario[] };
      setEventos(json.eventos);
      setError(null);
    } catch {
      setError("No se pudo cargar el calendario.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(mes);
    setDiaSeleccionado(null);
  }, [mes, cargar]);

  const filtrados = useMemo(
    () =>
      eventos.filter(
        (e) =>
          tiposVisibles.has(e.tipo) &&
          (sucursal === "Todas" || e.sucursal === sucursal) &&
          (nombres.length === 0 || nombres.includes(e.nombre))
      ),
    [eventos, tiposVisibles, sucursal, nombres]
  );

  const porDia = useMemo(() => {
    const map = new Map<string, EventoCalendario[]>();
    for (const e of filtrados) {
      const lista = map.get(e.fecha) ?? [];
      lista.push(e);
      map.set(e.fecha, lista);
    }
    return map;
  }, [filtrados]);

  const totalesPorTipo = useMemo(() => {
    const t: Record<TipoCalendario, number> = { Vacaciones: 0, Enfermedad: 0, "Motivo Personal": 0 };
    for (const e of filtrados) t[e.tipo]++;
    return t;
  }, [filtrados]);

  // Grilla de lunes a domingo, con huecos antes del día 1.
  const [anio, numMes] = mes.split("-").map(Number);
  const diasEnMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(anio, numMes - 1, 1)).getUTCDay() + 6) % 7;
  const celdas: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const hoy = hoyAR();
  const eventosDia = diaSeleccionado ? porDia.get(diaSeleccionado) ?? [] : [];

  function toggleTipo(t: TipoCalendario) {
    setTiposVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Navegación + filtros */}
      <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMes((m) => moverMes(m, -1))}
              className="w-8 h-8 rounded-full border border-[#EDE0CC] text-[#8B6347] hover:border-[#D4A843] hover:text-[#2C1810]"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <h2 className="text-lg font-bold text-[#2C1810] min-w-[160px] text-center">
              {MESES[numMes - 1]} {anio}
            </h2>
            <button
              onClick={() => setMes((m) => moverMes(m, 1))}
              className="w-8 h-8 rounded-full border border-[#EDE0CC] text-[#8B6347] hover:border-[#D4A843] hover:text-[#2C1810]"
              aria-label="Mes siguiente"
            >
              ›
            </button>
            {mes !== hoy.slice(0, 7) && (
              <button
                onClick={() => setMes(hoy.slice(0, 7))}
                className="text-xs text-[#8B6347] hover:text-[#2C1810] underline ml-1"
              >
                Hoy
              </button>
            )}
          </div>
          <button
            onClick={() => cargar(mes)}
            className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
          >
            ↻ Actualizar
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <EmpleadoMultiSelect value={nombres} onChange={setNombres} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
            <select
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            >
              {sucursales.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {TIPOS_CAL.map((t) => {
              const activo = tiposVisibles.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTipo(t)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    activo ? COLOR_TIPO[t].toggle : "border-[#EDE0CC] bg-white text-[#B89070] line-through"
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${COLOR_TIPO[t].dot} ${activo ? "" : "opacity-40"}`} />
                  {t}: {totalesPorTipo[t]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-[#B89070]">
          Solo se muestran las faltas avisadas y las vacaciones. Las que todavía no se aprobaron dicen &quot;Pendiente&quot;; las rechazadas no aparecen.
          Los números cuentan días-persona del mes.
        </p>
      </div>

      {/* Grilla */}
      <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden relative">
        {error && <div className="text-center py-10 text-red-500 text-sm">{error}</div>}
        {cargando && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-7 border-b border-[#EDE0CC] bg-[#FAF7F2]">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[11px] sm:text-xs font-semibold text-[#8B6347] uppercase tracking-wide py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((dia, i) => {
            if (!dia) return <div key={`v${i}`} className="border-b border-r border-[#F3EADB] bg-[#FDFAF6] min-h-[56px] sm:min-h-[104px]" />;
            const lista = porDia.get(dia) ?? [];
            const esHoy = dia === hoy;
            const seleccionado = dia === diaSeleccionado;
            const finde = i % 7 >= 5;
            return (
              <button
                key={dia}
                onClick={() => setDiaSeleccionado(seleccionado ? null : dia)}
                className={`text-left border-b border-r border-[#F3EADB] min-h-[56px] sm:min-h-[104px] p-1 sm:p-1.5 flex flex-col gap-1 transition-colors ${
                  seleccionado ? "bg-[#FDF6E3] ring-2 ring-inset ring-[#D4A843]" : finde ? "bg-[#FDFAF6] hover:bg-[#FAF3E6]" : "hover:bg-[#FAF7F2]"
                }`}
              >
                <span
                  className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                    esHoy ? "bg-[#2C1810] text-white" : "text-[#2C1810]"
                  }`}
                >
                  {Number(dia.slice(8))}
                </span>

                {/* Celular: puntitos por tipo */}
                {lista.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {lista.slice(0, 6).map((e, j) => (
                      <span key={j} className={`w-1.5 h-1.5 rounded-full ${e.estado === "pendiente" ? `bg-white ring-1 ring-inset ${COLOR_TIPO[e.tipo].ring}` : COLOR_TIPO[e.tipo].dot}`} />
                    ))}
                    {lista.length > 6 && <span className="text-[9px] leading-none text-[#8B6347]">+{lista.length - 6}</span>}
                  </div>
                )}

                {/* Desktop: nombres */}
                <div className="hidden sm:flex flex-col gap-0.5 w-full">
                  {lista.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      title={`${e.nombre} — ${e.tipo} (${ESTADO_LABEL[e.estado]})`}
                      className={`text-[11px] leading-tight px-1.5 py-0.5 rounded flex flex-col min-w-0 ${chipClase(e)}`}
                    >
                      <span className="truncate">{e.nombre}</span>
                      {e.estado === "pendiente" && (
                        <span className="text-[10px] font-bold uppercase tracking-wide">⏳ Pendiente</span>
                      )}
                    </span>
                  ))}
                  {lista.length > 3 && (
                    <span className="text-[11px] text-[#8B6347] font-medium px-1">+{lista.length - 3} más</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle del día */}
      {diaSeleccionado && (
        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#2C1810] text-sm">
              {new Date(`${diaSeleccionado}T12:00:00Z`).toLocaleDateString("es-AR", {
                timeZone: "UTC",
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              <span className="text-[#8B6347] font-normal"> · {eventosDia.length} {eventosDia.length === 1 ? "falta" : "faltas"}</span>
            </h3>
            <button onClick={() => setDiaSeleccionado(null)} className="text-[#B89070] hover:text-[#2C1810] text-lg leading-none" aria-label="Cerrar">
              ✕
            </button>
          </div>
          {eventosDia.length === 0 ? (
            <p className="text-sm text-[#8B6347]">Nadie faltó este día (con los filtros actuales).</p>
          ) : (
            <ul className="divide-y divide-[#F3EADB]">
              {eventosDia.map((e, j) => (
                <li key={j} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_TIPO[e.tipo].dot}`} />
                    <span className="text-sm font-medium text-[#2C1810] truncate">{e.nombre}</span>
                    {e.sucursal && <span className="text-xs text-[#8B6347]">{e.sucursal}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${chipClase(e)}`}>
                      {e.tipo}
                      {e.estado !== "informativo" ? ` · ${ESTADO_LABEL[e.estado]}` : ""}
                    </span>
                    <button
                      onClick={() => onVerRegistro(e.registroId)}
                      className="text-xs text-[#D4A843] hover:text-[#2C1810] font-medium underline"
                    >
                      Ver detalle
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
