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

function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

// Todos tienen un franco por semana. A quien tiene horario los 7 días, el
// día que no vino puede ser su franco: RRHH confirma "Franco" o "Falta".
// Mientras no se conteste no se descuenta; confirmado el franco de una
// semana, las demás ausencias de esa semana son faltas. Se confirman en
// Asistencia; Liquidación solo muestra el aviso (FrancosAviso).
export default function FrancosPorConfirmar({ desde, hasta, onCambio }: { desde: string; hasta: string; onCambio: () => void }) {
  const [francos, setFrancos] = useState<Franco[]>([]);
  const [verConfirmados, setVerConfirmados] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!desde || !hasta) return;
    const res = await fetch(`/api/liquidacion/francos?desde=${desde}&hasta=${hasta}`);
    if (res.ok) setFrancos((await res.json()) as Franco[]);
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function decidir(f: Franco, decision: "franco" | "falta" | null) {
    const k = `${f.empleado_id}|${f.fecha}`;
    setProcesando(k);
    await fetch("/api/liquidacion/francos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empleadoId: f.empleado_id, fecha: f.fecha, decision }),
    });
    setProcesando(null);
    await cargar();
    onCambio();
  }

  // La primera falta de cada semana (lunes a domingo) de cada empleado.
  async function primeraDeCadaSemana() {
    const vistos = new Set<string>();
    const lote: { empleadoId: number; fecha: string }[] = [];
    for (const f of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const k = `${f.empleado_id}|${lunesDe(f.fecha)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      lote.push({ empleadoId: f.empleado_id, fecha: f.fecha });
    }
    setProcesando("lote");
    await fetch("/api/liquidacion/francos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ francos: lote }),
    });
    setProcesando(null);
    await cargar();
    onCambio();
  }

  const pendientes = francos.filter((f) => f.estado === "pendiente");
  const confirmados = francos.filter((f) => f.estado === "confirmado");
  if (francos.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#2C1810]">
          Francos para confirmar
          {pendientes.length > 0 && (
            <span className="ml-2 text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
              {pendientes.length}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {confirmados.length > 0 && (
            <button onClick={() => setVerConfirmados((v) => !v)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
              {verConfirmados ? "Ocultar" : "Ver"} francos ya confirmados ({confirmados.length})
            </button>
          )}
          {pendientes.length > 0 && (
            <button onClick={primeraDeCadaSemana} disabled={procesando !== null} className="btn btn-secondary !text-xs !px-3">
              {procesando === "lote" ? "Confirmando…" : "Tomar como franco la primera falta de cada semana"}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-[#8B6347]">
        Estos empleados tienen horario los 7 días y no vinieron. ¿Fue su franco de la semana? Mientras no lo confirmes, ese día no se
        descuenta en la Liquidación. Si confirmás el franco, las otras faltas de esa semana sí se descuentan.
      </p>

      {pendientes.length === 0 ? (
        <p className="text-sm text-[#B89070]">No hay francos para confirmar en este período.</p>
      ) : (
        <ul className="divide-y divide-[#F3EADB]">
          {pendientes.map((f) => {
            const k = `${f.empleado_id}|${f.fecha}`;
            return (
              <li key={k} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-[#2C1810]">
                  <span className="font-medium">{f.empleado_nombre}</span>{" "}
                  <span className="text-[#8B6347]">no vino el {fechaLarga(f.fecha)}</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => decidir(f, "franco")} disabled={procesando !== null} className="btn btn-secondary !text-xs !px-3">
                    {procesando === k ? "…" : "Fue franco"}
                  </button>
                  <button
                    onClick={() => decidir(f, "falta")}
                    disabled={procesando !== null}
                    className="btn !text-xs !px-3 bg-white text-red-700 border border-red-200 hover:border-red-500"
                  >
                    Fue falta
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {verConfirmados && confirmados.length > 0 && (
        <ul className="divide-y divide-[#F3EADB] border-t border-[#F3EADB]">
          {confirmados.map((f) => {
            const k = `${f.empleado_id}|${f.fecha}`;
            return (
              <li key={k} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-[#2C1810]">
                  {f.empleado_nombre} <span className="text-emerald-700">· franco el {fechaLarga(f.fecha)}</span>
                </span>
                <button
                  onClick={() => decidir(f, null)}
                  disabled={procesando !== null}
                  className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
                >
                  Deshacer
                </button>
              </li>
            );
          })}
        </ul>
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
