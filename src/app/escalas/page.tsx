"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ParitariasPendientes from "@/components/ParitariasPendientes";

interface Convenio {
  id: number;
  codigo: string;
  nombre: string;
}

interface Categoria {
  id: number;
  convenio_id: number;
  nombre: string;
}

interface Escala {
  categoria_id: number;
  vigente_desde: string;
  basico: number;
  no_remunerativo: number;
}

type FilaForm = { basico: string; no_remunerativo: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mesLabel(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

function sumarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Escalas salariales por convenio y categoría con mes de vigencia. Cargar una
// paritaria = una vigencia nueva; los meses anteriores conservan sus valores.
export default function EscalasPage() {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [convenioId, setConvenioId] = useState<number | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [cargando, setCargando] = useState(true);

  // Formulario de vigencia (nueva o edición de una existente)
  const [editando, setEditando] = useState<{ mes: string; esNueva: boolean } | null>(null);
  const [filas, setFilas] = useState<Record<number, FilaForm>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  // "Cargar escala" desde el aviso de paritaria: cambia al convenio y abre el
  // formulario cuando terminan de cargar sus escalas.
  const [abrirAlCargar, setAbrirAlCargar] = useState(false);
  const [recargarAviso, setRecargarAviso] = useState(0);

  useEffect(() => {
    fetch("/api/convenios")
      .then((r) => r.json())
      .then((cs: Convenio[]) => {
        setConvenios(cs);
        if (cs.length > 0) setConvenioId(cs[0].id);
      });
  }, []);

  const cargar = useCallback(async (id: number) => {
    setCargando(true);
    const res = await fetch(`/api/escalas?convenio_id=${id}`);
    const json = (await res.json()) as { categorias: Categoria[]; escalas: Escala[] };
    setCategorias(json.categorias);
    setEscalas(json.escalas);
    setCargando(false);
  }, []);

  useEffect(() => {
    if (convenioId === null) return;
    setEditando(null);
    cargar(convenioId);
  }, [convenioId, cargar]);

  const vigencias = useMemo(() => [...new Set(escalas.map((e) => e.vigente_desde))].sort().reverse(), [escalas]);
  const valor = useMemo(() => {
    const m = new Map<string, Escala>();
    for (const e of escalas) m.set(`${e.categoria_id}|${e.vigente_desde}`, e);
    return m;
  }, [escalas]);

  // Vigencia que rige hoy (la más reciente que no sea futura).
  const hoy = mesActual();
  const vigenteHoy = vigencias.find((v) => v <= hoy) ?? null;

  // Valores de la vigencia inmediatamente anterior a `mes` para una categoría.
  function anterior(categoriaId: number, mes: string): Escala | null {
    const previa = vigencias.find((v) => v < mes && valor.has(`${categoriaId}|${v}`));
    return previa ? valor.get(`${categoriaId}|${previa}`) ?? null : null;
  }

  function abrirNueva() {
    const ultima = vigencias[0];
    const mes = ultima ? sumarMes(ultima, 1) : hoy;
    const prellenado: Record<number, FilaForm> = {};
    for (const c of categorias) {
      const prev = ultima ? valor.get(`${c.id}|${ultima}`) : undefined;
      prellenado[c.id] = { basico: prev ? String(prev.basico) : "", no_remunerativo: "0" };
    }
    setFilas(prellenado);
    setEditando({ mes, esNueva: true });
    setError(null);
  }

  function abrirEdicion(mes: string) {
    const prellenado: Record<number, FilaForm> = {};
    for (const c of categorias) {
      const e = valor.get(`${c.id}|${mes}`);
      prellenado[c.id] = { basico: e ? String(e.basico) : "", no_remunerativo: e ? String(e.no_remunerativo) : "0" };
    }
    setFilas(prellenado);
    setEditando({ mes, esNueva: false });
    setError(null);
  }

  // % de aumento de cada fila contra la vigencia anterior, y la mediana: en una
  // paritaria todas las categorías suben lo mismo, así que una fila que se
  // aparta de la mediana suele ser un error de tipeo.
  const aumentos = useMemo(() => {
    if (!editando) return { porCategoria: new Map<number, number>(), mediana: null as number | null };
    const porCategoria = new Map<number, number>();
    for (const c of categorias) {
      const prev = anterior(c.id, editando.mes);
      const nuevo = Number(filas[c.id]?.basico);
      if (prev && nuevo > 0) porCategoria.set(c.id, (nuevo / prev.basico - 1) * 100);
    }
    const vals = [...porCategoria.values()].sort((a, b) => a - b);
    const mediana = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    return { porCategoria, mediana };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, filas, categorias, escalas]);

  async function guardar() {
    if (!editando || convenioId === null) return;
    setError(null);
    if (editando.esNueva && vigencias.includes(editando.mes)) {
      if (!confirm(`Ya hay una escala vigente desde ${mesLabel(editando.mes)}. ¿Reemplazar sus valores?`)) return;
    }
    setGuardando(true);
    const res = await fetch("/api/escalas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vigente_desde: editando.mes,
        filas: categorias.map((c) => ({
          categoria_id: c.id,
          basico: Number(filas[c.id]?.basico) || 0,
          no_remunerativo: Number(filas[c.id]?.no_remunerativo) || 0,
        })),
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar");
      return;
    }
    setEditando(null);
    cargar(convenioId);
    setRecargarAviso((n) => n + 1);
  }

  async function borrarVigencia(mes: string) {
    if (convenioId === null) return;
    if (!confirm(`¿Borrar la escala vigente desde ${mesLabel(mes)}? Los meses afectados se van a calcular con la escala anterior.`)) return;
    await fetch(`/api/escalas?convenio_id=${convenioId}&vigente_desde=${mes}`, { method: "DELETE" });
    setEditando(null);
    cargar(convenioId);
  }

  async function agregarCategoria() {
    if (convenioId === null || !nuevaCategoria.trim()) return;
    const res = await fetch("/api/escalas/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convenio_id: convenioId, nombre: nuevaCategoria.trim() }),
    });
    if (!res.ok) {
      alert(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo crear");
      return;
    }
    setNuevaCategoria("");
    cargar(convenioId);
  }

  useEffect(() => {
    if (abrirAlCargar && !cargando) {
      setAbrirAlCargar(false);
      abrirNueva();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirAlCargar, cargando]);

  const columnas = vigencias.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Escalas salariales" />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Escalas salariales</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            Sueldo básico y suma no remunerativa de cada categoría, por mes de vigencia. A los empleados con categoría asignada
            (ficha → Datos legales) el sueldo en blanco se les calcula con la escala vigente en el mes que se liquida.
          </p>
        </div>

        <ParitariasPendientes
          recargar={recargarAviso}
          onCargar={(id) => {
            if (id === convenioId) abrirNueva();
            else {
              setConvenioId(id);
              setAbrirAlCargar(true);
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          {convenios.map((c) => (
            <button
              key={c.id}
              onClick={() => setConvenioId(c.id)}
              className={`text-sm px-4 py-1.5 rounded-full border font-medium transition-colors ${
                convenioId === c.id ? "bg-[#2C1810] text-white border-[#2C1810]" : "bg-white text-[#8B6347] border-[#EDE0CC] hover:border-[#D4A843]"
              }`}
            >
              {c.nombre}
            </button>
          ))}
          <button
            onClick={abrirNueva}
            disabled={cargando || categorias.length === 0}
            className="ml-auto text-sm text-white bg-[#D4A843] hover:bg-[#C49833] disabled:opacity-50 px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
          >
            + Cargar escala nueva
          </button>
        </div>

        {cargando ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {editando && (
              <div className="bg-white rounded-xl border-2 border-[#D4A843] p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Vigente desde</label>
                    <input
                      type="month"
                      value={editando.mes}
                      disabled={!editando.esNueva}
                      onChange={(e) => setEditando({ ...editando, mes: e.target.value })}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] disabled:bg-[#FAF7F2]"
                    />
                  </div>
                  <p className="text-xs text-[#8B6347] pb-2 flex-1 min-w-[16rem]">
                    {editando.esNueva
                      ? "Los montos vienen con la última escala: corregí los que cambian. El % de aumento se calcula solo; si una categoría no coincide con el resto, se marca en rojo."
                      : `Editando la escala vigente desde ${mesLabel(editando.mes)}.`}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[#8B6347] uppercase tracking-wide border-b border-[#EDE0CC]">
                        <th className="py-2 pr-3 font-semibold">Categoría</th>
                        <th className="py-2 pr-3 font-semibold">Anterior</th>
                        <th className="py-2 pr-3 font-semibold">Básico</th>
                        <th className="py-2 pr-3 font-semibold">Aumento</th>
                        <th className="py-2 pr-3 font-semibold">No remunerativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorias.map((c) => {
                        const prev = anterior(c.id, editando.mes);
                        const pct = aumentos.porCategoria.get(c.id);
                        const raro = pct !== undefined && aumentos.mediana !== null && Math.abs(pct - aumentos.mediana) > 0.3;
                        return (
                          <tr key={c.id} className="border-b border-[#F3EADB]">
                            <td className="py-1.5 pr-3 text-[#2C1810]">{c.nombre}</td>
                            <td className="py-1.5 pr-3 font-mono text-[#8B6347]">{prev ? formatMoneda(prev.basico) : "—"}</td>
                            <td className="py-1.5 pr-3">
                              <input
                                type="number"
                                value={filas[c.id]?.basico ?? ""}
                                onChange={(e) => setFilas((p) => ({ ...p, [c.id]: { ...p[c.id], basico: e.target.value } }))}
                                className={`border rounded-lg px-2 py-1 text-sm font-mono w-36 outline-none focus:border-[#D4A843] ${raro ? "border-red-400 bg-red-50" : "border-[#EDE0CC]"}`}
                              />
                            </td>
                            <td className={`py-1.5 pr-3 font-mono text-xs ${raro ? "text-red-600 font-semibold" : "text-[#5C3D2E]"}`}>
                              {pct !== undefined ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                              {raro && " ⚠"}
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                type="number"
                                value={filas[c.id]?.no_remunerativo ?? ""}
                                onChange={(e) => setFilas((p) => ({ ...p, [c.id]: { ...p[c.id], no_remunerativo: e.target.value } }))}
                                className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm font-mono w-32 outline-none focus:border-[#D4A843]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={guardar}
                    disabled={guardando}
                    className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
                  >
                    {guardando ? "Guardando..." : "Guardar escala"}
                  </button>
                  <button onClick={() => setEditando(null)} className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2">
                    Cancelar
                  </button>
                  {!editando.esNueva && (
                    <button onClick={() => borrarVigencia(editando.mes)} className="ml-auto text-sm text-red-600 hover:text-red-700 px-4 py-2">
                      Borrar esta vigencia
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-x-auto">
              {vigencias.length === 0 ? (
                <p className="text-sm text-[#8B6347] p-4">Todavía no hay escalas cargadas para este convenio.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#EDE0CC]">
                      <th className="text-left px-4 py-2.5 text-xs text-[#8B6347] uppercase tracking-wide font-semibold">Categoría</th>
                      {columnas.map((v) => (
                        <th key={v} className="text-right px-4 py-2.5 text-xs uppercase tracking-wide font-semibold whitespace-nowrap">
                          <button
                            onClick={() => abrirEdicion(v)}
                            title="Editar esta vigencia"
                            className={`underline decoration-dotted ${v === vigenteHoy ? "text-emerald-700" : "text-[#8B6347]"} hover:text-[#2C1810]`}
                          >
                            Desde {mesLabel(v)}
                          </button>
                          {v === vigenteHoy && <span className="block text-[10px] text-emerald-700 normal-case font-medium">vigente hoy</span>}
                          {v > hoy && <span className="block text-[10px] text-sky-700 normal-case font-medium">futura</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map((c) => (
                      <tr key={c.id} className="border-b border-[#F3EADB] last:border-b-0">
                        <td className="px-4 py-2 text-[#2C1810]">{c.nombre}</td>
                        {columnas.map((v) => {
                          const e = valor.get(`${c.id}|${v}`);
                          return (
                            <td key={v} className={`px-4 py-2 text-right font-mono whitespace-nowrap ${v === vigenteHoy ? "text-[#2C1810] font-semibold" : "text-[#5C3D2E]"}`}>
                              {e ? formatMoneda(e.basico) : "—"}
                              {e && e.no_remunerativo > 0 && (
                                <span className="block text-[11px] font-normal text-[#B89070]">+ {formatMoneda(e.no_remunerativo)} no rem.</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {vigencias.length > columnas.length && (
              <p className="text-xs text-[#B89070]">Se muestran las últimas {columnas.length} vigencias.</p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Agregar categoría</label>
                <input
                  type="text"
                  value={nuevaCategoria}
                  placeholder="Ej. Maestro facturero"
                  onChange={(e) => setNuevaCategoria(e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-64"
                />
              </div>
              <button
                onClick={agregarCategoria}
                disabled={!nuevaCategoria.trim()}
                className="text-sm text-[#2C1810] border border-[#D4A843] hover:bg-[#FDF6E3] disabled:opacity-50 px-4 py-1.5 rounded-full font-medium"
              >
                Agregar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
