"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface LegajoResumen {
  empleado_id: number;
  nombre: string;
  activo: number;
  cantidad_archivos: number;
  ultimo_archivo_at: number | null;
}

function formatFecha(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function LegajosPage() {
  const [legajos, setLegajos] = useState<LegajoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);
  const [soloConArchivos, setSoloConArchivos] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/legajos");
    setLegajos((await res.json()) as LegajoResumen[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtrados = legajos.filter((l) => {
    if (soloActivos && !l.activo) return false;
    if (soloConArchivos && l.cantidad_archivos === 0) return false;
    if (busqueda) return l.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return true;
  });

  const totalArchivos = legajos.reduce((acc, l) => acc + l.cantidad_archivos, 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Legajos" />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#2C1810]">Legajos</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            {legajos.length} empleados · {totalArchivos} archivo{totalArchivos === 1 ? "" : "s"} en total
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-3 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar empleado..."
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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloConArchivos}
              onChange={(e) => setSoloConArchivos(e.target.checked)}
              className="accent-[#D4A843] w-4 h-4"
            />
            <span className="text-sm text-[#2C1810]">Solo con archivos</span>
          </label>
          <span className="text-xs text-[#B89070] ml-auto">{filtrados.length} empleados</span>
        </div>

        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 text-[#8B6347] text-sm">No hay empleados que coincidan.</div>
          ) : (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Empleado</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Archivos</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Última actualización</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr
                    key={l.empleado_id}
                    className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"} ${!l.activo ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Empleado">{l.nombre}</td>
                    <td className="px-4 py-3" data-label="Archivos">
                      {l.cantidad_archivos > 0 ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          {l.cantidad_archivos} archivo{l.cantidad_archivos === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-xs text-[#B89070] italic">Sin archivos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#8B6347]" data-label="Última actualización">
                      {l.ultimo_archivo_at ? formatFecha(l.ultimo_archivo_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/legajos/${l.empleado_id}`}
                        className="text-xs text-[#D4A843] hover:text-[#2C1810] underline font-medium"
                      >
                        Ver legajo →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
