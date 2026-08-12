"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface Sucursal {
  id: number;
  nombre: string;
  lat: number | null;
  lon: number | null;
  radio_metros: number;
  qrPng: string;
  waUrl: string;
}

interface EditState {
  lat: string;
  lon: string;
  radio_metros: string;
}

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, EditState>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [qrModal, setQrModal] = useState<Sucursal | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/sucursales");
    const data = (await res.json()) as Sucursal[];
    setSucursales(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function startEdit(s: Sucursal) {
    setEditing((prev) => ({
      ...prev,
      [s.id]: {
        lat: s.lat != null ? String(s.lat) : "",
        lon: s.lon != null ? String(s.lon) : "",
        radio_metros: String(s.radio_metros),
      },
    }));
  }

  function cancelEdit(id: number) {
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function saveEdit(id: number) {
    const e = editing[id];
    if (!e) return;
    setSaving(id);
    await fetch("/api/sucursales", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        lat: e.lat !== "" ? parseFloat(e.lat) : null,
        lon: e.lon !== "" ? parseFloat(e.lon) : null,
        radio_metros: e.radio_metros !== "" ? parseInt(e.radio_metros) : 100,
      }),
    });
    setSaving(null);
    setSaved(id);
    setTimeout(() => setSaved(null), 2000);
    cancelEdit(id);
    fetchData();
  }

  const configuradas = sucursales.filter((s) => s.lat != null && s.lon != null).length;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Sucursales y QR de Asistencia" />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Sucursales</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              {configuradas} de {sucursales.length} sucursales con ubicación configurada
            </p>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
          >
            ↻ Actualizar
          </button>
        </div>

        {configuradas < sucursales.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ⚠ Las sucursales sin coordenadas no podrán validar la ubicación GPS. Completá los datos para activarlas.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sucursales.map((s) => {
              const isEditing = !!editing[s.id];
              const e = editing[s.id];
              const configurada = s.lat != null && s.lon != null;

              return (
                <div key={s.id} className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-[#2C1810] text-base">{s.nombre}</h2>
                      {configurada ? (
                        <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Activa</span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Sin ubicación</span>
                      )}
                    </div>
                    <button
                      onClick={() => setQrModal(s)}
                      className="text-xs text-[#D4A843] hover:text-[#2C1810] font-medium border border-[#D4A843] hover:border-[#2C1810] px-2 py-1 rounded-lg active:scale-95 transition-colors"
                    >
                      Ver QR
                    </button>
                  </div>

                  {!isEditing ? (
                    <div className="space-y-1">
                      <div className="flex gap-4 text-sm text-[#5C3D2E]">
                        <span><span className="text-xs text-[#8B6347]">Lat:</span> {s.lat != null ? s.lat : <span className="text-amber-500 italic">no configurada</span>}</span>
                        <span><span className="text-xs text-[#8B6347]">Lon:</span> {s.lon != null ? s.lon : <span className="text-amber-500 italic">no configurada</span>}</span>
                        <span><span className="text-xs text-[#8B6347]">Radio:</span> {s.radio_metros}m</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-[#D4A843] hover:text-[#2C1810] font-medium underline"
                        >
                          {configurada ? "Editar coordenadas" : "Cargar coordenadas"}
                        </button>
                        {saved === s.id && (
                          <span className="text-xs text-green-600 font-medium">✓ Guardado</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-[#8B6347] font-medium block mb-1">Latitud</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="-31.4201"
                            value={e.lat}
                            onChange={(ev) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], lat: ev.target.value } }))}
                            className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#8B6347] font-medium block mb-1">Longitud</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="-64.1888"
                            value={e.lon}
                            onChange={(ev) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], lon: ev.target.value } }))}
                            className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#8B6347] font-medium block mb-1">Radio (m)</label>
                          <input
                            type="number"
                            min="10"
                            max="1000"
                            value={e.radio_metros}
                            onChange={(ev) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], radio_metros: ev.target.value } }))}
                            className="w-full border border-[#EDE0CC] rounded-lg px-2 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(s.id)}
                          disabled={saving === s.id}
                          className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-3 py-1.5 rounded-lg font-medium active:scale-95 transition-colors"
                        >
                          {saving === s.id ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          onClick={() => cancelEdit(s.id)}
                          className="text-xs text-[#8B6347] hover:text-[#2C1810] px-3 py-1.5 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 text-sm text-[#5C3D2E] space-y-1">
          <p className="font-semibold text-[#2C1810] text-xs uppercase tracking-wide mb-2">¿Cómo obtener las coordenadas?</p>
          <p>1. Abrí Google Maps en la sucursal.</p>
          <p>2. Mantené presionado en el punto exacto de la entrada.</p>
          <p>3. Copiá la latitud y longitud que aparecen en la parte inferior.</p>
          <p>4. El radio recomendado es 100m (ajustá según el tamaño del local).</p>
        </div>
      </div>

      {qrModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-[#2C1810] text-lg">QR — {qrModal.nombre}</h2>
            <p className="text-xs text-[#8B6347]">Imprimí este código y pegalo en la sucursal</p>
            <img src={qrModal.qrPng} alt={`QR ${qrModal.nombre}`} className="mx-auto w-48 h-48" />
            <p className="text-xs text-[#B89070] break-all">{qrModal.waUrl}</p>
            <div className="flex gap-2">
              <a
                href={qrModal.qrPng}
                download={`QR-${qrModal.nombre}.png`}
                className="flex-1 bg-[#2C1810] text-white rounded-xl py-2 text-sm font-medium hover:bg-[#3D2418] active:scale-95 transition-colors"
              >
                Descargar QR
              </a>
              <button
                onClick={() => setQrModal(null)}
                className="flex-1 border border-[#EDE0CC] text-[#8B6347] rounded-xl py-2 text-sm font-medium hover:border-[#2C1810] active:scale-95 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
