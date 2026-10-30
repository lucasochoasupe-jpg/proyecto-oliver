"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Franco {
  empleado_id: number;
  empleado_nombre: string;
  fecha: string;
  estado: "pendiente" | "confirmado";
}

function lunesDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso: string): string {
  const dia = new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const [, m, d] = iso.split("-");
  return `${dia} ${d}/${m}`;
}

function agruparPorEmpleado(lista: Franco[]): { id: number; nombre: string; dias: Franco[] }[] {
  const m = new Map<number, { id: number; nombre: string; dias: Franco[] }>();
  for (const f of lista) {
    if (!m.has(f.empleado_id)) m.set(f.empleado_id, { id: f.empleado_id, nombre: f.empleado_nombre, dias: [] });
    m.get(f.empleado_id)!.dias.push(f);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Todos tienen un franco por semana. A quien tiene horario los 7 días, el
// día que no vino puede ser su franco: RRHH confirma "Franco" o "Falta".
// Mientras no se conteste no se descuenta; confirmado el franco de una
// semana, las demás ausencias de esa semana son faltas. Se confirman en
// Asistencia; Liquidación solo muestra el aviso (FrancosAviso).
// Cerrado muestra una sola línea; abierto, una fila por empleado con sus
// días como pastillas (al tocar una aparecen Franco / Falta).
export default function FrancosPorConfirmar({ desde, hasta, onCambio }: { desde: string; hasta: string; onCambio: () => void }) {
  const [francos, setFrancos] = useState<Franco[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [verConfirmados, setVerConfirmados] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    if (!desde || !hasta) return;
    const res = await fetch(`/api/liquidacion/francos?desde=${desde}&hasta=${hasta}`);
    if (res.ok) setFrancos((await res.json()) as Franco[]);
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function enviar(body: object) {
    setProcesando(true);
    await fetch("/api/liquidacion/francos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setProcesando(false);
    setElegido(null);
    await cargar();
    onCambio();
  }

  const pendientes = francos.filter((f) => f.estado === "pendiente");
  const confirmados = francos.filter((f) => f.estado === "confirmado");

  // La primera falta de cada semana (lunes a domingo) de cada empleado.
  function primeraDeCadaSemana() {
    const vistos = new Set<string>();
    const lote: { empleadoId: number; fecha: string }[] = [];
    for (const f of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const k = `${f.empleado_id}|${lunesDe(f.fecha)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      lote.push({ empleadoId: f.empleado_id, fecha: f.fecha });
    }
    enviar({ francos: lote });
  }

  if (francos.length === 0) return null;
  const grupos = agruparPorEmpleado(verConfirmados ? confirmados : pendientes);
  const empleadosPendientes = new Set(pendientes.map((f) => f.empleado_id)).size;

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC]">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setAbierto((a) => !a)} className="flex items-center gap-2 text-left group">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`w-4 h-4 text-[#8B6347] transition-transform ${abierto ? "rotate-90" : ""}`}
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span className="text-sm font-semibold text-[#2C1810] group-hover:underline">Francos para confirmar</span>
          {pendientes.length > 0 ? (
            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
              {pendientes.length} días · {empleadosPendientes} empleado{empleadosPendientes === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-xs text-emerald-700">✓ todo confirmado</span>
          )}
        </button>
        {pendientes.length > 0 && (
          <button onClick={primeraDeCadaSemana} disabled={procesando} className="btn btn-secondary !text-xs !px-3">
            {procesando ? "Confirmando…" : "Tomar la primera falta de cada semana como franco"}
          </button>
        )}
      </div>

      {abierto && (
        <div className="border-t border-[#F3EADB] px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#8B6347] max-w-2xl">
              Tienen horario los 7 días y no vinieron. Tocá un día para decir si fue su franco o una falta. Mientras no se confirme, no se
              descuenta en la Liquidación.
            </p>
            {confirmados.length > 0 && (
              <button
                onClick={() => {
                  setVerConfirmados((v) => !v);
                  setElegido(null);
                }}
                className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
              >
                {verConfirmados ? "Ver los que faltan confirmar" : `Ver francos confirmados (${confirmados.length})`}
              </button>
            )}
          </div>

          {grupos.length === 0 ? (
            <p className="text-sm text-[#B89070]">No hay días para confirmar en este período.</p>
          ) : (
            <ul className="divide-y divide-[#F3EADB]">
              {grupos.map((g) => (
                <li key={g.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1.5">
                  <span className="text-sm font-medium text-[#2C1810] sm:w-56 shrink-0 truncate">{g.nombre}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {g.dias.map((f) => {
                      const k = `${f.empleado_id}|${f.fecha}`;
                      const activo = elegido === k;
                      if (activo) {
                        return (
                          <span key={k} className="inline-flex items-center rounded-full border border-[#2C1810] overflow-hidden text-xs">
                            <span className="px-2.5 py-1 bg-[#2C1810] text-white tabular-nums">{fechaCorta(f.fecha)}</span>
                            {f.estado === "pendiente" ? (
                              <>
                                <button
                                  onClick={() => enviar({ empleadoId: f.empleado_id, fecha: f.fecha, decision: "franco" })}
                                  disabled={procesando}
                                  className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-50"
                                >
                                  Franco
                                </button>
                                <button
                                  onClick={() => enviar({ empleadoId: f.empleado_id, fecha: f.fecha, decision: "falta" })}
                                  disabled={procesando}
                                  className="px-2.5 py-1 text-red-700 hover:bg-red-50 border-l border-[#EDE0CC]"
                                >
                                  Falta
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => enviar({ empleadoId: f.empleado_id, fecha: f.fecha, decision: null })}
                                disabled={procesando}
                                className="px-2.5 py-1 text-[#8B6347] hover:bg-[#FAF7F2]"
                              >
                                Deshacer
                              </button>
                            )}
                            <button onClick={() => setElegido(null)} className="px-2 py-1 text-[#B89070] hover:text-[#2C1810]" aria-label="Cerrar">
                              ×
                            </button>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={k}
                          onClick={() => setElegido(k)}
                          className={`rounded-full px-2.5 py-1 text-xs tabular-nums border transition-colors ${
                            f.estado === "confirmado"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:border-emerald-500"
                              : "bg-[#FFFBF3] border-[#EDE0CC] text-[#5C3D2E] hover:border-[#D4A843] hover:text-[#2C1810]"
                          }`}
                        >
                          {fechaCorta(f.fecha)}
                        </button>
                      );
                    })}
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

// Aviso para Liquidación: cuántos días esperan confirmación en Asistencia.
export function FrancosAviso({ desde, hasta }: { desde: string; hasta: string }) {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!desde || !hasta) return;
    fetch(`/api/liquidacion/francos?desde=${desde}&hasta=${hasta}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((f: Franco[]) => setPendientes(f.filter((x) => x.estado === "pendiente").length));
  }, [desde, hasta]);

  if (pendientes === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center justify-between gap-2">
      <span>
        ⚠ Hay {pendientes} día{pendientes === 1 ? "" : "s"} que pueden ser francos sin confirmar en este período: no se descuentan hasta que
        se confirmen.
      </span>
      <Link href="/asistencia" className="btn btn-secondary !text-xs !px-3">
        Confirmar en Asistencia
      </Link>
    </div>
  );
}
