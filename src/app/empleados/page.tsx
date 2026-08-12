"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";

interface Empleado {
  id: number;
  nombre: string;
  celular: string | null;
  jid: string | null;
  activo: number;
}

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  // Estado de edición inline
  const [editando, setEditando] = useState<Record<number, { nombre: string; celular: string }>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);

  // Nuevo empleado
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCelular, setNuevoCelular] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  // Confirmar eliminación
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/empleados");
    const data = (await res.json()) as Empleado[];
    setEmpleados(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function startEdit(e: Empleado) {
    setEditando((prev) => ({ ...prev, [e.id]: { nombre: e.nombre, celular: e.celular ?? "" } }));
  }

  function cancelEdit(id: number) {
    setEditando((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function saveEdit(id: number) {
    const e = editando[id];
    if (!e?.nombre.trim()) return;
    setGuardando(id);
    await fetch(`/api/empleados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: e.nombre.trim(), celular: e.celular.trim() || null }),
    });
    setGuardando(null);
    setGuardado(id);
    setTimeout(() => setGuardado(null), 2000);
    cancelEdit(id);
    fetchData();
  }

  async function toggleActivo(emp: Empleado) {
    await fetch(`/api/empleados/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: emp.activo ? 0 : 1 }),
    });
    fetchData();
  }

  async function eliminar(id: number) {
    await fetch(`/api/empleados/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchData();
  }

  async function agregar() {
    if (!nuevoNombre.trim()) { setErrorForm("El nombre es obligatorio."); return; }
    setAgregando(true);
    setErrorForm("");
    const res = await fetch("/api/empleados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoNombre.trim(), celular: nuevoCelular.trim() || undefined }),
    });
    setAgregando(false);
    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      setErrorForm(body.error ?? "Error al agregar.");
      return;
    }
    setNuevoNombre("");
    setNuevoCelular("");
    setMostrarForm(false);
    fetchData();
  }

  const filtrados = empleados.filter((e) => {
    if (soloActivos && !e.activo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return e.nombre.toLowerCase().includes(q) || (e.celular ?? "").includes(q);
    }
    return true;
  });

  async function desvincular(id: number) {
    await fetch(`/api/empleados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: null }),
    });
    fetchData();
  }

  const activos = empleados.filter((e) => e.activo).length;
  const sinCelular = empleados.filter((e) => e.activo && !e.celular).length;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Gestión de Empleados" />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Empleados</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              {activos} activos · {sinCelular > 0 && <span className="text-amber-600">{sinCelular} sin celular</span>}
            </p>
          </div>
          <button
            onClick={() => { setMostrarForm(true); setErrorForm(""); }}
            className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
          >
            + Agregar empleado
          </button>
        </div>

        {sinCelular > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ⚠ {sinCelular} empleado{sinCelular > 1 ? "s" : ""} activo{sinCelular > 1 ? "s" : ""} sin celular registrado. El número no aparecerá en los registros de asistencia.
          </div>
        )}

        {/* Formulario nuevo empleado */}
        {mostrarForm && (
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
            <h2 className="font-semibold text-[#2C1810] text-sm">Nuevo empleado</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  placeholder="Apellido Nombre"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregar()}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Celular</label>
                <input
                  type="text"
                  placeholder="3412345678"
                  value={nuevoCelular}
                  onChange={(e) => setNuevoCelular(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregar()}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
            </div>
            {errorForm && <p className="text-xs text-red-500">{errorForm}</p>}
            <div className="flex gap-2">
              <button
                onClick={agregar}
                disabled={agregando}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-1.5 rounded-lg font-medium active:scale-95 transition-colors"
              >
                {agregando ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => { setMostrarForm(false); setNuevoNombre(""); setNuevoCelular(""); setErrorForm(""); }}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-1.5 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] p-3 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar por nombre o celular..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-56"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
              className="accent-[#D4A843] w-4 h-4"
            />
            <span className="text-sm text-[#2C1810]">Solo activos</span>
          </label>
          <span className="text-xs text-[#B89070] ml-auto">{filtrados.length} empleados</span>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 text-[#8B6347] text-sm">No hay empleados que coincidan.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Nombre y Apellido</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Celular</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">WhatsApp</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((emp, i) => {
                  const isEditing = !!editando[emp.id];
                  const ed = editando[emp.id];
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"} ${!emp.activo ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={ed.nombre}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], nombre: e.target.value } }))}
                            className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-48"
                          />
                        ) : (
                          <span className="font-medium text-[#2C1810]">{emp.nombre}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="3412345678"
                            value={ed.celular}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], celular: e.target.value } }))}
                            className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-36"
                          />
                        ) : emp.celular ? (
                          <span className="font-mono text-[#2C1810]">{emp.celular}</span>
                        ) : (
                          <span className="text-amber-500 italic text-xs">Sin celular</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {emp.jid ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Vinculado</span>
                            <button onClick={() => desvincular(emp.id)} className="text-xs text-red-400 hover:text-red-600 underline">
                              Desvincular
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#B89070] italic">Sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleActivo(emp)}>
                          {emp.activo ? (
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Activo</span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-medium">Inactivo</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3 justify-end">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(emp.id)}
                                disabled={guardando === emp.id}
                                className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-2 py-1 rounded font-medium active:scale-95 transition-colors"
                              >
                                {guardando === emp.id ? "..." : "Guardar"}
                              </button>
                              <button onClick={() => cancelEdit(emp.id)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              {guardado === emp.id && <span className="text-xs text-green-600">✓</span>}
                              <button onClick={() => startEdit(emp)} className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium">
                                Editar
                              </button>
                              {confirmDelete === emp.id ? (
                                <>
                                  <button onClick={() => eliminar(emp.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded font-medium">
                                    Confirmar
                                  </button>
                                  <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#8B6347] underline">
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDelete(emp.id)} className="text-xs text-red-400 hover:text-red-600 underline">
                                  Eliminar
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
