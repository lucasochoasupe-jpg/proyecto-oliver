"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";

interface Empleado {
  id: number;
  nombre: string;
  celular: string | null;
  jid: string | null;
  activo: number;
  tipo_pago: "mensual" | "hora" | "dia" | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null;
  fecha_ingreso: string | null;
  sueldo_estimado: number | null;
}

interface SaldoVacaciones {
  empleado_id: number;
  nombre: string;
  fecha_ingreso: string | null;
  antiguedad_anios: number | null;
  dias_asignados: number | null;
  dias_usados: number;
  saldo: number | null;
  advertencia: string | null;
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [saldos, setSaldos] = useState<Record<number, SaldoVacaciones>>({});
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  // Estado de edición inline
  const [editando, setEditando] = useState<
    Record<
      number,
      {
        nombre: string;
        celular: string;
        tipo_pago: string;
        sueldo_mensual: string;
        valor_hora: string;
        valor_dia: string;
        fecha_ingreso: string;
        sueldo_estimado: string;
      }
    >
  >({});
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    const [res, resSaldos] = await Promise.all([fetch("/api/empleados"), fetch("/api/vacaciones")]);
    const data = (await res.json()) as Empleado[];
    const saldosData = (await resSaldos.json()) as SaldoVacaciones[];
    setEmpleados(data);
    setSaldos(Object.fromEntries(saldosData.map((s) => [s.empleado_id, s])));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const idsPresentes = new Set(empleados.map((e) => e.id));
    setSelected((prev) => new Set([...prev].filter((id) => idsPresentes.has(id))));
  }, [empleados]);

  function startEdit(e: Empleado) {
    setEditando((prev) => ({
      ...prev,
      [e.id]: {
        nombre: e.nombre,
        celular: e.celular ?? "",
        tipo_pago: e.tipo_pago ?? "",
        sueldo_mensual: e.sueldo_mensual !== null ? String(e.sueldo_mensual) : "",
        valor_hora: e.valor_hora !== null ? String(e.valor_hora) : "",
        valor_dia: e.valor_dia !== null ? String(e.valor_dia) : "",
        fecha_ingreso: e.fecha_ingreso ?? "",
        sueldo_estimado: e.sueldo_estimado !== null ? String(e.sueldo_estimado) : "",
      },
    }));
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
      body: JSON.stringify({
        nombre: e.nombre.trim(),
        celular: e.celular.trim() || null,
        tipo_pago: e.tipo_pago || null,
        sueldo_mensual: e.tipo_pago === "mensual" && e.sueldo_mensual.trim() ? Number(e.sueldo_mensual) : null,
        valor_hora: e.tipo_pago && e.valor_hora.trim() ? Number(e.valor_hora) : null,
        valor_dia: e.tipo_pago === "dia" && e.valor_dia.trim() ? Number(e.valor_dia) : null,
        fecha_ingreso: e.fecha_ingreso.trim() || null,
        sueldo_estimado:
          (e.tipo_pago === "hora" || e.tipo_pago === "dia") && e.sueldo_estimado.trim() ? Number(e.sueldo_estimado) : null,
      }),
    });
    await fetchData();
    setGuardando(null);
    setGuardado(id);
    setTimeout(() => setGuardado(null), 2000);
    cancelEdit(id);
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

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelected = filtrados.length > 0 && selected.size === filtrados.length;
    setSelected(allSelected ? new Set() : new Set(filtrados.map((e) => e.id)));
  }

  async function eliminarSeleccionados() {
    setDeleting(true);
    await fetch("/api/empleados", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setConfirmBulk(false);
    setSelected(new Set());
    setDeleting(false);
    fetchData();
  }

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
        <div className="flex items-center justify-between flex-wrap gap-2">
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

        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-[#D4A843] bg-[#FDF6E3] px-4 py-2.5">
            <span className="text-sm font-medium text-[#2C1810]">{selected.size} seleccionados</span>
            {confirmBulk ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B6347]">¿Eliminar {selected.size} empleados?</span>
                <button
                  onClick={eliminarSeleccionados}
                  disabled={deleting}
                  className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? "..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setConfirmBulk(false)}
                  className="text-xs text-[#8B6347] underline hover:text-[#2C1810]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBulk(true)}
                className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600 active:scale-95"
              >
                Eliminar seleccionados
              </button>
            )}
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 text-[#8B6347] text-sm">No hay empleados que coincidan.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1150px] responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtrados.length > 0 && selected.size === filtrados.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Nombre y Apellido</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Celular</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Ingreso</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">WhatsApp</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Pago</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Vacaciones</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((emp, i) => {
                  const isEditing = !!editando[emp.id];
                  const ed = editando[emp.id];
                  const isSelected = selected.has(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"} ${!emp.activo ? "opacity-50" : ""} ${isSelected ? "bg-[#FDF6E3]" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(emp.id)}
                          className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                        />
                      </td>
                      <td className="px-4 py-2.5" data-label="Nombre y Apellido">
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
                      <td className="px-4 py-2.5" data-label="Celular">
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
                      <td className="px-4 py-2.5" data-label="Ingreso">
                        {isEditing ? (
                          <input
                            type="date"
                            value={ed.fecha_ingreso}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], fecha_ingreso: e.target.value } }))}
                            className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none"
                          />
                        ) : emp.fecha_ingreso ? (
                          <span className="text-[#2C1810]">{new Date(`${emp.fecha_ingreso}T00:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC" })}</span>
                        ) : (
                          <span className="text-amber-500 italic text-xs">Sin fecha</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" data-label="WhatsApp">
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
                      <td className="px-4 py-2.5" data-label="Pago">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={ed.tipo_pago}
                              onChange={(e) =>
                                setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], tipo_pago: e.target.value } }))
                              }
                              className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none"
                            >
                              <option value="">—</option>
                              <option value="mensual">Mensual</option>
                              <option value="hora">Por hora</option>
                              <option value="dia">Por día</option>
                            </select>
                            {ed.tipo_pago === "mensual" && (
                              <>
                                <input
                                  type="number"
                                  placeholder="Sueldo mensual"
                                  value={ed.sueldo_mensual}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_mensual: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-28"
                                />
                                <input
                                  type="number"
                                  placeholder="Valor hora (referencia)"
                                  value={ed.valor_hora}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-32"
                                />
                              </>
                            )}
                            {ed.tipo_pago === "hora" && (
                              <>
                                <input
                                  type="number"
                                  placeholder="Valor hora"
                                  value={ed.valor_hora}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-24"
                                />
                                <input
                                  type="number"
                                  placeholder="Sueldo estimado (tope adelantos)"
                                  value={ed.sueldo_estimado}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_estimado: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-40"
                                />
                              </>
                            )}
                            {ed.tipo_pago === "dia" && (
                              <>
                                <input
                                  type="number"
                                  placeholder="Valor día"
                                  value={ed.valor_dia}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_dia: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-24"
                                />
                                <input
                                  type="number"
                                  placeholder="Valor hora (extra)"
                                  value={ed.valor_hora}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-28"
                                />
                                <input
                                  type="number"
                                  placeholder="Sueldo estimado (tope adelantos)"
                                  value={ed.sueldo_estimado}
                                  onChange={(e) =>
                                    setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_estimado: e.target.value } }))
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-40"
                                />
                              </>
                            )}
                          </div>
                        ) : emp.tipo_pago === "mensual" ? (
                          <span className="text-xs text-[#2C1810]">
                            Mensual{emp.sueldo_mensual ? ` · ${formatMoneda(emp.sueldo_mensual)}` : ""}
                            {emp.valor_hora ? ` (ref. ${formatMoneda(emp.valor_hora)}/h)` : ""}
                          </span>
                        ) : emp.tipo_pago === "hora" ? (
                          <span className="text-xs text-[#2C1810]">
                            Por hora{emp.valor_hora ? ` · ${formatMoneda(emp.valor_hora)}` : ""}
                            {emp.sueldo_estimado ? ` (est. ${formatMoneda(emp.sueldo_estimado)}/mes)` : ""}
                          </span>
                        ) : emp.tipo_pago === "dia" ? (
                          <span className="text-xs text-[#2C1810]">
                            Por día{emp.valor_dia ? ` · ${formatMoneda(emp.valor_dia)}` : ""}
                            {emp.valor_hora ? ` (extra ${formatMoneda(emp.valor_hora)}/h)` : ""}
                            {emp.sueldo_estimado ? ` (est. ${formatMoneda(emp.sueldo_estimado)}/mes)` : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-[#B89070] italic">Sin definir</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" data-label="Vacaciones">
                        {(() => {
                          const s = saldos[emp.id];
                          if (!s || s.advertencia) {
                            return <span className="text-amber-500 italic text-xs">{s?.advertencia ?? "—"}</span>;
                          }
                          return (
                            <span className={`text-xs ${s.saldo !== null && s.saldo < 0 ? "text-red-500 font-medium" : "text-[#2C1810]"}`}>
                              {s.dias_usados}/{s.dias_asignados} días
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5" data-label="Estado">
                        <button onClick={() => toggleActivo(emp)}>
                          {emp.activo ? (
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Activo</span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-medium">Inactivo</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
