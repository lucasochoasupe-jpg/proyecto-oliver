"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

interface ConfiguracionLiquidacion {
  empresa_razon_social: string | null;
  empresa_domicilio: string | null;
  empresa_cuit: string | null;
  banco_default: string | null;
  obra_social_codigo: string | null;
  obra_social_nombre: string | null;
  aporte_jubilacion_pct: number;
  aporte_ley19032_pct: number;
  aporte_obra_social_pct: number;
  aporte_sindical_pct: number;
  aporte_sepelio_pct: number;
  presentismo_pct: number;
  contrib_art_pct: number;
  contrib_jubilacion_patronal_pct: number;
  contrib_obra_social_patronal_pct: number;
  contrib_seguro_vida_fijo: number;
  contrib_art_fijo: number;
  detraccion_contribucion: number;
}

type FormState = { [K in keyof ConfiguracionLiquidacion]: string };

function toForm(c: ConfiguracionLiquidacion): FormState {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null ? "" : String(v)])) as FormState;
}

function TextField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#8B6347] font-medium">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
      />
    </div>
  );
}

function PctField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#8B6347] font-medium">{label} (%)</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
      />
    </div>
  );
}

interface Convenio {
  id: number;
  codigo: string;
  nombre: string;
  presentismo_pct: number;
  aporte_sindical_pct: number;
  aporte_sepelio_pct: number;
  aporte_colonia_pct: number;
  unidades_sueldo: number;
}

type ConvenioForm = {
  [K in "presentismo_pct" | "aporte_sindical_pct" | "aporte_sepelio_pct" | "aporte_colonia_pct" | "unidades_sueldo"]: string;
};

// Los % de cada convenio pisan, para los empleados que lo tienen asignado en
// su ficha, el presentismo y los aportes sindicales de arriba. Cada fila se
// guarda por separado.
function ConveniosSection() {
  const [convenios, setConvenios] = useState<Convenio[] | null>(null);
  const [forms, setForms] = useState<Record<number, ConvenioForm>>({});
  const [guardado, setGuardado] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/convenios")
      .then((r) => r.json())
      .then((cs: Convenio[]) => {
        setConvenios(cs);
        setForms(
          Object.fromEntries(
            cs.map((c) => [
              c.id,
              {
                presentismo_pct: String(c.presentismo_pct),
                aporte_sindical_pct: String(c.aporte_sindical_pct),
                aporte_sepelio_pct: String(c.aporte_sepelio_pct),
                aporte_colonia_pct: String(c.aporte_colonia_pct),
                unidades_sueldo: String(c.unidades_sueldo),
              },
            ])
          )
        );
      });
  }, []);

  function set(id: number, key: keyof ConvenioForm, value: string) {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function guardar(id: number) {
    const f = forms[id];
    await fetch(`/api/convenios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presentismo_pct: Number(f.presentismo_pct) || 0,
        aporte_sindical_pct: Number(f.aporte_sindical_pct) || 0,
        aporte_sepelio_pct: Number(f.aporte_sepelio_pct) || 0,
        aporte_colonia_pct: Number(f.aporte_colonia_pct) || 0,
        unidades_sueldo: Number(f.unidades_sueldo) > 0 ? Number(f.unidades_sueldo) : 30,
      }),
    });
    setGuardado(id);
    setTimeout(() => setGuardado(null), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
      <h2 className="text-sm font-semibold text-[#2C1810]">Convenios colectivos</h2>
      <p className="text-xs text-[#8B6347]">
        A cada empleado se le asigna su convenio en la ficha (Empleados → Datos legales). Estos porcentajes reemplazan al
        presentismo y a los aportes sindicales generales de arriba.
      </p>
      {!convenios ? (
        <p className="text-sm text-[#B89070]">Cargando...</p>
      ) : (
        convenios.map((c) => (
          <div key={c.id} className="pt-3 border-t border-[#F0E4D8] first:border-t-0 first:pt-0 space-y-2">
            <p className="text-sm font-medium text-[#2C1810]">{c.nombre}</p>
            <div className="flex flex-wrap items-end gap-3">
              <PctField label="Presentismo" value={forms[c.id].presentismo_pct} onChange={(v) => set(c.id, "presentismo_pct", v)} />
              <PctField label="Aporte sindical" value={forms[c.id].aporte_sindical_pct} onChange={(v) => set(c.id, "aporte_sindical_pct", v)} />
              <PctField label="Fdo. comp. y sepelio" value={forms[c.id].aporte_sepelio_pct} onChange={(v) => set(c.id, "aporte_sepelio_pct", v)} />
              <PctField label="Colonia de vacaciones" value={forms[c.id].aporte_colonia_pct} onChange={(v) => set(c.id, "aporte_colonia_pct", v)} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8B6347] font-medium">Días que liquida el sueldo (de 30)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="30"
                  value={forms[c.id].unidades_sueldo}
                  onChange={(e) => set(c.id, "unidades_sueldo", e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-20"
                />
              </div>
              <button
                onClick={() => guardar(c.id)}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
              >
                Guardar
              </button>
              {guardado === c.id && <span className="text-sm text-emerald-600 pb-2">✓ Guardado</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

interface Feriado {
  fecha: string;
  nombre: string;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function formatFeriado(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${DIAS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]} ${dia}/${mes}/${anio}`;
}

// Un turno que cae en uno de estos días y no se trabaja no cuenta como falta:
// no se descuenta ni hace perder presentismo (ver calcularAusencias). Se
// guarda al instante, aparte del botón "Guardar" de los porcentajes.
function FeriadosSection() {
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [feriados, setFeriados] = useState<Feriado[] | null>(null);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cargar(a: number) {
    const res = await fetch(`/api/feriados?desde=${a}-01-01&hasta=${a}-12-31`);
    setFeriados((await res.json()) as Feriado[]);
  }

  useEffect(() => {
    setFeriados(null);
    cargar(anio);
  }, [anio]);

  async function agregar() {
    setError(null);
    const res = await fetch("/api/feriados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, nombre }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar");
      return;
    }
    setFecha("");
    setNombre("");
    const anioNuevo = Number(fecha.slice(0, 4));
    if (anioNuevo === anio) cargar(anio);
    else setAnio(anioNuevo);
  }

  async function borrar(f: Feriado) {
    if (!confirm(`¿Quitar el feriado "${f.nombre}" (${formatFeriado(f.fecha)})?`)) return;
    await fetch(`/api/feriados?fecha=${f.fecha}`, { method: "DELETE" });
    cargar(anio);
  }

  return (
    <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#2C1810]">Feriados</h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-0.5 rounded-full text-[#8B6347] hover:bg-[#F5EDE0]">
            ‹
          </button>
          <span className="font-medium text-[#2C1810] tabular-nums">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-0.5 rounded-full text-[#8B6347] hover:bg-[#F5EDE0]">
            ›
          </button>
        </div>
      </div>
      <p className="text-xs text-[#8B6347]">
        Si un empleado tiene turno en un feriado y no va, no cuenta como falta: no se le descuenta ni pierde el presentismo.
      </p>

      {!feriados ? (
        <p className="text-sm text-[#B89070]">Cargando...</p>
      ) : feriados.length === 0 ? (
        <p className="text-sm text-[#B89070]">No hay feriados cargados para {anio}.</p>
      ) : (
        <ul className="divide-y divide-[#F0E4D8]">
          {feriados.map((f) => (
            <li key={f.fecha} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="font-mono text-[#5C3D2E] mr-3">{formatFeriado(f.fecha)}</span>
                <span className="text-[#2C1810]">{f.nombre}</span>
              </span>
              <button onClick={() => borrar(f)} className="text-xs text-red-600 hover:text-red-700 shrink-0">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-[#F0E4D8]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#8B6347] font-medium">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label className="text-xs text-[#8B6347] font-medium">Nombre</label>
          <input
            type="text"
            value={nombre}
            placeholder="Ej. Día no laborable con fines turísticos"
            onChange={(e) => setNombre(e.target.value)}
            className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
          />
        </div>
        <button
          onClick={agregar}
          disabled={!fecha || !nombre.trim()}
          className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
        >
          Agregar
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ConfiguracionPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion-liquidacion")
      .then((r) => r.json())
      .then((c: ConfiguracionLiquidacion) => setForm(toForm(c)));
  }, []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    const body: Partial<ConfiguracionLiquidacion> = {
      empresa_razon_social: form.empresa_razon_social || null,
      empresa_domicilio: form.empresa_domicilio || null,
      empresa_cuit: form.empresa_cuit || null,
      banco_default: form.banco_default || null,
      obra_social_codigo: form.obra_social_codigo || null,
      obra_social_nombre: form.obra_social_nombre || null,
      aporte_jubilacion_pct: Number(form.aporte_jubilacion_pct) || 0,
      aporte_ley19032_pct: Number(form.aporte_ley19032_pct) || 0,
      aporte_obra_social_pct: Number(form.aporte_obra_social_pct) || 0,
      aporte_sindical_pct: Number(form.aporte_sindical_pct) || 0,
      aporte_sepelio_pct: Number(form.aporte_sepelio_pct) || 0,
      presentismo_pct: Number(form.presentismo_pct) || 0,
      contrib_art_pct: Number(form.contrib_art_pct) || 0,
      contrib_jubilacion_patronal_pct: Number(form.contrib_jubilacion_patronal_pct) || 0,
      contrib_obra_social_patronal_pct: Number(form.contrib_obra_social_patronal_pct) || 0,
      contrib_seguro_vida_fijo: Number(form.contrib_seguro_vida_fijo) || 0,
      contrib_art_fijo: Number(form.contrib_art_fijo) || 0,
      detraccion_contribucion: Number(form.detraccion_contribucion) || 0,
    };
    await fetch("/api/configuracion-liquidacion", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Configuración" />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Configuración de liquidación</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            Datos de la empresa y porcentajes de aportes/contribuciones — únicos para toda la empresa, se usan para
            calcular la parte blanca de la liquidación y para generar el recibo.
          </p>
        </div>

        {!form ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#2C1810]">Datos de la empresa</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TextField label="Razón social" value={form.empresa_razon_social} onChange={(v) => set("empresa_razon_social", v)} placeholder="GARCIA EDUARDO MANUEL" />
                <TextField label="CUIT" value={form.empresa_cuit} onChange={(v) => set("empresa_cuit", v)} placeholder="20-12112871-4" />
                <TextField label="Domicilio" value={form.empresa_domicilio} onChange={(v) => set("empresa_domicilio", v)} placeholder="Montevideo 6270, 2000 Rosario" />
                <TextField label="Banco (default)" value={form.banco_default} onChange={(v) => set("banco_default", v)} placeholder="BBVA ARGENTINA S.A." />
                <TextField label="Código obra social" value={form.obra_social_codigo} onChange={(v) => set("obra_social_codigo", v)} placeholder="113908" />
                <TextField label="Nombre obra social" value={form.obra_social_nombre} onChange={(v) => set("obra_social_nombre", v)} placeholder="OS DEL PERSONAL DE PANADERIAS" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#2C1810]">Aportes del empleado (se descuentan del sueldo)</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <PctField label="Jubilación" value={form.aporte_jubilacion_pct} onChange={(v) => set("aporte_jubilacion_pct", v)} />
                <PctField label="Ley 19032 (INSSJP)" value={form.aporte_ley19032_pct} onChange={(v) => set("aporte_ley19032_pct", v)} />
                <PctField label="Obra social" value={form.aporte_obra_social_pct} onChange={(v) => set("aporte_obra_social_pct", v)} />
                <PctField label="Aporte sindical" value={form.aporte_sindical_pct} onChange={(v) => set("aporte_sindical_pct", v)} />
                <PctField label="Fdo. comp. y sepelio" value={form.aporte_sepelio_pct} onChange={(v) => set("aporte_sepelio_pct", v)} />
              </div>
              <div className="pt-2 border-t border-[#F0E4D8]">
                <PctField label="Presentismo (adicional, se pierde entero con 1+ ausencia/tardanza)" value={form.presentismo_pct} onChange={(v) => set("presentismo_pct", v)} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#2C1810]">Contribuciones del empleador (costo, no se descuenta del sueldo)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <PctField label="ART" value={form.contrib_art_pct} onChange={(v) => set("contrib_art_pct", v)} />
                <PctField label="Jubilación patronal" value={form.contrib_jubilacion_patronal_pct} onChange={(v) => set("contrib_jubilacion_patronal_pct", v)} />
                <PctField label="Obra social patronal" value={form.contrib_obra_social_patronal_pct} onChange={(v) => set("contrib_obra_social_patronal_pct", v)} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">Seguro de vida (monto fijo)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.contrib_seguro_vida_fijo}
                    onChange={(e) => set("contrib_seguro_vida_fijo", e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">ART (monto fijo por empleado)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.contrib_art_fijo}
                    onChange={(e) => set("contrib_art_fijo", e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#8B6347] font-medium">Detracción contribución jubilatoria</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.detraccion_contribucion}
                    onChange={(e) => set("detraccion_contribucion", e.target.value)}
                    className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={guardar}
                disabled={guardando}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-full font-medium active:scale-95 transition-colors"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              {guardado && <span className="text-sm text-emerald-600">✓ Guardado</span>}
            </div>

            <ConveniosSection />

            <FeriadosSection />
          </>
        )}
      </div>
    </div>
  );
}
