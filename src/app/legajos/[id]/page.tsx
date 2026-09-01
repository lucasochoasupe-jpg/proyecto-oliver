"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface Empleado {
  id: number;
  nombre: string;
  activo: number;
}

interface LegajoArchivo {
  id: number;
  empleado_id: number;
  nombre_original: string;
  mimetype: string;
  tamanio_bytes: number;
  origen: "certificado_bot" | "manual";
  subido_por: string | null;
  created_at: number;
}

function formatFecha(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTamanio(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LegajoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [archivos, setArchivos] = useState<LegajoArchivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/legajos/${id}`);
    if (!res.ok) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { empleado: Empleado; archivos: LegajoArchivo[] };
    setEmpleado(data.empleado);
    setArchivos(data.archivos);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function subirArchivo(file: File) {
    setErrorSubida("");
    setSubiendo(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/legajos/${id}`, { method: "POST", body: formData });
    setSubiendo(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorSubida(body?.error ?? "Error al subir el archivo.");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchData();
  }

  async function eliminar(archivoId: number) {
    await fetch(`/api/legajos/${id}/${archivoId}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchData();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !empleado) {
    return (
      <div className="min-h-screen bg-[#FAF7F2]">
        <PageHeader subtitle="Legajos" />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-[#8B6347]">Empleado no encontrado.</p>
          <Link href="/legajos" className="text-sm text-[#D4A843] underline">← Volver a Legajos</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Legajos" />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <button onClick={() => router.push("/legajos")} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline mb-2">
            ← Volver a Legajos
          </button>
          <h1 className="text-xl font-bold text-[#2C1810]">{empleado.nombre}</h1>
          <p className="text-sm text-[#8B6347] mt-0.5">
            {archivos.length} archivo{archivos.length === 1 ? "" : "s"} en el legajo
            {!empleado.activo && <span className="ml-2 text-amber-600">(empleado inactivo)</span>}
          </p>
        </div>

        {/* Subir archivo */}
        <div
          className={`bg-white rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            arrastrando ? "border-[#D4A843] bg-[#FAF3E3]" : "border-[#EDE0CC]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const file = e.dataTransfer.files?.[0];
            if (file) subirArchivo(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) subirArchivo(file);
            }}
          />
          <p className="text-sm text-[#8B6347] mb-2">Arrastrá un archivo acá, o</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendo}
            className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-1.5 rounded-lg font-medium active:scale-95 transition-colors"
          >
            {subiendo ? "Subiendo..." : "Elegir archivo"}
          </button>
          <p className="text-xs text-[#B89070] mt-2">Máximo 20 MB por archivo.</p>
          {errorSubida && <p className="text-xs text-red-500 mt-2">{errorSubida}</p>}
        </div>

        {/* Lista de archivos */}
        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {archivos.length === 0 ? (
            <div className="text-center py-16 text-[#8B6347] text-sm">Todavía no hay archivos en este legajo.</div>
          ) : (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Archivo</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Origen</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Tamaño</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((a, i) => (
                  <tr key={a.id} className={`border-b border-[#EDE0CC] ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}>
                    <td className="px-4 py-2.5" data-label="Archivo">
                      <a
                        href={`/api/legajos/${id}/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#2C1810] hover:text-[#D4A843] hover:underline"
                      >
                        {a.nombre_original}
                      </a>
                    </td>
                    <td className="px-4 py-2.5" data-label="Origen">
                      {a.origen === "certificado_bot" ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                          📎 Certificado (WhatsApp)
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                          Subido manualmente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#8B6347]" data-label="Fecha">{formatFecha(a.created_at)}</td>
                    <td className="px-4 py-2.5 text-[#8B6347] font-mono text-xs" data-label="Tamaño">{formatTamanio(a.tamanio_bytes)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {confirmDelete === a.id ? (
                        <span className="inline-flex items-center gap-2">
                          <button onClick={() => eliminar(a.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded font-medium">
                            Confirmar
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#8B6347] underline">
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(a.id)} className="text-xs text-red-400 hover:text-red-600 underline">
                          Eliminar
                        </button>
                      )}
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
