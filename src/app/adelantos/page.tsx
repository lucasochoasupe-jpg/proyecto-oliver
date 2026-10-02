"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import PedidosWhatsApp from "./PedidosWhatsApp";

interface Empleado {
  id: number;
  nombre: string;
  activo: number;
}

interface Adelanto {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  fecha: string;
  monto: number;
  nota: string | null;
  grupo_id: number | null;
  cuota_numero: number | null;
  cuota_total: number | null;
  created_at: number;
}

interface TopeAdelanto {
  base: number | null;
  limite: number | null;
  usado: number;
  disponible: number | null;
  excedido: boolean;
}

interface CuotaForm {
  fecha: string;
  monto: string;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function hoyISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
}

function addMesesISO(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + meses, d)).toISOString().slice(0, 10);
}

// Reparte el monto total en `cantidad` cuotas mensuales consecutivas a partir
// de `fechaInicio` — montos iguales salvo la última, que se lleva el
// redondeo para que la suma cierre exacto con el total pedido.
function distribuirCuotas(montoTotal: number, cantidad: number, fechaInicio: string): CuotaForm[] {
  const base = Math.floor(montoTotal / cantidad);
  return Array.from({ length: cantidad }, (_, i) => {
    const esUltima = i === cantidad - 1;
    const monto = esUltima ? montoTotal - base * (cantidad - 1) : base;
    return { fecha: addMesesISO(fechaInicio, i), monto: String(monto) };
  });
}

export default function AdelantosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [loading, setLoading] = useState(true);
  const [empleadoFiltro, setEmpleadoFiltro] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [nuevoEmpleadoId, setNuevoEmpleadoId] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState(hoyISO());
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [dividirCuotas, setDividirCuotas] = useState(false);
  const [cantidadCuotas, setCantidadCuotas] = useState(2);
  const [cuotas, setCuotas] = useState<CuotaForm[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [tope, setTope] = useState<TopeAdelanto | null>(null);

  const fetchAdelantos = useCallback(async () => {
    const params = new URLSearchParams();
    if (empleadoFiltro) params.set("empleadoId", empleadoFiltro);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const res = await fetch(`/api/adelantos?${params}`);
    setAdelantos((await res.json()) as Adelanto[]);
    setLoading(false);
  }, [empleadoFiltro, desde, hasta]);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data: Empleado[]) => setEmpleados(data.filter((e) => e.activo)));
  }, []);

  useEffect(() => {
    fetchAdelantos();
  }, [fetchAdelantos]);

  useEffect(() => {
    if (!nuevoEmpleadoId || !nuevaFecha) {
      setTope(null);
      return;
    }
    fetch(`/api/adelantos/tope?empleadoId=${nuevoEmpleadoId}&fecha=${nuevaFecha}`)
      .then((r) => r.json())
      .then((data: TopeAdelanto) => setTope(data));
  }, [nuevoEmpleadoId, nuevaFecha]);

  // Recalcula el reparto en cuotas cada vez que cambia el monto total, la
  // fecha de arranque o la cantidad de cuotas — mientras el usuario no haya
  // tocado a mano ningún renglón (si ya editó uno, no lo pisamos).
  function recalcularCuotas(montoStr: string, fecha: string, cantidad: number) {
    const monto = Number(montoStr);
    if (Number.isFinite(monto) && monto > 0 && cantidad >= 2) {
      setCuotas(distribuirCuotas(monto, cantidad, fecha));
    } else {
      setCuotas([]);
    }
  }

  function onCambiaMontoOFecha(montoStr: string, fecha: string) {
    setNuevoMonto(montoStr);
    setNuevaFecha(fecha);
    if (dividirCuotas) recalcularCuotas(montoStr, fecha, cantidadCuotas);
  }

  function onToggleDividir(activar: boolean) {
    setDividirCuotas(activar);
    if (activar) recalcularCuotas(nuevoMonto, nuevaFecha, cantidadCuotas);
  }

  function onCambiaCantidadCuotas(cantidad: number) {
    setCantidadCuotas(cantidad);
    recalcularCuotas(nuevoMonto, nuevaFecha, cantidad);
  }

  function actualizarCuota(i: number, patch: Partial<CuotaForm>) {
    setCuotas((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  const totalCuotas = cuotas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);

  async function agregarAdelanto(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAviso("");
    if (!nuevoEmpleadoId) {
      setError("Elegí un empleado");
      return;
    }

    let body: Record<string, unknown>;
    if (dividirCuotas) {
      if (cuotas.length === 0 || cuotas.some((c) => !c.fecha || !(Number(c.monto) > 0))) {
        setError("Completá fecha y monto de todas las cuotas");
        return;
      }
      body = {
        empleadoId: Number(nuevoEmpleadoId),
        nota: nuevaNota,
        cuotas: cuotas.map((c) => ({ fecha: c.fecha, monto: Number(c.monto) })),
      };
    } else {
      const monto = Number(nuevoMonto);
      if (!Number.isFinite(monto) || monto <= 0) {
        setError("El monto debe ser mayor a 0");
        return;
      }
      body = { empleadoId: Number(nuevoEmpleadoId), nota: nuevaNota, fecha: nuevaFecha, monto };
    }

    setGuardando(true);
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el adelanto");
      return;
    }
    const data = (await res.json()) as { advertencia: string | null };
    if (data.advertencia) setAviso(data.advertencia);
    setNuevoMonto("");
    setNuevaNota("");
    setDividirCuotas(false);
    setCuotas([]);
    fetchAdelantos();
  }

  async function borrarAdelanto(a: Adelanto, todoElGrupo: boolean) {
    const mensaje =
      todoElGrupo && a.cuota_total
        ? `¿Borrar las ${a.cuota_total} cuotas de este adelanto?`
        : "¿Borrar esta cuota/adelanto?";
    if (!confirm(mensaje)) return;
    const params = todoElGrupo ? "?grupo=true" : "";
    await fetch(`/api/adelantos/${a.id}${params}`, { method: "DELETE" });
    fetchAdelantos();
  }

  const total = adelantos.reduce((acc, a) => acc + a.monto, 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Adelantos" />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <PedidosWhatsApp onCambio={fetchAdelantos} />
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Adelantos</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            Registrá los adelantos de sueldo pagados a cada empleado — se descuentan automáticamente en Liquidación
            (primero de la parte informal si la tiene, y el resto de la blanca).
          </p>
        </div>

        <form onSubmit={agregarAdelanto} className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
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
              <label className="text-xs text-[#8B6347] font-medium">{dividirCuotas ? "Fecha 1ª cuota" : "Fecha"}</label>
              <input
                type="date"
                value={nuevaFecha}
                onChange={(e) => onCambiaMontoOFecha(nuevoMonto, e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">{dividirCuotas ? "Monto total" : "Monto"}</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={nuevoMonto}
                onChange={(e) => onCambiaMontoOFecha(e.target.value, nuevaFecha)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs text-[#8B6347] font-medium">Nota (opcional)</label>
              <input
                type="text"
                placeholder="Ej: adelanto en efectivo"
                value={nuevaNota}
                onChange={(e) => setNuevaNota(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-full"
              />
            </div>
            <button
              type="submit"
              disabled={guardando}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 px-4 py-2 rounded-full transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#8B6347] font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dividirCuotas}
              onChange={(e) => onToggleDividir(e.target.checked)}
              className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
            />
            Dividir el descuento en cuotas
          </label>

          {dividirCuotas && (
            <div className="border border-[#EDE0CC] rounded-lg p-3 space-y-2 bg-[#FAF7F2]">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#8B6347] font-medium">Cantidad de cuotas</label>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={cantidadCuotas}
                  onChange={(e) => onCambiaCantidadCuotas(Math.max(2, Number(e.target.value) || 2))}
                  className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-20"
                />
              </div>
              <div className="space-y-1">
                {cuotas.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-[#B89070] w-16">Cuota {i + 1}/{cantidadCuotas}</span>
                    <input
                      type="date"
                      value={c.fecha}
                      onChange={(e) => actualizarCuota(i, { fecha: e.target.value })}
                      className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={c.monto}
                      onChange={(e) => actualizarCuota(i, { monto: e.target.value })}
                      className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8B6347]">
                Suma de cuotas: <span className="font-semibold">{formatMoneda(totalCuotas)}</span>
                {nuevoMonto && Number(nuevoMonto) !== totalCuotas && (
                  <span className="text-amber-600"> — no coincide con el monto total ({formatMoneda(Number(nuevoMonto) || 0)})</span>
                )}
              </p>
            </div>
          )}

          {tope && (
            <p className={`text-xs ${tope.limite === null ? "text-[#B89070] italic" : tope.excedido ? "text-red-600 font-medium" : "text-[#8B6347]"}`}>
              {tope.limite === null
                ? "Este empleado no tiene sueldo mensual ni sueldo estimado cargado en Empleados — no se puede calcular el tope del 20%."
                : `Tope del mes (20% del sueldo): ${formatMoneda(tope.limite)} · ya lleva ${formatMoneda(tope.usado)}${
                    tope.excedido ? " — ya superado" : ` · disponible ${formatMoneda(tope.disponible ?? 0)}`
                  }`}
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {aviso && <p className="text-xs text-amber-600">⚠ {aviso}</p>}
        </form>

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Empleado</label>
            <select
              value={empleadoFiltro}
              onChange={(e) => setEmpleadoFiltro(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-48"
            >
              <option value="">Todos</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
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
          <span className="text-sm text-[#8B6347] ml-auto">
            Total: <span className="font-semibold text-[#2C1810]">{formatMoneda(total)}</span>
          </span>
        </div>

        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          )}

          {!loading && adelantos.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">Sin adelantos registrados en este filtro.</div>
          )}

          {!loading && adelantos.length > 0 && (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Monto</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Nota</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {adelantos.map((a, i) => (
                  <tr
                    key={a.id}
                    className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}
                  >
                    <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Empleado">{a.empleado_nombre}</td>
                    <td className="px-4 py-3 text-[#5C3D2E]" data-label="Fecha">
                      {a.fecha}
                      {a.cuota_total && a.cuota_total > 1 && (
                        <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          Cuota {a.cuota_numero}/{a.cuota_total}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#2C1810]" data-label="Monto">{formatMoneda(a.monto)}</td>
                    <td className="px-4 py-3 text-[#8B6347]" data-label="Nota">{a.nota || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => borrarAdelanto(a, false)}
                        className="text-xs text-[#B89070] hover:text-red-500 underline"
                      >
                        Borrar
                      </button>
                      {a.cuota_total && a.cuota_total > 1 && (
                        <button
                          onClick={() => borrarAdelanto(a, true)}
                          className="ml-3 text-xs text-[#B89070] hover:text-red-500 underline"
                        >
                          Borrar todas ({a.cuota_total})
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
