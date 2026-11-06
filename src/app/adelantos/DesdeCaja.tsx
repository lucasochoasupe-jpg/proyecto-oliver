"use client";

import { useCallback, useEffect, useState } from "react";
import Pildoras from "@/components/Pildoras";

type Estado = "pendiente" | "cargado" | "descartado";

interface AdelantoCaja {
  movimiento_id: number;
  fecha: string;
  nombre: string;
  cuenta: string;
  monto: number;
  nota: string | null;
  estado: Estado;
  adelanto_id: number | null;
  empleado_id: number | null;
  empleado_nombre: string | null;
  candidatos: { id: number; nombre: string }[];
}

interface Empleado {
  id: number;
  nombre: string;
  activo?: number | boolean;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function mesActual(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);
}

function mesesRecientes(): { value: string; label: string }[] {
  const [y, m] = mesActual().split("-").map(Number);
  return [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

// Pagos de "Sueldos" de la planilla de Caja hechos dentro del mismo mes al
// que corresponden (= adelantos). Cada uno se confirma con su empleado; el
// cobro final del sueldo (pagado a principio del mes siguiente) no aparece.
export default function DesdeCaja({ empleados, onCambio }: { empleados: Empleado[]; onCambio?: () => void }) {
  const [mes, setMes] = useState(mesActual());
  const [filas, setFilas] = useState<AdelantoCaja[]>([]);
  const [elegidos, setElegidos] = useState<Record<number, number>>({});
  const [ver, setVer] = useState<Estado>("pendiente");
  const [procesando, setProcesando] = useState<number | "todos" | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/adelantos/caja?mes=${mes}`);
    if (res.ok) setFilas((await res.json()) as AdelantoCaja[]);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const empleadoDe = (f: AdelantoCaja) => elegidos[f.movimiento_id] ?? f.empleado_id ?? 0;

  async function enviar(body: object): Promise<boolean> {
    const res = await fetch("/api/adelantos/caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar");
    return res.ok;
  }

  async function cargarUno(f: AdelantoCaja) {
    setError("");
    setProcesando(f.movimiento_id);
    await enviar({ movimientoId: f.movimiento_id, empleadoId: empleadoDe(f) });
    setProcesando(null);
    await cargar();
    onCambio?.();
  }

  async function cargarTodos(lista: AdelantoCaja[]) {
    setError("");
    setProcesando("todos");
    for (const f of lista) await enviar({ movimientoId: f.movimiento_id, empleadoId: empleadoDe(f) });
    setProcesando(null);
    await cargar();
    onCambio?.();
  }

  async function descartar(f: AdelantoCaja, noEsAdelanto: boolean) {
    setError("");
    setProcesando(f.movimiento_id);
    await enviar({ movimientoId: f.movimiento_id, noEsAdelanto });
    setProcesando(null);
    cargar();
  }

  const cuenta = (e: Estado) => filas.filter((f) => f.estado === e).length;
  const visibles = filas.filter((f) => f.estado === ver);
  const listos = visibles.filter((f) => f.estado === "pendiente" && empleadoDe(f));
  const totalVisibles = visibles.reduce((s, f) => s + f.monto, 0);
  const activos = empleados.filter((e) => e.activo === undefined || !!e.activo);

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#2C1810]">
          Adelantos en la planilla de Caja
          {cuenta("pendiente") > 0 && (
            <span className="ml-2 text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
              {cuenta("pendiente")} para cargar
            </span>
          )}
        </h2>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm text-[#2C1810]"
        >
          {mesesRecientes().map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-[#8B6347]">
        Pagos de &quot;Sueldos&quot; de la planilla hechos dentro del mismo mes al que corresponden. El cobro final del sueldo (pagado a
        principio del mes siguiente) no aparece acá. Confirmá el empleado y cargalo: se descuenta en la Liquidación.
      </p>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <Pildoras
          opciones={[
            { value: "pendiente", label: "Para cargar", cantidad: cuenta("pendiente") },
            { value: "cargado", label: "Ya cargados", cantidad: cuenta("cargado") },
            { value: "descartado", label: "No son adelantos", cantidad: cuenta("descartado") },
          ]}
          valor={ver}
          onChange={setVer}
        />
        {ver === "pendiente" && listos.length > 1 && (
          <button onClick={() => cargarTodos(listos)} disabled={procesando !== null} className="btn btn-primary">
            {procesando === "todos" ? "Cargando…" : `Cargar los ${listos.length} con empleado`}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {visibles.length === 0 ? (
        <p className="text-sm text-[#B89070]">
          {ver === "pendiente" ? "No hay adelantos de la planilla para cargar en este mes." : "No hay ninguno."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[#F3EADB]">
            {visibles.map((f) => (
              <li key={f.movimiento_id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-48 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-[#B89070] tabular-nums">{fechaCorta(f.fecha)}</span>
                    <span className="font-medium text-[#2C1810]">{f.nombre.trim()}</span>
                    <span className="font-semibold tabular-nums text-[#2C1810]">{formatMoneda(f.monto)}</span>
                  </div>
                  <p className="text-xs text-[#8B6347]">
                    {f.cuenta}
                    {f.nota ? ` · ${f.nota}` : ""}
                  </p>
                </div>

                {f.estado === "pendiente" ? (
                  <>
                    <select
                      value={empleadoDe(f)}
                      onChange={(e) => setElegidos((p) => ({ ...p, [f.movimiento_id]: Number(e.target.value) }))}
                      className={`border rounded-lg px-2 py-1 text-sm max-w-60 ${
                        empleadoDe(f) ? "border-[#EDE0CC] text-[#2C1810]" : "border-amber-300 bg-amber-50 text-amber-800"
                      }`}
                    >
                      <option value={0}>{f.candidatos.length > 1 ? "¿Cuál de estos?" : "Elegí el empleado…"}</option>
                      {f.candidatos.length > 1 && (
                        <optgroup label="Posibles">
                          {f.candidatos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Todos">
                        {activos.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombre}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => cargarUno(f)}
                        disabled={procesando !== null || !empleadoDe(f)}
                        className="btn btn-secondary !text-xs !px-3"
                      >
                        {procesando === f.movimiento_id ? "Cargando…" : "Cargar adelanto"}
                      </button>
                      <button
                        onClick={() => descartar(f, true)}
                        disabled={procesando !== null}
                        className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
                      >
                        No es adelanto
                      </button>
                    </div>
                  </>
                ) : f.estado === "cargado" ? (
                  <span className="text-sm text-emerald-700">✓ {f.empleado_nombre ?? "Cargado"}</span>
                ) : (
                  <button
                    onClick={() => descartar(f, false)}
                    disabled={procesando !== null}
                    className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
                  >
                    Volver a mostrar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#8B6347] text-right">
            Total: <span className="font-semibold text-[#2C1810] tabular-nums">{formatMoneda(totalVisibles)}</span>
          </p>
        </>
      )}
    </div>
  );
}
