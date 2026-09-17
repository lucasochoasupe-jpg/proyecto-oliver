"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

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
  tipo_pago_informal: "mensual" | "hora" | "dia" | null;
  sueldo_mensual_informal: number | null;
  valor_hora_informal: number | null;
  valor_dia_informal: number | null;
  cuil: string | null;
  legajo: string | null;
  categoria_laboral: string | null;
  banco: string | null;
  fecha_nacimiento: string | null;
  direccion: string | null;
  email: string | null;
  dni: string | null;
  estado_civil: string | null;
  nacionalidad: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  cbu: string | null;
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

function calcularEdad(fechaNacimiento: string, hoy: Date): number {
  const [anioStr, mesStr, diaStr] = fechaNacimiento.split("-");
  const nacimiento = new Date(Number(anioStr), Number(mesStr) - 1, Number(diaStr));
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const cumplioAniversario =
    hoy.getMonth() > nacimiento.getMonth() || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate());
  if (!cumplioAniversario) edad -= 1;
  return edad;
}

// Días hasta el próximo cumpleaños (0 = hoy), sin importar el año de
// nacimiento — si ya pasó este año, se compara contra el del año que viene.
function diasHastaProximoCumple(fechaNacimiento: string, hoy: Date): number {
  const [, mesStr, diaStr] = fechaNacimiento.split("-");
  const mes = Number(mesStr) - 1;
  const dia = Number(diaStr);
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let proximo = new Date(hoy.getFullYear(), mes, dia);
  if (proximo < hoySinHora) proximo = new Date(hoy.getFullYear() + 1, mes, dia);
  return Math.round((proximo.getTime() - hoySinHora.getTime()) / 86400000);
}

// El nombre siempre se guarda/muestra como "Apellido Nombre" en un solo
// campo (es la clave que se usa para emparejar asistencia/horarios/etc en
// todo el resto de la app) — acá solo se parte en dos inputs para cargarlo,
// separando por el primer espacio. Para apellidos compuestos (ej. "Ruiz
// Diaz Sol Evangelina") esta partición inicial puede no ser exacta; queda
// editable a mano en el modal.
function splitNombre(nombreCompleto: string): { apellido: string; nombre: string } {
  const espacio = nombreCompleto.indexOf(" ");
  if (espacio === -1) return { apellido: nombreCompleto, nombre: "" };
  return { apellido: nombreCompleto.slice(0, espacio), nombre: nombreCompleto.slice(espacio + 1) };
}

function joinNombre(apellido: string, nombre: string): string {
  return `${apellido.trim()} ${nombre.trim()}`.trim();
}

function Campo({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-[11px] text-[#B89070]">{label}</label>
      {children}
    </div>
  );
}


export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [saldos, setSaldos] = useState<Record<number, SaldoVacaciones>>({});
  const [loading, setLoading] = useState(true);
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [ordenAsc, setOrdenAsc] = useState(true);
  const [soloActivos, setSoloActivos] = useState(true);
  const [detalleEmpleado, setDetalleEmpleado] = useState<number | null>(null);

  // Estado de edición inline
  const [editando, setEditando] = useState<
    Record<
      number,
      {
        nombre: string;
        apellido: string;
        nombrePila: string;
        celular: string;
        tipo_pago: string;
        sueldo_mensual: string;
        valor_hora: string;
        valor_dia: string;
        fecha_ingreso: string;
        sueldo_estimado: string;
        tipo_pago_informal: string;
        sueldo_mensual_informal: string;
        valor_hora_informal: string;
        valor_dia_informal: string;
        cuil: string;
        legajo: string;
        categoria_laboral: string;
        banco: string;
        fecha_nacimiento: string;
        direccion: string;
        email: string;
        dni: string;
        estado_civil: string;
        nacionalidad: string;
        contacto_emergencia_nombre: string;
        contacto_emergencia_telefono: string;
        cbu: string;
      }
    >
  >({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);

  // Nuevo empleado
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoApellido, setNuevoApellido] = useState("");
  const [nuevoNombrePila, setNuevoNombrePila] = useState("");
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
    const { apellido, nombre: nombrePila } = splitNombre(e.nombre);
    setEditando((prev) => ({
      ...prev,
      [e.id]: {
        nombre: e.nombre,
        apellido,
        nombrePila,
        celular: e.celular ?? "",
        tipo_pago: e.tipo_pago ?? "",
        sueldo_mensual: e.sueldo_mensual !== null ? String(e.sueldo_mensual) : "",
        valor_hora: e.valor_hora !== null ? String(e.valor_hora) : "",
        valor_dia: e.valor_dia !== null ? String(e.valor_dia) : "",
        fecha_ingreso: e.fecha_ingreso ?? "",
        sueldo_estimado: e.sueldo_estimado !== null ? String(e.sueldo_estimado) : "",
        tipo_pago_informal: e.tipo_pago_informal ?? "",
        sueldo_mensual_informal: e.sueldo_mensual_informal !== null ? String(e.sueldo_mensual_informal) : "",
        valor_hora_informal: e.valor_hora_informal !== null ? String(e.valor_hora_informal) : "",
        valor_dia_informal: e.valor_dia_informal !== null ? String(e.valor_dia_informal) : "",
        cuil: e.cuil ?? "",
        legajo: e.legajo ?? "",
        categoria_laboral: e.categoria_laboral ?? "",
        banco: e.banco ?? "",
        fecha_nacimiento: e.fecha_nacimiento ?? "",
        direccion: e.direccion ?? "",
        email: e.email ?? "",
        dni: e.dni ?? "",
        estado_civil: e.estado_civil ?? "",
        nacionalidad: e.nacionalidad ?? "",
        contacto_emergencia_nombre: e.contacto_emergencia_nombre ?? "",
        contacto_emergencia_telefono: e.contacto_emergencia_telefono ?? "",
        cbu: e.cbu ?? "",
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
        tipo_pago_informal: e.tipo_pago_informal || null,
        sueldo_mensual_informal:
          e.tipo_pago_informal === "mensual" && e.sueldo_mensual_informal.trim() ? Number(e.sueldo_mensual_informal) : null,
        valor_hora_informal: e.tipo_pago_informal && e.valor_hora_informal.trim() ? Number(e.valor_hora_informal) : null,
        valor_dia_informal: e.tipo_pago_informal === "dia" && e.valor_dia_informal.trim() ? Number(e.valor_dia_informal) : null,
        cuil: e.cuil.trim() || null,
        legajo: e.legajo.trim() || null,
        categoria_laboral: e.categoria_laboral.trim() || null,
        banco: e.banco.trim() || null,
        fecha_nacimiento: e.fecha_nacimiento.trim() || null,
        direccion: e.direccion.trim() || null,
        email: e.email.trim() || null,
        dni: e.dni.trim() || null,
        estado_civil: e.estado_civil.trim() || null,
        nacionalidad: e.nacionalidad.trim() || null,
        contacto_emergencia_nombre: e.contacto_emergencia_nombre.trim() || null,
        contacto_emergencia_telefono: e.contacto_emergencia_telefono.trim() || null,
        cbu: e.cbu.trim() || null,
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
    if (!nuevoApellido.trim()) { setErrorForm("El apellido es obligatorio."); return; }
    const nombreCompleto = joinNombre(nuevoApellido, nuevoNombrePila);
    setAgregando(true);
    setErrorForm("");
    const res = await fetch("/api/empleados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreCompleto, celular: nuevoCelular.trim() || undefined }),
    });
    setAgregando(false);
    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      setErrorForm(body.error ?? "Error al agregar.");
      return;
    }
    const { id } = (await res.json()) as { id: number };
    const nuevoEmpleado: Empleado = {
      id,
      nombre: nombreCompleto,
      celular: nuevoCelular.trim() || null,
      jid: null,
      activo: 1,
      tipo_pago: null,
      sueldo_mensual: null,
      valor_hora: null,
      valor_dia: null,
      fecha_ingreso: null,
      sueldo_estimado: null,
      tipo_pago_informal: null,
      sueldo_mensual_informal: null,
      valor_hora_informal: null,
      valor_dia_informal: null,
      cuil: null,
      legajo: null,
      categoria_laboral: null,
      banco: null,
      fecha_nacimiento: null,
      direccion: null,
      email: null,
      dni: null,
      estado_civil: null,
      nacionalidad: null,
      contacto_emergencia_nombre: null,
      contacto_emergencia_telefono: null,
      cbu: null,
    };
    setNuevoApellido("");
    setNuevoNombrePila("");
    setNuevoCelular("");
    setMostrarForm(false);
    await fetchData();
    // Se abre directo el modal de detalles para completar pago/legales/nómina
    // en el momento, en vez de tener que buscarlo después en la tabla.
    startEdit(nuevoEmpleado);
    setDetalleEmpleado(id);
  }

  const filtrados = empleados
    .filter((e) => {
      if (soloActivos && !e.activo) return false;
      if (nombresFiltro.length > 0) return nombresFiltro.includes(e.nombre);
      return true;
    })
    .sort((a, b) => (ordenAsc ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre)));

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

  const hoy = new Date();
  const cumpleañosProximos = empleados
    .filter((e) => e.activo && e.fecha_nacimiento)
    .map((e) => ({ emp: e, dias: diasHastaProximoCumple(e.fecha_nacimiento!, hoy) }))
    .filter((c) => c.dias <= 6)
    .sort((a, b) => a.dias - b.dias);
  const cumpleañosHoy = cumpleañosProximos.filter((c) => c.dias === 0);
  const cumpleañosSemana = cumpleañosProximos.filter((c) => c.dias > 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Gestión de Empleados" />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Empleados</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              {activos} activos · {sinCelular > 0 && <span className="text-amber-600">{sinCelular} sin celular</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.href = "/api/empleados/export"; }}
              className="text-sm text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-4 py-2 rounded-full active:scale-95 transition-colors"
            >
              ↓ Exportar Excel
            </button>
            <button
              onClick={() => { setMostrarForm(true); setErrorForm(""); }}
              className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
            >
              + Agregar empleado
            </button>
          </div>
        </div>

        {sinCelular > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ⚠ {sinCelular} empleado{sinCelular > 1 ? "s" : ""} activo{sinCelular > 1 ? "s" : ""} sin celular registrado. El número no aparecerá en los registros de asistencia.
          </div>
        )}

        {cumpleañosProximos.length > 0 && (
          <div className="bg-pink-50 border border-pink-200 rounded-xl px-4 py-3 text-sm text-pink-700 space-y-1">
            {cumpleañosHoy.length > 0 && (
              <p>🎂 Hoy cumple{cumpleañosHoy.length > 1 ? "n" : ""} años: {cumpleañosHoy.map((c) => c.emp.nombre).join(", ")}</p>
            )}
            {cumpleañosSemana.length > 0 && (
              <p>
                🎉 Esta semana cumplen años:{" "}
                {cumpleañosSemana
                  .map((c) => `${c.emp.nombre} (en ${c.dias} día${c.dias > 1 ? "s" : ""})`)
                  .join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Formulario nuevo empleado */}
        {mostrarForm && (
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
            <h2 className="font-semibold text-[#2C1810] text-sm">Nuevo empleado</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Apellido *</label>
                <input
                  type="text"
                  placeholder="Apellido"
                  value={nuevoApellido}
                  onChange={(e) => setNuevoApellido(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregar()}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8B6347] font-medium block mb-1">Nombre</label>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={nuevoNombrePila}
                  onChange={(e) => setNuevoNombrePila(e.target.value)}
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
                onClick={() => { setMostrarForm(false); setNuevoApellido(""); setNuevoNombrePila(""); setNuevoCelular(""); setErrorForm(""); }}
                className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-1.5 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] p-3 flex flex-wrap gap-3 items-end">
          <EmpleadoMultiSelect value={nombresFiltro} onChange={setNombresFiltro} label="Buscar empleados" />
          <button
            onClick={() => setOrdenAsc((o) => !o)}
            className="text-sm text-[#8B6347] hover:text-[#2C1810] border border-[#EDE0CC] hover:border-[#D4A843] px-3 py-1.5 rounded-lg transition-colors"
            title="Cambiar orden alfabético"
          >
            {ordenAsc ? "A → Z" : "Z → A"}
          </button>
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
            <table className="text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtrados.length > 0 && selected.size === filtrados.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#D4A843] text-[#2C1810] focus:ring-[#D4A843]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Nombre y Apellido</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Celular</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Edad</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">WhatsApp</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Pago</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Vacaciones</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((emp, i) => {
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
                        <span className="font-medium text-[#2C1810]">{emp.nombre}</span>
                      </td>
                      <td className="px-4 py-2.5" data-label="Celular">
                        {emp.celular ? (
                          <span className="font-mono text-[#2C1810]">{emp.celular}</span>
                        ) : (
                          <span className="text-amber-500 italic text-xs">Sin celular</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" data-label="Edad">
                        {emp.fecha_nacimiento ? (
                          <span className="text-[#2C1810]">{calcularEdad(emp.fecha_nacimiento, hoy)}</span>
                        ) : (
                          <span className="text-[#B89070] italic text-xs">—</span>
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
                        <div className="flex flex-col gap-0.5">
                          {emp.tipo_pago === "mensual" ? (
                            <span className="text-xs text-[#2C1810]">
                              Mensual{emp.sueldo_mensual ? ` · ${formatMoneda(emp.sueldo_mensual)}` : ""}
                            </span>
                          ) : emp.tipo_pago === "hora" ? (
                            <span className="text-xs text-[#2C1810]">
                              Por hora{emp.valor_hora ? ` · ${formatMoneda(emp.valor_hora)}` : ""}
                            </span>
                          ) : emp.tipo_pago === "dia" ? (
                            <span className="text-xs text-[#2C1810]">
                              Por día{emp.valor_dia ? ` · ${formatMoneda(emp.valor_dia)}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-[#B89070] italic">Sin definir</span>
                          )}
                          {emp.tipo_pago_informal && (
                            <span className="text-xs text-[#8B6347]">
                              Informal:{" "}
                              {emp.tipo_pago_informal === "mensual"
                                ? `Mensual${emp.sueldo_mensual_informal ? ` · ${formatMoneda(emp.sueldo_mensual_informal)}` : ""}`
                                : emp.tipo_pago_informal === "hora"
                                ? `Por hora${emp.valor_hora_informal ? ` · ${formatMoneda(emp.valor_hora_informal)}` : ""}`
                                : `Por día${emp.valor_dia_informal ? ` · ${formatMoneda(emp.valor_dia_informal)}` : ""}`}
                            </span>
                          )}
                        </div>
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
                          {guardado === emp.id && <span className="text-xs text-green-600">✓</span>}
                          <button
                            onClick={() => { startEdit(emp); setDetalleEmpleado(emp.id); }}
                            className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                          >
                            Ver detalles →
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

      {detalleEmpleado !== null && editando[detalleEmpleado] && (() => {
        const emp = empleados.find((e) => e.id === detalleEmpleado);
        const ed = editando[detalleEmpleado];
        if (!emp) return null;
        return (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => { cancelEdit(emp.id); setDetalleEmpleado(null); }}
          >
            <div
              className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="font-bold text-[#2C1810] text-lg">Detalles del empleado</h2>
                <button
                  onClick={() => { cancelEdit(emp.id); setDetalleEmpleado(null); }}
                  className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="columns-1 md:columns-2 gap-4">
                <div className="bg-[#FAF7F2] rounded-xl p-3 break-inside-avoid mb-4">
                  <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Datos generales</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Apellido">
                      <input
                        type="text"
                        value={ed.apellido}
                        onChange={(e) =>
                          setEditando((p) => ({
                            ...p,
                            [emp.id]: { ...p[emp.id], apellido: e.target.value, nombre: joinNombre(e.target.value, p[emp.id].nombrePila) },
                          }))
                        }
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Nombre">
                      <input
                        type="text"
                        value={ed.nombrePila}
                        onChange={(e) =>
                          setEditando((p) => ({
                            ...p,
                            [emp.id]: { ...p[emp.id], nombrePila: e.target.value, nombre: joinNombre(p[emp.id].apellido, e.target.value) },
                          }))
                        }
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Celular">
                      <input
                        type="text"
                        value={ed.celular}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], celular: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Fecha de ingreso">
                      <input
                        type="date"
                        value={ed.fecha_ingreso}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], fecha_ingreso: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                  </div>
                  {emp.jid && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        WhatsApp vinculado
                      </span>
                      <button onClick={() => desvincular(emp.id)} className="text-xs text-red-400 hover:text-red-600 underline">
                        Desvincular
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-[#FAF7F2] rounded-xl p-3 break-inside-avoid mb-4">
                  <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Datos de nómina</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Fecha de nacimiento">
                      <input
                        type="date"
                        value={ed.fecha_nacimiento}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], fecha_nacimiento: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="DNI">
                      <input
                        type="text"
                        value={ed.dni}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], dni: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Email" className="col-span-2">
                      <input
                        type="email"
                        value={ed.email}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], email: e.target.value } }))}
                        className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Dirección" className="col-span-2">
                      <input
                        type="text"
                        value={ed.direccion}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], direccion: e.target.value } }))}
                        className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Estado civil">
                      <select
                        value={ed.estado_civil}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], estado_civil: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      >
                        <option value="">—</option>
                        <option value="Soltero/a">Soltero/a</option>
                        <option value="Casado/a">Casado/a</option>
                        <option value="Divorciado/a">Divorciado/a</option>
                        <option value="Viudo/a">Viudo/a</option>
                        <option value="Unión convivencial">Unión convivencial</option>
                      </select>
                    </Campo>
                    <Campo label="Nacionalidad">
                      <input
                        type="text"
                        value={ed.nacionalidad}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], nacionalidad: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Contacto de emergencia — nombre" className="col-span-2">
                      <input
                        type="text"
                        value={ed.contacto_emergencia_nombre}
                        onChange={(e) =>
                          setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], contacto_emergencia_nombre: e.target.value } }))
                        }
                        className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Contacto de emergencia — teléfono" className="col-span-2">
                      <input
                        type="text"
                        value={ed.contacto_emergencia_telefono}
                        onChange={(e) =>
                          setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], contacto_emergencia_telefono: e.target.value } }))
                        }
                        className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                  </div>
                </div>

                <div className="bg-[#FAF7F2] rounded-xl p-3 break-inside-avoid mb-4">
                  <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Pago blanco</h3>
                  <div className="flex flex-wrap items-end gap-2">
                    <Campo label="Tipo de pago">
                      <select
                        value={ed.tipo_pago}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], tipo_pago: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      >
                        <option value="">—</option>
                        <option value="mensual">Mensual</option>
                        <option value="hora">Por hora</option>
                        <option value="dia">Por día</option>
                      </select>
                    </Campo>
                    {ed.tipo_pago === "mensual" && (
                      <>
                        <Campo label="Sueldo mensual">
                          <input
                            type="number"
                            value={ed.sueldo_mensual}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_mensual: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                          />
                        </Campo>
                        <Campo label="Valor hora (referencia)">
                          <input
                            type="number"
                            value={ed.valor_hora}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-36"
                          />
                        </Campo>
                      </>
                    )}
                    {ed.tipo_pago === "hora" && (
                      <>
                        <Campo label="Valor hora">
                          <input
                            type="number"
                            value={ed.valor_hora}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
                          />
                        </Campo>
                        <Campo label="Sueldo estimado (tope adelantos)">
                          <input
                            type="number"
                            value={ed.sueldo_estimado}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_estimado: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-44"
                          />
                        </Campo>
                      </>
                    )}
                    {ed.tipo_pago === "dia" && (
                      <>
                        <Campo label="Valor día">
                          <input
                            type="number"
                            value={ed.valor_dia}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_dia: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
                          />
                        </Campo>
                        <Campo label="Valor hora (extra)">
                          <input
                            type="number"
                            value={ed.valor_hora}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
                          />
                        </Campo>
                        <Campo label="Sueldo estimado (tope adelantos)">
                          <input
                            type="number"
                            value={ed.sueldo_estimado}
                            onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_estimado: e.target.value } }))}
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-44"
                          />
                        </Campo>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-[#FAF7F2] rounded-xl p-3 break-inside-avoid mb-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={ed.tipo_pago_informal !== ""}
                      onChange={(e) =>
                        setEditando((p) => ({
                          ...p,
                          [emp.id]: {
                            ...p[emp.id],
                            tipo_pago_informal: e.target.checked ? p[emp.id].tipo_pago_informal || "mensual" : "",
                            ...(e.target.checked
                              ? {}
                              : { sueldo_mensual_informal: "", valor_hora_informal: "", valor_dia_informal: "" }),
                          },
                        }))
                      }
                      className="accent-[#D4A843] w-4 h-4"
                    />
                    Pago informal
                  </label>
                  {ed.tipo_pago_informal !== "" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <Campo label="Tipo de pago (informal)">
                        <select
                          value={ed.tipo_pago_informal}
                          onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], tipo_pago_informal: e.target.value } }))}
                          className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                        >
                          <option value="mensual">Mensual</option>
                          <option value="hora">Por hora</option>
                          <option value="dia">Por día</option>
                        </select>
                      </Campo>
                      {ed.tipo_pago_informal === "mensual" && (
                        <>
                          <Campo label="Sueldo mensual (informal)">
                            <input
                              type="number"
                              value={ed.sueldo_mensual_informal}
                              onChange={(e) =>
                                setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], sueldo_mensual_informal: e.target.value } }))
                              }
                              className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-36"
                            />
                          </Campo>
                          <Campo label="Valor hora (referencia)">
                            <input
                              type="number"
                              value={ed.valor_hora_informal}
                              onChange={(e) =>
                                setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora_informal: e.target.value } }))
                              }
                              className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-36"
                            />
                          </Campo>
                        </>
                      )}
                      {ed.tipo_pago_informal === "hora" && (
                        <Campo label="Valor hora (informal)">
                          <input
                            type="number"
                            value={ed.valor_hora_informal}
                            onChange={(e) =>
                              setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora_informal: e.target.value } }))
                            }
                            className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                          />
                        </Campo>
                      )}
                      {ed.tipo_pago_informal === "dia" && (
                        <>
                          <Campo label="Valor día (informal)">
                            <input
                              type="number"
                              value={ed.valor_dia_informal}
                              onChange={(e) =>
                                setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_dia_informal: e.target.value } }))
                              }
                              className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                            />
                          </Campo>
                          <Campo label="Valor hora (extra, informal)">
                            <input
                              type="number"
                              value={ed.valor_hora_informal}
                              onChange={(e) =>
                                setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], valor_hora_informal: e.target.value } }))
                              }
                              className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-36"
                            />
                          </Campo>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-[#FAF7F2] rounded-xl p-3 break-inside-avoid mb-4">
                  <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Datos legales</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="CUIL">
                      <input
                        type="text"
                        value={ed.cuil}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], cuil: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Legajo">
                      <input
                        type="text"
                        value={ed.legajo}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], legajo: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Categoría laboral">
                      <input
                        type="text"
                        value={ed.categoria_laboral}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], categoria_laboral: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="Banco">
                      <input
                        type="text"
                        value={ed.banco}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], banco: e.target.value } }))}
                        className="border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                    <Campo label="CBU" className="col-span-2">
                      <input
                        type="text"
                        value={ed.cbu}
                        onChange={(e) => setEditando((p) => ({ ...p, [emp.id]: { ...p[emp.id], cbu: e.target.value } }))}
                        className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </Campo>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={async () => { await saveEdit(emp.id); setDetalleEmpleado(null); }}
                  disabled={guardando === emp.id}
                  className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
                >
                  {guardando === emp.id ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => { cancelEdit(emp.id); setDetalleEmpleado(null); }}
                  className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
