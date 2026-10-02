"use client";

import { useCallback, useEffect, useState } from "react";

interface Tope {
  base: number | null;
  limite: number | null;
  usado: number;
  disponible: number | null;
}

interface Pedido {
  id: number;
  empleado_nombre: string;
  monto: number;
  fecha_pago: string;
  numero_vinculado: number;
  estado: "pendiente" | "aprobado" | "rechazado";
  monto_aprobado: number | null;
  respuesta: string | null;
  created_at: number;
  tope: Tope | null;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function cuando(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Pedidos de adelanto que los empleados hacen por WhatsApp (bot → opción 5).
// Aprobar crea el adelanto con fecha del viernes de entrega; en los dos casos
// se le avisa al empleado por WhatsApp (salvo que se destilde).
export default function PedidosWhatsApp({ onCambio }: { onCambio: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [montos, setMontos] = useState<Record<number, string>>({});
  const [comentarios, setComentarios] = useState<Record<number, string>>({});
  const [notificar, setNotificar] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [verResueltos, setVerResueltos] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/adelantos/pedidos");
    if (res.ok) setPedidos((await res.json()) as Pedido[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function decidir(p: Pedido, decision: "aprobado" | "rechazado") {
    const monto = montos[p.id] !== undefined && montos[p.id] !== "" ? Number(montos[p.id]) : p.monto;
    if (decision === "aprobado" && !(monto > 0)) {
      alert("El monto aprobado tiene que ser mayor a 0");
      return;
    }
    setProcesando(p.id);
    const res = await fetch(`/api/adelantos/pedidos/${p.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, monto, comentario: comentarios[p.id] ?? "", notificar }),
    });
    setProcesando(null);
    if (!res.ok) {
      alert(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar");
      return;
    }
    await cargar();
    if (decision === "aprobado") onCambio();
  }

  const pendientes = pedidos.filter((p) => p.estado === "pendiente");
  const resueltos = pedidos.filter((p) => p.estado !== "pendiente");
  if (pedidos.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#2C1810]">
          📲 Pedidos por WhatsApp
          {pendientes.length > 0 && (
            <span className="ml-2 text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <label className="flex items-center gap-2 text-xs text-[#8B6347]">
          <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} className="h-4 w-4" />
          Avisarle al empleado por WhatsApp
        </label>
      </div>
      <p className="text-xs text-[#8B6347]">Se piden hasta el jueves a las 14 h y se entregan el viernes. Al aprobar se carga el adelanto con la fecha de ese viernes.</p>

      {pendientes.length === 0 ? (
        <p className="text-sm text-[#B89070]">No hay pedidos pendientes.</p>
      ) : (
        <ul className="divide-y divide-[#F3EADB]">
          {pendientes.map((p) => {
            const supera = p.tope?.disponible !== null && p.tope?.disponible !== undefined && p.monto > p.tope.disponible;
            return (
              <li key={p.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-[#2C1810]">{p.empleado_nombre}</span>
                  <span className="font-mono text-[#2C1810]">{formatMoneda(p.monto)}</span>
                  <span className="text-xs text-[#8B6347]">para el viernes {fechaCorta(p.fecha_pago)} · pedido {cuando(p.created_at)}</span>
                </div>
                {!p.numero_vinculado && (
                  <p className="text-xs text-amber-700">⚠ Lo pidió desde un número que no está vinculado a su ficha: verificá que sea esa persona.</p>
                )}
                {p.tope && p.tope.limite !== null && (
                  <p className={`text-xs ${supera ? "text-red-600" : "text-[#8B6347]"}`}>
                    Tope del mes (20%): {formatMoneda(p.tope.limite)} · ya adelantado o pedido: {formatMoneda(p.tope.usado)} · disponible:{" "}
                    {formatMoneda(Math.max(0, p.tope.disponible ?? 0))}
                    {supera && " — este pedido lo supera"}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    placeholder={String(p.monto)}
                    value={montos[p.id] ?? ""}
                    onChange={(e) => setMontos((m) => ({ ...m, [p.id]: e.target.value }))}
                    title="Monto a aprobar (vacío = lo pedido)"
                    className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm font-mono w-32 outline-none focus:border-[#D4A843]"
                  />
                  <input
                    type="text"
                    placeholder="Comentario (opcional)"
                    value={comentarios[p.id] ?? ""}
                    onChange={(e) => setComentarios((c) => ({ ...c, [p.id]: e.target.value }))}
                    className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm flex-1 min-w-[10rem] outline-none focus:border-[#D4A843]"
                  />
                  <button
                    onClick={() => decidir(p, "aprobado")}
                    disabled={procesando === p.id}
                    className="text-xs text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-full font-medium"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => decidir(p, "rechazado")}
                    disabled={procesando === p.id}
                    className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-full font-medium"
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {resueltos.length > 0 && (
        <div className="pt-2 border-t border-[#F0E4D8]">
          <button onClick={() => setVerResueltos((v) => !v)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
            {verResueltos ? "Ocultar" : "Ver"} resueltos de los últimos 30 días ({resueltos.length})
          </button>
          {verResueltos && (
            <ul className="mt-2 space-y-1">
              {resueltos.map((p) => (
                <li key={p.id} className="text-xs text-[#5C3D2E]">
                  {p.estado === "aprobado" ? "✅" : "❌"} {p.empleado_nombre} — pidió {formatMoneda(p.monto)}
                  {p.estado === "aprobado" && p.monto_aprobado !== null && p.monto_aprobado !== p.monto && `, se aprobó ${formatMoneda(p.monto_aprobado)}`}
                  {" "}para el viernes {fechaCorta(p.fecha_pago)}
                  {p.respuesta && ` · "${p.respuesta}"`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
