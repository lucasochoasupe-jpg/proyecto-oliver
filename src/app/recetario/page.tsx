"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";

type Unidad = "kg" | "unidad";

interface Producto {
  producto_id: string;
  nombre: string;
  rinde: number;
  masa_g: number;
  unidad: Unidad | null;
  unidad_detectada: Unidad | null;
  unidad_ajustada: boolean;
  oculto: boolean;
  peso_unidad_g: number | null;
  ingredientes: number;
  problemas: string[];
}

interface ProductosResponse {
  productos: Producto[];
  sincronizado_at: number | null;
  planilla_url?: string;
  descarga_url?: string;
}

interface Linea {
  insumo_id: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  es_receta: boolean;
}

interface Resultado {
  producto: { producto_id: string; nombre: string; cantidad: number; unidad: Unidad };
  receta: Linea[];
  preparaciones: { producto_id: string; nombre: string; cantidad: number; unidad: Unidad; ingredientes: Linea[] }[];
  materia_prima: Linea[];
  advertencias: string[];
}

const CARD = "bg-white rounded-xl border border-[#EDE0CC]";

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function nombreLindo(s: string) {
  const t = s.trim();
  // La planilla mezcla MAYÚSCULAS y minúsculas: se muestra todo como oración.
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function num(n: number, decimales: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
}

function formatCantidad(cantidad: number, unidad: string): string {
  if (unidad === "g") return cantidad >= 1000 ? `${num(cantidad / 1000, 2)} kg` : `${num(cantidad, cantidad < 10 ? 1 : 0)} g`;
  if (unidad === "ml") return cantidad >= 1000 ? `${num(cantidad / 1000, 2)} L` : `${num(cantidad, cantidad < 10 ? 1 : 0)} ml`;
  if (unidad === "unidad") return `${num(cantidad, 1)} u.`;
  return num(cantidad, 2);
}

function formatPedido(cantidad: number, unidad: Unidad) {
  return unidad === "kg" ? `${num(cantidad, 2)} kg` : `${num(cantidad, 1)} unidad${cantidad === 1 ? "" : "es"}`;
}

function fechaHora(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TablaLineas({ lineas }: { lineas: Linea[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lineas.map((l, i) => (
          <tr key={i} className="border-b border-[#F3EADB] last:border-b-0">
            <td className="py-1.5 pr-3 text-[#2C1810]">
              {nombreLindo(l.descripcion)}
              {l.es_receta && <span className="ml-2 text-xs text-sky-700">preparación ↓</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums font-semibold text-[#2C1810] whitespace-nowrap">
              {formatCantidad(l.cantidad, l.unidad)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RecetarioPage() {
  const [data, setData] = useState<ProductosResponse | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>("kg");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSync, setMsgSync] = useState<string | null>(null);
  const [verRevision, setVerRevision] = useState(false);

  const cargar = useCallback(async () => {
    const admin = !document.cookie.split("; ").includes("sanca_rol=produccion");
    setEsAdmin(admin);
    const res = await fetch(`/api/recetario/productos${admin ? "?todos=1" : ""}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => (data?.productos ?? []).filter((p) => !p.oculto && p.unidad), [data]);
  const sugerencias = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = q ? visibles.filter((p) => normalizar(p.nombre).includes(q)) : visibles;
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 40);
  }, [busqueda, visibles]);
  const conProblemas = (data?.productos ?? []).filter((p) => p.problemas.length > 0 && !p.oculto).length;

  function elegir(p: Producto) {
    setElegido(p);
    setBusqueda(nombreLindo(p.nombre));
    setAbierto(false);
    setUnidad(p.unidad ?? "kg");
    setResultado(null);
    setError(null);
  }

  async function calcular(e?: React.FormEvent) {
    e?.preventDefault();
    if (!elegido) return setError("Elegí un producto de la lista.");
    const params = new URLSearchParams({ producto: elegido.producto_id, cantidad, unidad });
    setCalculando(true);
    setError(null);
    const res = await fetch(`/api/recetario/calcular?${params}`);
    const body = await res.json();
    setCalculando(false);
    if (!res.ok) {
      setResultado(null);
      setError(body.error ?? "No se pudo calcular");
      return;
    }
    setResultado(body);
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSincronizando(true);
    setMsgSync(null);
    const form = new FormData();
    form.append("archivo", archivo);
    const res = await fetch("/api/recetario/importar", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setSincronizando(false);
    setMsgSync(res.ok ? `Listo: ${body.productos} recetas actualizadas.` : body.error ?? "No se pudo actualizar");
    if (res.ok) cargar();
  }

  async function ajustar(p: Producto, cambios: { unidad?: Unidad | null; oculto?: boolean }) {
    await fetch(`/api/recetario/ajustes/${p.producto_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cambios),
    });
    cargar();
  }

  // Un producto que rinde en kg no se puede pedir por unidad (no se sabe cuánto pesa cada una).
  const puedeUnidad = elegido?.unidad === "unidad";
  const puedeKg = elegido?.unidad === "kg" || (elegido?.unidad === "unidad" && (elegido?.masa_g ?? 0) > 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-2 no-print">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Recetario</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">Elegí el producto y cuánto querés hacer: te calcula los ingredientes.</p>
          </div>
          {resultado && (
            <button onClick={() => window.print()} className="btn btn-secondary">
              Imprimir orden
            </button>
          )}
        </div>

        {data && data.productos.length === 0 && (
          <div className={`${CARD} p-6 text-sm text-[#8B6347] no-print`}>
            Todavía no hay recetas cargadas.{" "}
            {esAdmin ? "Usá \"Actualizar desde la planilla\" más abajo." : "Pedile a Administración que las cargue."}
          </div>
        )}

        {/* ── Buscador ── */}
        <form onSubmit={calcular} className={`${CARD} p-4 flex flex-wrap gap-3 items-end no-print`}>
          <div className="flex flex-col gap-1 relative flex-1 min-w-64">
            <label className="text-xs text-[#8B6347] font-medium">Producto</label>
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setElegido(null);
                setAbierto(true);
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              placeholder="Ej: medialunas, budín, pan de molde…"
              className="border border-[#EDE0CC] rounded-lg px-3 py-2 text-base text-[#2C1810] outline-none focus:border-[#D4A843]"
            />
            {abierto && sugerencias.length > 0 && (
              <ul className="absolute top-full mt-1 left-0 right-0 z-20 bg-white border border-[#EDE0CC] rounded-lg shadow-lg max-h-80 overflow-y-auto">
                {sugerencias.map((p) => (
                  <li key={p.producto_id}>
                    <button
                      type="button"
                      onMouseDown={() => elegir(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAF7F2] flex justify-between gap-3"
                    >
                      <span className="text-[#2C1810]">{nombreLindo(p.nombre)}</span>
                      <span className="text-xs text-[#B89070] shrink-0">{p.unidad === "kg" ? "por kg" : "por unidad"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Cantidad</label>
            <input
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="border border-[#EDE0CC] rounded-lg px-3 py-2 text-base text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
            />
          </div>
          <div className="inline-flex rounded-lg border border-[#EDE0CC] overflow-hidden text-sm">
            <button
              type="button"
              disabled={!!elegido && !puedeKg}
              onClick={() => setUnidad("kg")}
              className={`px-4 py-2 disabled:opacity-30 ${unidad === "kg" ? "bg-[#2C1810] text-white" : "text-[#8B6347]"}`}
            >
              kg
            </button>
            <button
              type="button"
              disabled={!!elegido && !puedeUnidad}
              onClick={() => setUnidad("unidad")}
              className={`px-4 py-2 disabled:opacity-30 ${unidad === "unidad" ? "bg-[#2C1810] text-white" : "text-[#8B6347]"}`}
            >
              unidades
            </button>
          </div>
          <button type="submit" disabled={calculando || !elegido || !cantidad} className="btn btn-primary !py-2">
            {calculando ? "Calculando…" : "Calcular"}
          </button>
          {elegido && (
            <p className="w-full text-xs text-[#B89070]">
              La receta base rinde {formatPedido(elegido.rinde, elegido.unidad ?? "kg")}
              {elegido.peso_unidad_g ? ` (unos ${num(elegido.peso_unidad_g, 0)} g cada una)` : ""}.
            </p>
          )}
        </form>

        {error && <div className={`${CARD} p-4 text-sm text-red-600 no-print`}>{error}</div>}

        {/* ── Resultado ── */}
        {resultado && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Orden de producción</p>
              <h2 className="text-2xl font-bold text-[#2C1810]">
                {formatPedido(resultado.producto.cantidad, resultado.producto.unidad)} de {nombreLindo(resultado.producto.nombre)}
              </h2>
            </div>

            {resultado.advertencias.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 space-y-1">
                {resultado.advertencias.map((a, i) => (
                  <p key={i}>⚠ {a}</p>
                ))}
              </div>
            )}

            <div className={`grid gap-6 ${resultado.preparaciones.length > 0 ? "lg:grid-cols-2" : ""}`}>
              <div className={`${CARD} p-4 print-plano self-start`}>
                <h3 className="font-semibold text-[#2C1810] mb-2">Ingredientes</h3>
                <TablaLineas lineas={resultado.receta} />
              </div>

              {resultado.preparaciones.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-[#2C1810]">Preparaciones que necesitás antes</h3>
                  {resultado.preparaciones.map((p) => (
                    <div key={`${p.producto_id}-${p.unidad}`} className={`${CARD} p-4 print-plano`}>
                      <p className="font-medium text-[#2C1810] mb-2">
                        {nombreLindo(p.nombre)} <span className="text-[#8B6347] font-normal">— {formatPedido(p.cantidad, p.unidad)}</span>
                      </p>
                      <TablaLineas lineas={p.ingredientes} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {resultado.preparaciones.length > 0 && (
              <div className={`${CARD} p-4 print-plano`}>
                <h3 className="font-semibold text-[#2C1810]">Materia prima total</h3>
                <p className="text-xs text-[#8B6347] mb-2">Todo sumado, incluyendo lo de las preparaciones.</p>
                <div className="sm:columns-2 gap-8">
                  <TablaLineas lineas={resultado.materia_prima} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Administración de recetas (solo admin) ── */}
        {esAdmin && data && (
          <div className={`${CARD} p-4 space-y-3 no-print`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-[#2C1810]">Recetas desde la planilla</h2>
                <p className="text-xs text-[#8B6347] mt-0.5">
                  Las recetas se editan en el{" "}
                  <a href={data.planilla_url} target="_blank" rel="noreferrer" className="underline">
                    Maestro Recetas
                  </a>{" "}
                  (hoja &quot;BBDD Costos Recetas&quot;).{" "}
                  {data.sincronizado_at
                    ? `Última actualización: ${fechaHora(data.sincronizado_at)}.`
                    : "Todavía no se trajeron."}{" "}
                  {data.productos.length > 0 && `${data.productos.length} recetas.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={data.descarga_url} target="_blank" rel="noreferrer" className="btn btn-secondary">
                  ↓ 1. Descargar planilla
                </a>
                <label className={`btn btn-primary cursor-pointer ${sincronizando ? "opacity-40 pointer-events-none" : ""}`}>
                  {sincronizando ? "Actualizando…" : "↑ 2. Subir y actualizar"}
                  <input type="file" accept=".csv,.xlsx,text/csv" onChange={subirArchivo} className="hidden" />
                </label>
              </div>
            </div>
            <p className="text-xs text-[#8B6347]">
              &quot;Descargar planilla&quot; baja la hoja de recetas como archivo (tenés que estar con tu cuenta de Google). Después tocá
              &quot;Subir y actualizar&quot; y elegí ese archivo, que queda en Descargas.
            </p>
            {msgSync && <p className="text-sm font-medium text-[#2C1810]">{msgSync}</p>}

            {data.productos.length > 0 && (
              <div>
                <button onClick={() => setVerRevision((v) => !v)} className="text-sm text-[#8B6347] hover:text-[#2C1810] underline">
                  {verRevision ? "Ocultar" : "Revisar"} unidades de las recetas
                  {conProblemas > 0 && ` (${conProblemas} para revisar)`}
                </button>
                {verRevision && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm responsive-table">
                      <thead>
                        <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2] text-xs text-[#8B6347] uppercase tracking-wide">
                          <th className="text-left px-3 py-2">Producto</th>
                          <th className="text-right px-3 py-2">Rinde</th>
                          <th className="text-left px-3 py-2">Se mide en</th>
                          <th className="text-left px-3 py-2">Revisar</th>
                          <th className="px-3 py-2">Oculto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.productos]
                          .sort((a, b) => b.problemas.length - a.problemas.length)
                          .map((p) => (
                            <tr key={p.producto_id} className={`border-b border-[#F3EADB] ${p.oculto ? "opacity-50" : ""}`}>
                              <td className="px-3 py-2 text-[#2C1810]" data-label="Producto">
                                <span className="text-[#B89070] text-xs mr-1">{p.producto_id}</span>
                                {nombreLindo(p.nombre)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums" data-label="Rinde">
                                {num(p.rinde, 3)}
                                {p.peso_unidad_g ? <span className="text-xs text-[#B89070]"> ({num(p.peso_unidad_g, 0)} g c/u)</span> : null}
                              </td>
                              <td className="px-3 py-2" data-label="Se mide en">
                                <select
                                  value={p.unidad_ajustada ? p.unidad ?? "" : ""}
                                  onChange={(e) => ajustar(p, { unidad: (e.target.value || null) as Unidad | null })}
                                  className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm"
                                >
                                  <option value="">
                                    Automático ({p.unidad_detectada === "kg" ? "kg" : p.unidad_detectada === "unidad" ? "unidades" : "—"})
                                  </option>
                                  <option value="kg">kg</option>
                                  <option value="unidad">unidades</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-xs text-amber-700" data-label="Revisar">
                                {p.problemas.join(" · ")}
                              </td>
                              <td className="px-3 py-2 text-center" data-label="Oculto">
                                <input type="checkbox" checked={p.oculto} onChange={(e) => ajustar(p, { oculto: e.target.checked })} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
