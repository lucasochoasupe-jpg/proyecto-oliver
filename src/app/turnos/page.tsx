"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmpleadoMultiSelect from "@/components/EmpleadoMultiSelect";

interface Empleado {
  id: number;
  nombre: string;
}

interface Sucursal {
  id: number;
  nombre: string;
}

interface HorarioEmpleado {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
}

interface TurnoTemplate {
  id: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  dias_semana: number[];
  tolerancia_min: number | null;
}

interface CumplimientoRow {
  nombre: string;
  sucursal_nombre: string;
  fecha: string;
  entrada_real: number;
  entrada_esperada: string | null;
  diff_entrada_min: number | null;
  salida_real: number | null;
  salida_esperada: string | null;
  diff_salida_min: number | null;
  en_curso: boolean;
  estado: "a_horario" | "tarde" | "salida_anticipada" | "tarde_y_anticipada" | "sin_horario";
  tolerancia_aplicada: number | null;
}

const AR_TZ = "America/Argentina/Buenos_Aires";
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Orden de visualización lunes → domingo (dia_semana sigue Date.getDay(): 0=domingo)
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

function formatHora(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("es-AR", {
    timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function formatFechaISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// Turno nocturno: la salida cae en o antes de la hora de entrada, o sea que
// cruza a la madrugada del día siguiente (ej. 22:00 → 06:00).
function esNocturno(inicio: string, fin: string): boolean {
  return horaAMinutos(fin) <= horaAMinutos(inicio);
}

function BadgeNocturno({ inicio, fin, diaSiguiente }: { inicio: string; fin: string; diaSiguiente?: string }) {
  if (!inicio || !fin || !esNocturno(inicio, fin)) return null;
  return (
    <span
      className="ml-1.5 text-xs"
      title={`Turno nocturno: cruza a la madrugada${diaSiguiente ? ` del ${diaSiguiente}` : " del día siguiente"}`}
    >
      🌙
    </span>
  );
}

const ESTADO_INFO: Record<CumplimientoRow["estado"], { label: string; className: string }> = {
  a_horario: { label: "✓ A horario", className: "bg-green-100 text-green-700 border-green-200" },
  tarde: { label: "⏰ Tarde", className: "bg-red-100 text-red-700 border-red-200" },
  salida_anticipada: { label: "⏰ Salida anticipada", className: "bg-red-100 text-red-700 border-red-200" },
  tarde_y_anticipada: { label: "⏰ Tarde y salida anticipada", className: "bg-red-100 text-red-700 border-red-200" },
  sin_horario: { label: "Sin horario definido", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

function diffLabel(min: number | null): string {
  if (min === null) return "—";
  if (min <= 0) return "a tiempo";
  return `+${min} min`;
}

const emptyEditForm: { dia_semana: number; hora_inicio: string; hora_fin: string; tolerancia_min: number | null } = {
  dia_semana: 1, hora_inicio: "08:00", hora_fin: "14:00", tolerancia_min: null,
};

export default function TurnosPage() {
  const [tab, setTab] = useState<"horarios" | "cumplimiento">("horarios");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [templates, setTemplates] = useState<TurnoTemplate[]>([]);

  // ── Turnos de un empleado (ver / editar / borrar) ──
  const [empleadoId, setEmpleadoId] = useState<number | null>(null);
  const [horarios, setHorarios] = useState<HorarioEmpleado[]>([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  // ── Plantillas de turno ──
  const [mostrarNuevaPlantilla, setMostrarNuevaPlantilla] = useState(false);
  const [plantillaForm, setPlantillaForm] = useState<{
    nombre: string; hora_inicio: string; hora_fin: string; dias_semana: number[]; tolerancia_min: number | null;
  }>({
    nombre: "", hora_inicio: "08:00", hora_fin: "14:00", dias_semana: [], tolerancia_min: null,
  });
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null);
  const [confirmDeletePlantilla, setConfirmDeletePlantilla] = useState<number | null>(null);

  // ── Asignar turno (a uno o varios empleados a la vez) ──
  const [asignEmpleados, setAsignEmpleados] = useState<string[]>([]);
  const [asignTemplateId, setAsignTemplateId] = useState<number | "custom">("custom");
  const [asignDias, setAsignDias] = useState<number[]>([]);
  const [asignHoraInicio, setAsignHoraInicio] = useState("08:00");
  const [asignHoraFin, setAsignHoraFin] = useState("14:00");
  const [asignTolerancia, setAsignTolerancia] = useState<number | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [asignOk, setAsignOk] = useState<string | null>(null);

  // ── Cumplimiento ──
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sucursalFiltro, setSucursalFiltro] = useState("Todas");
  const [nombresFiltro, setNombresFiltro] = useState<string[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState<"Todos" | CumplimientoRow["estado"]>("Todos");
  const [filas, setFilas] = useState<CumplimientoRow[] | null>(null);
  const [loadingCumplimiento, setLoadingCumplimiento] = useState(false);
  const [tolerancia, setTolerancia] = useState<number | null>(null);
  const [guardandoTolerancia, setGuardandoTolerancia] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/turno-templates");
    setTemplates((await res.json()) as TurnoTemplate[]);
  }, []);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data: Empleado[]) => {
        setEmpleados(data);
        if (data.length > 0) setEmpleadoId((prev) => prev ?? data[0].id);
      });
    fetch("/api/sucursales")
      .then((r) => r.json())
      .then((data: Sucursal[]) => setSucursales(data));
    fetchTemplates();
    fetch("/api/settings/tolerancia")
      .then((r) => r.json())
      .then((data: { tolerancia_min: number }) => setTolerancia(data.tolerancia_min));
  }, [fetchTemplates]);

  async function guardarTolerancia() {
    if (tolerancia === null) return;
    setGuardandoTolerancia(true);
    await fetch("/api/settings/tolerancia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tolerancia_min: tolerancia }),
    });
    setGuardandoTolerancia(false);
    fetchCumplimiento();
  }

  const fetchHorarios = useCallback(async () => {
    if (empleadoId === null) return;
    setLoadingHorarios(true);
    const res = await fetch(`/api/horarios?empleado_id=${empleadoId}`);
    const data = (await res.json()) as HorarioEmpleado[];
    setHorarios(
      [...data].sort(
        (a, b) => ORDEN_DIAS.indexOf(a.dia_semana) - ORDEN_DIAS.indexOf(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio)
      )
    );
    setLoadingHorarios(false);
  }, [empleadoId]);

  useEffect(() => {
    if (tab === "horarios") fetchHorarios();
  }, [tab, fetchHorarios]);

  const fetchCumplimiento = useCallback(async () => {
    setLoadingCumplimiento(true);
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (sucursalFiltro !== "Todas") params.set("sucursal", sucursalFiltro);
    if (nombresFiltro.length > 0) params.set("nombres", nombresFiltro.join(","));
    const res = await fetch(`/api/asistencia/cumplimiento?${params}`);
    const json = (await res.json()) as { desde: string; hasta: string; filas: CumplimientoRow[] };
    setFilas(json.filas);
    setLoadingCumplimiento(false);
    if (!desde) setDesde(json.desde);
    if (!hasta) setHasta(json.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalFiltro, nombresFiltro]);

  useEffect(() => {
    if (tab === "cumplimiento") fetchCumplimiento();
  }, [tab, fetchCumplimiento]);

  function startEdit(h: HorarioEmpleado) {
    setEditandoId(h.id);
    setEditForm({
      dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin,
      tolerancia_min: h.tolerancia_min,
    });
  }

  async function guardarEdit(id: number) {
    setGuardando(true);
    await fetch(`/api/horarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setGuardando(false);
    setEditandoId(null);
    fetchHorarios();
  }

  async function eliminar(id: number) {
    await fetch(`/api/horarios/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchHorarios();
  }

  async function crearPlantilla() {
    if (!plantillaForm.nombre.trim()) return;
    setGuardandoPlantilla(true);
    setErrorPlantilla(null);
    const res = await fetch("/api/turno-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plantillaForm),
    });
    setGuardandoPlantilla(false);
    if (res.ok) {
      setMostrarNuevaPlantilla(false);
      setPlantillaForm({ nombre: "", hora_inicio: "08:00", hora_fin: "14:00", dias_semana: [], tolerancia_min: null });
      fetchTemplates();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorPlantilla(data?.error ?? "No se pudo crear la plantilla.");
    }
  }

  async function eliminarPlantilla(id: number) {
    await fetch(`/api/turno-templates/${id}`, { method: "DELETE" });
    setConfirmDeletePlantilla(null);
    fetchTemplates();
  }

  function elegirTemplate(value: string) {
    if (value === "custom") {
      setAsignTemplateId("custom");
      return;
    }
    const id = Number(value);
    setAsignTemplateId(id);
    const t = templates.find((t) => t.id === id);
    if (t) {
      setAsignHoraInicio(t.hora_inicio);
      setAsignHoraFin(t.hora_fin);
      if (t.dias_semana.length > 0) setAsignDias(t.dias_semana);
      if (t.tolerancia_min !== null) setAsignTolerancia(t.tolerancia_min);
    }
  }

  function toggleDia(d: number) {
    setAsignDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function togglePlantillaDia(d: number) {
    setPlantillaForm((prev) => ({
      ...prev,
      dias_semana: prev.dias_semana.includes(d) ? prev.dias_semana.filter((x) => x !== d) : [...prev.dias_semana, d],
    }));
  }

  async function asignarTurno() {
    const empleadoIds = empleados.filter((e) => asignEmpleados.includes(e.nombre)).map((e) => e.id);
    if (empleadoIds.length === 0 || asignDias.length === 0) return;
    setAsignando(true);
    await fetch("/api/horarios/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empleado_ids: empleadoIds,
        dias_semana: asignDias,
        hora_inicio: asignHoraInicio,
        hora_fin: asignHoraFin,
        tolerancia_min: asignTolerancia,
      }),
    });
    setAsignando(false);
    setAsignOk(`Turno asignado a ${empleadoIds.length} empleado(s) en ${asignDias.length} día(s).`);
    setTimeout(() => setAsignOk(null), 4000);
    if (empleadoId !== null && empleadoIds.includes(empleadoId)) fetchHorarios();
  }

  const filasFiltradas = (filas ?? []).filter((f) => estadoFiltro === "Todos" || f.estado === estadoFiltro);
  const hayFiltrosCumplimiento = sucursalFiltro !== "Todas" || nombresFiltro.length > 0 || estadoFiltro !== "Todos";
  const puedeAsignar = asignEmpleados.length > 0 && asignDias.length > 0;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Turnos y cumplimiento" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#2C1810]">Turnos</h1>
          <div className="flex items-center gap-2 bg-white border border-[#EDE0CC] rounded-full p-1">
            {(["horarios", "cumplimiento"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                  tab === t ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
                }`}
              >
                {t === "horarios" ? "Horarios" : "Cumplimiento"}
              </button>
            ))}
          </div>
        </div>

        {tab === "horarios" && (
          <>
            {/* Plantillas de turno */}
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#2C1810]">Plantillas de turno</h2>
                <button
                  onClick={() => setMostrarNuevaPlantilla((v) => !v)}
                  className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                >
                  + Nueva plantilla
                </button>
              </div>

              {mostrarNuevaPlantilla && (
                <div className="flex flex-col gap-3 mb-3 p-3 bg-[#FAF7F2] rounded-lg">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#8B6347] font-medium">Nombre</label>
                      <input
                        type="text"
                        placeholder="Turno ventas mañana"
                        value={plantillaForm.nombre}
                        onChange={(e) => setPlantillaForm({ ...plantillaForm, nombre: e.target.value })}
                        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-56"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#8B6347] font-medium">Entrada</label>
                      <input
                        type="time"
                        value={plantillaForm.hora_inicio}
                        onChange={(e) => setPlantillaForm({ ...plantillaForm, hora_inicio: e.target.value })}
                        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#8B6347] font-medium">Salida</label>
                      <div className="flex items-center">
                        <input
                          type="time"
                          value={plantillaForm.hora_fin}
                          onChange={(e) => setPlantillaForm({ ...plantillaForm, hora_fin: e.target.value })}
                          className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                        />
                        <BadgeNocturno inicio={plantillaForm.hora_inicio} fin={plantillaForm.hora_fin} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">Días habituales (opcional — se pueden ajustar al asignar)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ORDEN_DIAS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => togglePlantillaDia(d)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                            plantillaForm.dias_semana.includes(d)
                              ? "bg-[#D4A843] border-[#D4A843] text-[#2C1810]"
                              : "border-[#EDE0CC] text-[#8B6347] hover:border-[#D4A843] bg-white"
                          }`}
                        >
                          {DIAS[d].slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#8B6347] font-medium">
                      Tolerancia particular (min) — vacío usa la general ({tolerancia ?? "..."} min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder={String(tolerancia ?? 30)}
                      value={plantillaForm.tolerancia_min ?? ""}
                      onChange={(e) =>
                        setPlantillaForm({ ...plantillaForm, tolerancia_min: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={crearPlantilla}
                      disabled={guardandoPlantilla || !plantillaForm.nombre.trim()}
                      className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
                    >
                      {guardandoPlantilla ? "Guardando..." : "Crear"}
                    </button>
                    <button
                      onClick={() => {
                        setMostrarNuevaPlantilla(false);
                        setErrorPlantilla(null);
                      }}
                      className="text-sm text-[#8B6347] hover:text-[#2C1810] underline"
                    >
                      Cancelar
                    </button>
                    {errorPlantilla && <span className="text-xs text-red-500">{errorPlantilla}</span>}
                  </div>
                </div>
              )}

              {templates.length === 0 ? (
                <p className="text-xs text-[#B89070] italic">Todavía no hay plantillas creadas.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 bg-[#FAF7F2] border border-[#EDE0CC] rounded-full pl-3 pr-2 py-1 text-xs">
                      <span className="font-medium text-[#2C1810]">{t.nombre}</span>
                      <span className="text-[#8B6347] font-mono">{t.hora_inicio}–{t.hora_fin}</span>
                      <BadgeNocturno inicio={t.hora_inicio} fin={t.hora_fin} />
                      {t.dias_semana.length > 0 && (
                        <span className="text-[#B89070]">
                          · {t.dias_semana.slice().sort((a, b) => ORDEN_DIAS.indexOf(a) - ORDEN_DIAS.indexOf(b)).map((d) => DIAS[d].slice(0, 3)).join(" ")}
                        </span>
                      )}
                      {t.tolerancia_min !== null && (
                        <span className="text-[#B89070]">· tolerancia {t.tolerancia_min} min</span>
                      )}
                      {confirmDeletePlantilla === t.id ? (
                        <>
                          <button onClick={() => eliminarPlantilla(t.id)} className="text-red-500 hover:text-red-700 font-medium">
                            Confirmar
                          </button>
                          <button onClick={() => setConfirmDeletePlantilla(null)} className="text-[#8B6347]">✕</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeletePlantilla(t.id)} className="text-red-400 hover:text-red-600" title="Eliminar plantilla">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Asignar turno (a uno o varios empleados) */}
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#2C1810]">Asignar turno</h2>

              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">Plantilla</label>
                  <select
                    value={asignTemplateId}
                    onChange={(e) => elegirTemplate(e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-48"
                  >
                    <option value="custom">Personalizado</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">Entrada</label>
                  <input
                    type="time"
                    value={asignHoraInicio}
                    onChange={(e) => setAsignHoraInicio(e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">Salida</label>
                  <div className="flex items-center">
                    <input
                      type="time"
                      value={asignHoraFin}
                      onChange={(e) => setAsignHoraFin(e.target.value)}
                      className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                    />
                    <BadgeNocturno inicio={asignHoraInicio} fin={asignHoraFin} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Días</label>
                <div className="flex flex-wrap gap-1.5">
                  {ORDEN_DIAS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDia(d)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                        asignDias.includes(d)
                          ? "bg-[#D4A843] border-[#D4A843] text-[#2C1810]"
                          : "border-[#EDE0CC] text-[#8B6347] hover:border-[#D4A843]"
                      }`}
                    >
                      {DIAS[d].slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">
                  Tolerancia particular (min) — vacío usa la general ({tolerancia ?? "..."} min)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder={String(tolerancia ?? 30)}
                  value={asignTolerancia ?? ""}
                  onChange={(e) => setAsignTolerancia(e.target.value === "" ? null : Number(e.target.value))}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
                />
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                <EmpleadoMultiSelect value={asignEmpleados} onChange={setAsignEmpleados} />
                <button
                  onClick={asignarTurno}
                  disabled={asignando || !puedeAsignar}
                  className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
                >
                  {asignando ? "Asignando..." : "Asignar turno"}
                </button>
                {asignOk && <span className="text-xs text-green-600">{asignOk}</span>}
              </div>
            </div>

            {/* Turnos de un empleado (ver / editar / borrar puntual) */}
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Ver turnos de</label>
                <select
                  value={empleadoId ?? ""}
                  onChange={(e) => setEmpleadoId(Number(e.target.value))}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-64"
                >
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
              {loadingHorarios ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
                </div>
              ) : horarios.length === 0 ? (
                <div className="text-center py-16 text-[#8B6347] text-sm">Este empleado no tiene turnos definidos.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Día</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Entrada</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Salida</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tolerancia</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {horarios.map((h, i) => {
                      const isEditing = editandoId === h.id;
                      return (
                        <tr key={h.id} className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}>
                          {isEditing ? (
                            <>
                              <td className="px-4 py-2.5">
                                <select
                                  value={editForm.dia_semana}
                                  onChange={(e) => setEditForm({ ...editForm, dia_semana: Number(e.target.value) })}
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none"
                                >
                                  {ORDEN_DIAS.map((d) => (
                                    <option key={d} value={d}>{DIAS[d]}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="time"
                                  value={editForm.hora_inicio}
                                  onChange={(e) => setEditForm({ ...editForm, hora_inicio: e.target.value })}
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center">
                                  <input
                                    type="time"
                                    value={editForm.hora_fin}
                                    onChange={(e) => setEditForm({ ...editForm, hora_fin: e.target.value })}
                                    className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none"
                                  />
                                  <BadgeNocturno inicio={editForm.hora_inicio} fin={editForm.hora_fin} />
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="number"
                                  min={0}
                                  placeholder={`General (${tolerancia ?? 30})`}
                                  value={editForm.tolerancia_min ?? ""}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, tolerancia_min: e.target.value === "" ? null : Number(e.target.value) })
                                  }
                                  className="border border-[#D4A843] rounded-lg px-2 py-1 text-sm text-[#2C1810] outline-none w-28"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-3 justify-end">
                                  <button
                                    onClick={() => guardarEdit(h.id)}
                                    disabled={guardando}
                                    className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-2 py-1 rounded font-medium active:scale-95 transition-colors"
                                  >
                                    {guardando ? "..." : "Guardar"}
                                  </button>
                                  <button onClick={() => setEditandoId(null)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2.5 font-medium text-[#2C1810]">{DIAS[h.dia_semana]}</td>
                              <td className="px-4 py-2.5 font-mono text-[#2C1810]">{h.hora_inicio}</td>
                              <td className="px-4 py-2.5 font-mono text-[#2C1810]">
                                {h.hora_fin}
                                <BadgeNocturno
                                  inicio={h.hora_inicio}
                                  fin={h.hora_fin}
                                  diaSiguiente={DIAS[(h.dia_semana + 1) % 7]}
                                />
                              </td>
                              <td className="px-4 py-2.5 text-[#8B6347]">
                                {h.tolerancia_min !== null ? `${h.tolerancia_min} min` : <span className="italic">General ({tolerancia ?? 30})</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-3 justify-end">
                                  <button onClick={() => startEdit(h)} className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium">
                                    Editar
                                  </button>
                                  {confirmDelete === h.id ? (
                                    <>
                                      <button onClick={() => eliminar(h.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded font-medium">
                                        Confirmar
                                      </button>
                                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#8B6347] underline">
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <button onClick={() => setConfirmDelete(h.id)} className="text-xs text-red-400 hover:text-red-600 underline">
                                      Eliminar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === "cumplimiento" && (
          <>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Tolerancia (min)</label>
                <input
                  type="number"
                  min={0}
                  value={tolerancia ?? ""}
                  onChange={(e) => setTolerancia(e.target.value === "" ? null : Number(e.target.value))}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-24"
                />
              </div>
              <button
                onClick={guardarTolerancia}
                disabled={guardandoTolerancia || tolerancia === null}
                className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-3 py-1.5 rounded-full font-medium active:scale-95 transition-colors"
              >
                {guardandoTolerancia ? "Guardando..." : "Guardar tolerancia"}
              </button>
              <div className="w-px self-stretch bg-[#EDE0CC]" />
              <EmpleadoMultiSelect value={nombresFiltro} onChange={setNombresFiltro} />
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
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Sucursal</label>
                <select
                  value={sucursalFiltro}
                  onChange={(e) => setSucursalFiltro(e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                >
                  <option>Todas</option>
                  {sucursales.map((s) => <option key={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Estado</label>
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value as typeof estadoFiltro)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                >
                  <option value="Todos">Todos</option>
                  {Object.entries(ESTADO_INFO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label.replace(/^[^\s]+\s/, "")}</option>
                  ))}
                </select>
              </div>
              {hayFiltrosCumplimiento && (
                <button
                  onClick={() => { setSucursalFiltro("Todas"); setNombresFiltro([]); setEstadoFiltro("Todos"); }}
                  className="text-xs text-[#8B6347] hover:text-red-500 underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
              {loadingCumplimiento ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
                </div>
              ) : filasFiltradas.length === 0 ? (
                <div className="text-center py-16 text-[#8B6347] text-sm">Ningún turno registrado en el rango seleccionado.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Sucursal</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Entrada</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Salida</th>
                      <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.map((f, i) => (
                      <tr key={`${f.nombre}-${f.entrada_real}`} className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}>
                        <td className="px-4 py-2.5 font-medium text-[#2C1810]">{f.nombre}</td>
                        <td className="px-4 py-2.5 text-[#5C3D2E]">{f.sucursal_nombre}</td>
                        <td className="px-4 py-2.5 text-[#8B6347]">{formatFechaISO(f.fecha)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-[#2C1810]">{formatHora(f.entrada_real)}</span>
                          {f.entrada_esperada && (
                            <span className="text-xs text-[#B89070] ml-1.5">
                              (esperada {f.entrada_esperada} · {diffLabel(f.diff_entrada_min)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {f.salida_real ? (
                            <span className="font-mono text-[#2C1810]">{formatHora(f.salida_real)}</span>
                          ) : (
                            <span className="italic text-amber-600 text-xs">en curso</span>
                          )}
                          {f.salida_esperada && f.salida_real && (
                            <span className="text-xs text-[#B89070] ml-1.5">
                              (esperada {f.salida_esperada} · {diffLabel(f.diff_salida_min)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ESTADO_INFO[f.estado].className}`}>
                            {ESTADO_INFO[f.estado].label}
                          </span>
                          {f.en_curso && (
                            <span className="ml-1.5 text-xs text-amber-600">⏱ en curso</span>
                          )}
                          {f.tolerancia_aplicada !== null && (
                            <span className="ml-1.5 text-xs text-[#B89070]">(tolerancia {f.tolerancia_aplicada} min)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
