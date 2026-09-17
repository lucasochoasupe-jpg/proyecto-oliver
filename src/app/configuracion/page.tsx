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
  presentismo_pct: number;
  contrib_art_pct: number;
  contrib_jubilacion_patronal_pct: number;
  contrib_obra_social_patronal_pct: number;
  contrib_seguro_vida_fijo: number;
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
      presentismo_pct: Number(form.presentismo_pct) || 0,
      contrib_art_pct: Number(form.contrib_art_pct) || 0,
      contrib_jubilacion_patronal_pct: Number(form.contrib_jubilacion_patronal_pct) || 0,
      contrib_obra_social_patronal_pct: Number(form.contrib_obra_social_patronal_pct) || 0,
      contrib_seguro_vida_fijo: Number(form.contrib_seguro_vida_fijo) || 0,
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <PctField label="Jubilación" value={form.aporte_jubilacion_pct} onChange={(v) => set("aporte_jubilacion_pct", v)} />
                <PctField label="Ley 19032 (INSSJP)" value={form.aporte_ley19032_pct} onChange={(v) => set("aporte_ley19032_pct", v)} />
                <PctField label="Obra social" value={form.aporte_obra_social_pct} onChange={(v) => set("aporte_obra_social_pct", v)} />
                <PctField label="Aporte sindical" value={form.aporte_sindical_pct} onChange={(v) => set("aporte_sindical_pct", v)} />
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
          </>
        )}
      </div>
    </div>
  );
}
