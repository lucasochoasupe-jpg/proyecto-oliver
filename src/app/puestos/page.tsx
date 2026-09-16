"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import PageHeader from "@/components/PageHeader";

interface Puesto {
  id: number;
  nombre: string;
  departamento: string | null;
  reporta_a: string | null;
  objetivo: string | null;
  funciones: string | null;
  requisitos: string | null;
  competencias: string | null;
  created_at: number;
  cantidad_empleados: number;
}

interface EmpleadoOpcion {
  id: number;
  nombre: string;
  activo: number;
}

interface FormState {
  nombre: string;
  departamento: string;
  reporta_a: string;
  objetivo: string;
  funciones: string;
  requisitos: string;
  competencias: string;
}

const FORM_VACIO: FormState = {
  nombre: "",
  departamento: "",
  reporta_a: "",
  objetivo: "",
  funciones: "",
  requisitos: "",
  competencias: "",
};

// Render liviano de texto tipo markdown (####, - viñetas, **negrita**) sin
// depender de una librería — el contenido viene de descripciones de puesto
// con esa estructura, no de markdown arbitrario.
function renderTexto(texto: string | null) {
  if (!texto?.trim()) return <p className="text-sm text-[#B89070] italic">Sin definir.</p>;

  function renderInline(linea: string, key: number) {
    const partes = linea.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <Fragment key={key}>
        {partes.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={i} className="font-semibold text-[#2C1810]">{p.slice(2, -2)}</strong>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          )
        )}
      </Fragment>
    );
  }

  const lineas = texto.split("\n");
  const bloques: React.ReactNode[] = [];
  let listaActual: string[] = [];

  function flushLista() {
    if (listaActual.length === 0) return;
    bloques.push(
      <ul key={`ul-${bloques.length}`} className="list-disc pl-5 space-y-1 my-2">
        {listaActual.map((li, i) => (
          <li key={i} className="text-sm text-[#5C3D2E]">{renderInline(li, i)}</li>
        ))}
      </ul>
    );
    listaActual = [];
  }

  for (const linea of lineas) {
    const trim = linea.trim();
    if (!trim) { flushLista(); continue; }
    if (trim.startsWith("#### ") || trim.startsWith("### ")) {
      flushLista();
      const titulo = trim.replace(/^#+\s*/, "").replace(/\*\*/g, "");
      bloques.push(
        <p key={`h-${bloques.length}`} className="text-sm font-bold text-[#2C1810] mt-3 mb-1">{titulo}</p>
      );
    } else if (trim.startsWith("- ")) {
      listaActual.push(trim.slice(2));
    } else {
      flushLista();
      bloques.push(
        <p key={`p-${bloques.length}`} className="text-sm text-[#5C3D2E] leading-relaxed">{renderInline(trim, 0)}</p>
      );
    }
  }
  flushLista();

  return <div className="space-y-1">{bloques}</div>;
}

export default function PuestosPage() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const [asignando, setAsignando] = useState<Puesto | null>(null);
  const [empleadosOpciones, setEmpleadosOpciones] = useState<EmpleadoOpcion[]>([]);
  const [seleccionAsignar, setSeleccionAsignar] = useState<Set<number>>(new Set());
  const [busquedaAsignar, setBusquedaAsignar] = useState("");
  const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/puestos");
    const data = (await res.json()) as Puesto[];
    setPuestos(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/empleados").then((r) => r.json()).then((data: EmpleadoOpcion[]) => setEmpleadosOpciones(data));
  }, []);

  function abrirNuevo() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setErrorForm("");
    setMostrarForm(true);
  }

  function abrirEditar(p: Puesto) {
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre,
      departamento: p.departamento ?? "",
      reporta_a: p.reporta_a ?? "",
      objetivo: p.objetivo ?? "",
      funciones: p.funciones ?? "",
      requisitos: p.requisitos ?? "",
      competencias: p.competencias ?? "",
    });
    setErrorForm("");
    setMostrarForm(true);
  }

  async function guardarForm() {
    if (!form.nombre.trim()) { setErrorForm("El nombre es obligatorio."); return; }
    setGuardando(true);
    setErrorForm("");
    const body = {
      nombre: form.nombre.trim(),
      departamento: form.departamento.trim() || null,
      reporta_a: form.reporta_a.trim() || null,
      objetivo: form.objetivo.trim() || null,
      funciones: form.funciones.trim() || null,
      requisitos: form.requisitos.trim() || null,
      competencias: form.competencias.trim() || null,
    };
    const res = await fetch(editandoId ? `/api/puestos/${editandoId}` : "/api/puestos", {
      method: editandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setGuardando(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setErrorForm(json?.error ?? "No se pudo guardar.");
      return;
    }
    setMostrarForm(false);
    fetchData();
  }

  async function eliminarPuesto(id: number) {
    await fetch(`/api/puestos/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (expandido === id) setExpandido(null);
    fetchData();
  }

  async function abrirAsignar(p: Puesto) {
    setAsignando(p);
    setBusquedaAsignar("");
    const res = await fetch(`/api/puestos/${p.id}`);
    const json = (await res.json()) as { puesto: Puesto; empleados: { id: number }[] };
    setSeleccionAsignar(new Set(json.empleados.map((e) => e.id)));
  }

  function toggleAsignado(id: number) {
    setSeleccionAsignar((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function guardarAsignacion() {
    if (!asignando) return;
    setGuardandoAsignacion(true);
    await fetch(`/api/puestos/${asignando.id}/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empleadoIds: Array.from(seleccionAsignar) }),
    });
    setGuardandoAsignacion(false);
    setAsignando(null);
    fetchData();
  }

  const empleadosFiltradosAsignar = empleadosOpciones.filter(
    (e) => e.activo && e.nombre.toLowerCase().includes(busquedaAsignar.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Puestos y Tareas" />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Puestos y Tareas</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">{puestos.length} puestos definidos</p>
          </div>
          <button
            onClick={abrirNuevo}
            className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
          >
            + Nuevo puesto
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        ) : puestos.length === 0 ? (
          <div className="text-center py-16 text-[#8B6347] text-sm bg-white rounded-xl border border-[#EDE0CC]">
            Aún no hay puestos cargados.
          </div>
        ) : (
          <div className="space-y-3">
            {puestos.map((p) => {
              const isExpandido = expandido === p.id;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
                  <button
                    onClick={() => setExpandido(isExpandido ? null : p.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#FAF7F2] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2C1810] truncate">{p.nombre}</p>
                      <p className="text-xs text-[#8B6347] truncate">
                        {p.departamento || "Sin departamento"}
                        {p.reporta_a ? ` · Reporta a ${p.reporta_a}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FDF6E3] text-[#8B6347] border border-[#D4A843]">
                        {p.cantidad_empleados} {p.cantidad_empleados === 1 ? "empleado" : "empleados"}
                      </span>
                      <span className="text-[#B89070] text-sm">{isExpandido ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isExpandido && (
                    <div className="border-t border-[#EDE0CC] px-4 py-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => abrirAsignar(p)}
                          className="text-xs text-white bg-[#D4A843] hover:bg-[#C4983A] px-3 py-1 rounded-full active:scale-95 transition-colors font-medium"
                        >
                          Asignar empleados
                        </button>
                        <button
                          onClick={() => abrirEditar(p)}
                          className="text-xs text-[#D4A843] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors font-medium"
                        >
                          Editar
                        </button>
                        {confirmDelete === p.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => eliminarPuesto(p.id)}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-full font-medium"
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#8B6347] underline">
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(p.id)}
                            className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1 rounded-full active:scale-95 transition-colors font-medium"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-[#8B6347] uppercase tracking-wide font-semibold mb-1">Objetivo general</p>
                        {renderTexto(p.objetivo)}
                      </div>
                      <div>
                        <p className="text-xs text-[#8B6347] uppercase tracking-wide font-semibold mb-1">Funciones y responsabilidades</p>
                        {renderTexto(p.funciones)}
                      </div>
                      <div>
                        <p className="text-xs text-[#8B6347] uppercase tracking-wide font-semibold mb-1">Requisitos del puesto</p>
                        {renderTexto(p.requisitos)}
                      </div>
                      <div>
                        <p className="text-xs text-[#8B6347] uppercase tracking-wide font-semibold mb-1">Competencias y habilidades</p>
                        {renderTexto(p.competencias)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal alta / edición */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMostrarForm(false)}>
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-bold text-[#2C1810] text-lg">{editandoId ? "Editar puesto" : "Nuevo puesto"}</h2>
              <button onClick={() => setMostrarForm(false)} className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8B6347] font-medium block mb-1">Nombre del puesto *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8B6347] font-medium block mb-1">Departamento / Área</label>
                  <input
                    type="text"
                    value={form.departamento}
                    onChange={(e) => setForm((f) => ({ ...f, departamento: e.target.value }))}
                    className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Reporta a</label>
                <input
                  type="text"
                  value={form.reporta_a}
                  onChange={(e) => setForm((f) => ({ ...f, reporta_a: e.target.value }))}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Objetivo general del cargo</label>
                <textarea
                  value={form.objetivo}
                  onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))}
                  rows={3}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Funciones y responsabilidades</label>
                <textarea
                  value={form.funciones}
                  onChange={(e) => setForm((f) => ({ ...f, funciones: e.target.value }))}
                  rows={6}
                  placeholder={"#### A. Título de sección\n- Función uno.\n- Función dos."}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Requisitos del puesto</label>
                <textarea
                  value={form.requisitos}
                  onChange={(e) => setForm((f) => ({ ...f, requisitos: e.target.value }))}
                  rows={4}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Competencias y habilidades</label>
                <textarea
                  value={form.competencias}
                  onChange={(e) => setForm((f) => ({ ...f, competencias: e.target.value }))}
                  rows={4}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] font-mono"
                />
              </div>
            </div>

            {errorForm && <p className="text-xs text-red-500 mt-3">{errorForm}</p>}

            <div className="flex gap-2 mt-5">
              <button
                onClick={guardarForm}
                disabled={guardando}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setMostrarForm(false)}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar empleados */}
      {asignando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAsignando(null)}>
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-bold text-[#2C1810] text-lg">Asignar empleados</h2>
              <button onClick={() => setAsignando(null)} className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none">✕</button>
            </div>
            <p className="text-sm text-[#8B6347] mb-3">{asignando.nombre}</p>

            <input
              type="text"
              placeholder="Buscar empleado..."
              value={busquedaAsignar}
              onChange={(e) => setBusquedaAsignar(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] mb-3"
            />

            <div className="flex-1 overflow-y-auto border border-[#EDE0CC] rounded-lg divide-y divide-[#EDE0CC]">
              {empleadosFiltradosAsignar.length === 0 ? (
                <p className="text-sm text-[#8B6347] italic p-3">Sin coincidencias.</p>
              ) : (
                empleadosFiltradosAsignar.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#FAF7F2] select-none">
                    <input
                      type="checkbox"
                      checked={seleccionAsignar.has(e.id)}
                      onChange={() => toggleAsignado(e.id)}
                      className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                    />
                    <span className="text-sm text-[#2C1810]">{e.nombre}</span>
                  </label>
                ))
              )}
            </div>

            <p className="text-xs text-[#B89070] mt-2">{seleccionAsignar.size} seleccionados</p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={guardarAsignacion}
                disabled={guardandoAsignacion}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
              >
                {guardandoAsignacion ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setAsignando(null)}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
