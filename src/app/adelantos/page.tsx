"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";

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
  created_at: number;
}

interface TopeAdelanto {
  base: number | null;
  limite: number | null;
  usado: number;
  disponible: number | null;
  excedido: boolean;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function hoyISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
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

  async function agregarAdelanto(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAviso("");
    if (!nuevoEmpleadoId) {
      setError("Elegí un empleado");
      return;
    }
    const monto = Number(nuevoMonto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    setGuardando(true);
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empleadoId: Number(nuevoEmpleadoId), fecha: nuevaFecha, monto, nota: nuevaNota }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el adelanto");
      return;
    }
    const data = (await res.json()) as Adelanto & { advertencia: string | null };
    if (data.advertencia) setAviso(data.advertencia);
    setNuevoMonto("");
    setNuevaNota("");
    fetchAdelantos();
  }

  async function borrarAdelanto(id: number) {
    if (!confirm("¿Borrar este adelanto?")) return;
    await fetch(`/api/adelantos/${id}`, { method: "DELETE" });
    fetchAdelantos();
  }

  const total = adelantos.reduce((acc, a) => acc + a.monto, 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Adelantos" />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Adelantos</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            Registrá los adelantos de sueldo pagados a cada empleado — se descuentan automáticamente del total en Liquidación.
          </p>
        </div>

        <form onSubmit={agregarAdelanto} className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
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
            <label className="text-xs text-[#8B6347] font-medium">Fecha</label>
            <input
              type="date"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Monto</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={nuevoMonto}
              onChange={(e) => setNuevoMonto(e.target.value)}
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

          {tope && (
            <p className={`text-xs w-full ${tope.limite === null ? "text-[#B89070] italic" : tope.excedido ? "text-red-600 font-medium" : "text-[#8B6347]"}`}>
              {tope.limite === null
                ? "Este empleado no tiene sueldo mensual ni sueldo estimado cargado en Empleados — no se puede calcular el tope del 20%."
                : `Tope del mes (20% del sueldo): ${formatMoneda(tope.limite)} · ya lleva ${formatMoneda(tope.usado)}${
                    tope.excedido ? " — ya superado" : ` · disponible ${formatMoneda(tope.disponible ?? 0)}`
                  }`}
            </p>
          )}
          {error && <p className="text-xs text-red-500 w-full">{error}</p>}
          {aviso && <p className="text-xs text-amber-600 w-full">⚠ {aviso}</p>}
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
                    <td className="px-4 py-3 text-[#5C3D2E]" data-label="Fecha">{a.fecha}</td>
                    <td className="px-4 py-3 font-mono text-[#2C1810]" data-label="Monto">{formatMoneda(a.monto)}</td>
                    <td className="px-4 py-3 text-[#8B6347]" data-label="Nota">{a.nota || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => borrarAdelanto(a.id)}
                        className="text-xs text-[#B89070] hover:text-red-500 underline"
                      >
                        Borrar
                      </button>
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
