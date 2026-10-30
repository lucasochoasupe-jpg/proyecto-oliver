"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CARD = "bg-white rounded-2xl border border-[#EDE0CC] shadow-[0_1px_2px_rgba(44,24,16,0.04)]";

// Sin tildes y en minúscula, conservando el largo (cada letra sigue siendo una
// letra) para poder resaltar la coincidencia sobre el nombre original.
function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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

function inicial(nombre: string) {
  const c = normalizar(nombre.trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  const q = normalizar(busqueda.trim());
  const i = q ? normalizar(texto).indexOf(q) : -1;
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="bg-[#F6E7C1] text-[#2C1810] rounded-sm">{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  );
}

function Icono({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICONO_LUPA = "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z";
const ICONO_CHEVRON = "M6 9l6 6 6-6";
const ICONO_X = "M18 6 6 18M6 6l12 12";

function TablaLineas({ lineas }: { lineas: Linea[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lineas.map((l, i) => (
          <tr key={i} className="border-b border-dashed border-[#EFE3D0] last:border-b-0">
            <td className="py-2 pr-3 text-[#2C1810]">
              {nombreLindo(l.descripcion)}
              {l.es_receta && (
                <span className="ml-2 inline-block rounded-full bg-sky-50 border border-sky-200 px-2 py-px text-[11px] text-sky-700 align-middle">
                  preparación
                </span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums font-semibold text-[#2C1810] whitespace-nowrap">
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
  const [activo, setActivo] = useState(0);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const cargar = useCallback(async () => {
    const admin = !document.cookie.split("; ").includes("sanca_rol=produccion");
    setEsAdmin(admin);
    const res = await fetch(`/api/recetario/productos${admin ? "?todos=1" : ""}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(
    () =>
      (data?.productos ?? [])
        .filter((p) => !p.oculto && p.unidad)
        .sort((a, b) => a.nombre.trim().localeCompare(b.nombre.trim(), "es", { sensitivity: "base" })),
    [data]
  );
  const sugerencias = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? visibles.filter((p) => normalizar(p.nombre).includes(q) || p.producto_id === q) : visibles;
  }, [busqueda, visibles]);
  const conProblemas = (data?.productos ?? []).filter((p) => p.problemas.length > 0 && !p.oculto).length;

  useEffect(() => setActivo(0), [busqueda]);
  useEffect(() => {
    listaRef.current?.querySelector(`[data-idx="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function elegir(p: Producto) {
    setElegido(p);
    setBusqueda(nombreLindo(p.nombre));
    setAbierto(false);
    setUnidad(p.unidad ?? "kg");
    setResultado(null);
    setError(null);
    setTimeout(() => cantidadRef.current?.focus(), 0);
  }

  function limpiar() {
    setBusqueda("");
    setElegido(null);
    setResultado(null);
    setError(null);
    setAbierto(true);
    inputRef.current?.focus();
  }

  function teclaBuscador(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) return setAbierto(true);
      const n = sugerencias.length;
      if (n) setActivo((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter" && abierto && !elegido) {
      e.preventDefault();
      if (sugerencias[activo]) elegir(sugerencias[activo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  async function calcular(e?: React.FormEvent, cantidadPedida = cantidad) {
    e?.preventDefault();
    if (!elegido) return setError("Elegí un producto de la lista.");
    const params = new URLSearchParams({ producto: elegido.producto_id, cantidad: cantidadPedida, unidad });
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

  // Atajos de cantidad: la receta base tal cual y algunos múltiplos.
  const atajos = useMemo(() => {
    if (!elegido) return [];
    const base = unidad === elegido.unidad ? elegido.rinde : unidad === "kg" ? elegido.masa_g / 1000 : 0;
    if (!(base > 0)) return [];
    return [1, 2, 5].map((m) => ({ etiqueta: m === 1 ? "Receta base" : `×${m}`, valor: Math.round(base * m * 100) / 100 }));
  }, [elegido, unidad]);

  // Índice de cada sugerencia dentro de la lista agrupada por letra.
  let idx = 0;
  const grupos: { letra: string; productos: { p: Producto; i: number }[] }[] = [];
  for (const p of sugerencias) {
    const letra = inicial(p.nombre);
    if (grupos.at(-1)?.letra !== letra) grupos.push({ letra, productos: [] });
    grupos.at(-1)!.productos.push({ p, i: idx++ });
  }

  const toggleBase = "px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-2 no-print">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#2C1810]">Recetario</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              Elegí el producto y cuánto querés hacer: te calcula los ingredientes.
              {visibles.length > 0 && <span className="text-[#B89070]"> · {visibles.length} recetas</span>}
            </p>
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
        <form onSubmit={calcular} className={`${CARD} p-5 sm:p-6 no-print`}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-xs text-[#8B6347] font-semibold uppercase tracking-wide">1 · Producto</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B89070] pointer-events-none">
                  <Icono d={ICONO_LUPA} />
                </span>
                <input
                  ref={inputRef}
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setElegido(null);
                    setAbierto(true);
                  }}
                  onFocus={() => setAbierto(true)}
                  onBlur={() => setTimeout(() => setAbierto(false), 150)}
                  onKeyDown={teclaBuscador}
                  role="combobox"
                  aria-expanded={abierto}
                  aria-autocomplete="list"
                  placeholder="Buscá: medialunas, budín, pan de molde…"
                  className="w-full border border-[#E2CFAE] rounded-full pl-10 pr-20 py-2.5 text-base text-[#2C1810] bg-[#FFFDF9] outline-none focus:border-[#D4A843] focus:ring-4 focus:ring-[#D4A843]/15 transition"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {busqueda && (
                    <button
                      type="button"
                      onClick={limpiar}
                      aria-label="Borrar"
                      className="p-1.5 rounded-full text-[#B89070] hover:text-[#2C1810] hover:bg-[#F3EADB]"
                    >
                      <Icono d={ICONO_X} />
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAbierto((a) => !a);
                      inputRef.current?.focus();
                    }}
                    aria-label="Ver todas las recetas"
                    className="p-1.5 rounded-full text-[#8B6347] hover:text-[#2C1810] hover:bg-[#F3EADB]"
                  >
                    <Icono d={ICONO_CHEVRON} className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {abierto && (
                <div className="absolute top-full mt-2 left-0 right-0 z-20 bg-white border border-[#EDE0CC] rounded-2xl shadow-xl overflow-hidden">
                  <div className="px-4 py-2 text-xs text-[#B89070] border-b border-[#F3EADB] flex justify-between">
                    <span>
                      {sugerencias.length === visibles.length
                        ? `Todas las recetas (${visibles.length})`
                        : `${sugerencias.length} de ${visibles.length} recetas`}
                    </span>
                    <span className="hidden sm:inline">↑ ↓ para moverte · Enter para elegir</span>
                  </div>
                  {sugerencias.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-center text-[#8B6347]">No hay ninguna receta con &quot;{busqueda}&quot;.</p>
                  ) : (
                    <ul ref={listaRef} role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto pb-1">
                      {grupos.map((g) => (
                        <li key={g.letra}>
                          <p className="sticky top-0 z-10 bg-[#FBF6EE]/95 backdrop-blur px-4 py-1 text-[11px] font-semibold text-[#B89070] tracking-wider">
                            {g.letra}
                          </p>
                          <ul>
                            {g.productos.map(({ p, i }) => (
                              <li key={p.producto_id} data-idx={i} role="option" aria-selected={i === activo}>
                                <button
                                  type="button"
                                  onMouseDown={() => elegir(p)}
                                  onMouseEnter={() => setActivo(i)}
                                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-3 ${
                                    i === activo ? "bg-[#FAF1E2]" : ""
                                  }`}
                                >
                                  <span className="text-[#2C1810] truncate">
                                    <Resaltado texto={nombreLindo(p.nombre)} busqueda={busqueda} />
                                  </span>
                                  <span
                                    className={`text-[11px] shrink-0 rounded-full px-2 py-px border ${
                                      p.unidad === "kg"
                                        ? "border-[#E8D3A8] text-[#9A6B1F] bg-[#FDF6E7]"
                                        : "border-[#E5D9CC] text-[#8B6347] bg-[#FAF7F2]"
                                    }`}
                                  >
                                    {p.unidad === "kg" ? "por kg" : "por unidad"}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#8B6347] font-semibold uppercase tracking-wide">2 · Cantidad</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={cantidadRef}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="border border-[#E2CFAE] rounded-full px-4 py-2.5 text-base text-[#2C1810] bg-[#FFFDF9] outline-none focus:border-[#D4A843] focus:ring-4 focus:ring-[#D4A843]/15 transition w-28 tabular-nums"
                  />
                  <div className="inline-flex rounded-full bg-[#F3EADB] p-1">
                    <button
                      type="button"
                      disabled={!!elegido && !puedeKg}
                      onClick={() => setUnidad("kg")}
                      className={`${toggleBase} !py-1.5 ${unidad === "kg" ? "bg-[#2C1810] text-white shadow-sm" : "text-[#8B6347] hover:text-[#2C1810]"}`}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      disabled={!!elegido && !puedeUnidad}
                      onClick={() => setUnidad("unidad")}
                      className={`${toggleBase} !py-1.5 ${unidad === "unidad" ? "bg-[#2C1810] text-white shadow-sm" : "text-[#8B6347] hover:text-[#2C1810]"}`}
                    >
                      unidades
                    </button>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={calculando || !elegido || !cantidad} className="btn btn-primary !px-6 !py-2.5">
                {calculando ? "Calculando…" : "Calcular"}
              </button>
            </div>
          </div>

          {elegido && (
            <div className="mt-4 pt-4 border-t border-dashed border-[#EDE0CC] flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-[#8B6347]">
                La receta base rinde <strong className="text-[#2C1810] font-semibold">{formatPedido(elegido.rinde, elegido.unidad ?? "kg")}</strong>
                {elegido.peso_unidad_g ? ` (unos ${num(elegido.peso_unidad_g, 0)} g cada una)` : ""} ·{" "}
                {elegido.ingredientes} ingrediente{elegido.ingredientes === 1 ? "" : "s"}.
              </p>
              {atajos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {atajos.map((a) => (
                    <button
                      key={a.etiqueta}
                      type="button"
                      onClick={() => {
                        setCantidad(String(a.valor).replace(".", ","));
                        calcular(undefined, String(a.valor));
                      }}
                      className="rounded-full px-3 py-1 text-xs bg-white text-[#5C3D2E] border border-[#EDE0CC] hover:border-[#D4A843] hover:text-[#2C1810] transition-colors"
                    >
                      {a.etiqueta} <span className="text-[#B89070] tabular-nums">({formatPedido(a.valor, unidad)})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 no-print">{error}</div>}

        {!resultado && !error && data && data.productos.length > 0 && (
          <div className="no-print rounded-2xl border border-dashed border-[#E2CFAE] px-6 py-10 text-center">
            <p className="font-display text-lg text-[#2C1810]">¿Qué hacemos hoy?</p>
            <p className="text-sm text-[#8B6347] mt-1">
              Buscá un producto o tocá la flechita para ver las {visibles.length} recetas, poné la cantidad y tocá Calcular.
            </p>
          </div>
        )}

        {/* ── Resultado ── */}
        {resultado && (
          <div className="space-y-6">
            <div className={`${CARD} p-5 sm:p-6 print-plano bg-gradient-to-br from-white to-[#FBF3E4]`}>
              <p className="text-xs text-[#9A6B1F] uppercase tracking-[0.15em] font-semibold">Orden de producción</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-[#2C1810] mt-1">
                {nombreLindo(resultado.producto.nombre)}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-[#2C1810] text-white px-3 py-1 font-medium tabular-nums">
                  {formatPedido(resultado.producto.cantidad, resultado.producto.unidad)}
                </span>
                <span className="rounded-full bg-white border border-[#EDE0CC] text-[#8B6347] px-3 py-1">
                  {resultado.receta.length} ingrediente{resultado.receta.length === 1 ? "" : "s"}
                </span>
                {resultado.preparaciones.length > 0 && (
                  <span className="rounded-full bg-sky-50 border border-sky-200 text-sky-700 px-3 py-1">
                    {resultado.preparaciones.length} preparaci{resultado.preparaciones.length === 1 ? "ón" : "ones"} antes
                  </span>
                )}
              </div>
            </div>

            {resultado.advertencias.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 space-y-1">
                {resultado.advertencias.map((a, i) => (
                  <p key={i}>⚠ {a}</p>
                ))}
              </div>
            )}

            <div className={`grid gap-6 ${resultado.preparaciones.length > 0 ? "lg:grid-cols-2" : ""}`}>
              <div className={`${CARD} p-5 print-plano self-start`}>
                <h3 className="font-display text-lg font-semibold text-[#2C1810] mb-2">Ingredientes</h3>
                <TablaLineas lineas={resultado.receta} />
              </div>

              {resultado.preparaciones.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-display text-lg font-semibold text-[#2C1810]">Preparaciones que necesitás antes</h3>
                  {resultado.preparaciones.map((p) => (
                    <div key={`${p.producto_id}-${p.unidad}`} className={`${CARD} p-5 print-plano border-l-4 !border-l-sky-200`}>
                      <p className="font-semibold text-[#2C1810] mb-2 flex items-baseline justify-between gap-3">
                        <span>{nombreLindo(p.nombre)}</span>
                        <span className="text-sm text-[#8B6347] font-medium tabular-nums whitespace-nowrap">{formatPedido(p.cantidad, p.unidad)}</span>
                      </p>
                      <TablaLineas lineas={p.ingredientes} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {resultado.preparaciones.length > 0 && (
              <div className={`${CARD} p-5 print-plano`}>
                <h3 className="font-display text-lg font-semibold text-[#2C1810]">Materia prima total</h3>
                <p className="text-xs text-[#8B6347] mb-2">Todo sumado, incluyendo lo de las preparaciones.</p>
                <div className="sm:columns-2 gap-10">
                  <TablaLineas lineas={resultado.materia_prima} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Administración de recetas (solo admin) ── */}
        {esAdmin && data && (
          <div className={`${CARD} p-5 space-y-3 no-print`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#2C1810]">Recetas desde la planilla</h2>
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
