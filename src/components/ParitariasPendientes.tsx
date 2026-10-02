"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Pendiente {
  url: string;
  convenio_id: number;
  convenio_nombre: string;
  detectada_at: number;
}

function fechaCorta(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Paritarias publicadas por AIPAR que todavía no se cargaron como escala (ver
// src/lib/paritarias.ts). En Escalas se pueden cargar/marcar/descartar; en el
// resto de las pantallas solo avisa y lleva a Escalas.
export default function ParitariasPendientes({
  onCargar,
  recargar,
}: {
  onCargar?: (convenioId: number) => void;
  recargar?: number;
}) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/paritarias");
    if (res.ok) setPendientes((await res.json()) as Pendiente[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, recargar]);

  async function marcar(url: string, estado: "cargada" | "descartada") {
    if (estado === "descartada" && !confirm("¿Descartar este aviso? No se va a volver a recordar.")) return;
    await fetch("/api/paritarias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, estado }),
    });
    cargar();
  }

  if (pendientes.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-900">
        📢 {pendientes.length === 1 ? "Hay una paritaria nueva sin cargar" : `Hay ${pendientes.length} paritarias nuevas sin cargar`}
      </p>
      {onCargar === undefined && (
        <p className="text-xs text-amber-800">
          Hasta que se cargue, los sueldos se calculan con la escala anterior.{" "}
          <Link href="/escalas" className="underline font-medium">
            Ir a Escalas salariales
          </Link>
        </p>
      )}
      <ul className="space-y-1.5">
        {pendientes.map((p) => (
          <li key={p.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-amber-900">
              {p.convenio_nombre} <span className="text-amber-700 text-xs">· publicada el {fechaCorta(p.detectada_at)}</span>
            </span>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-900 underline font-medium">
              Ver PDF
            </a>
            {onCargar && (
              <>
                <button
                  onClick={() => onCargar(p.convenio_id)}
                  className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] px-3 py-1 rounded-full font-medium"
                >
                  Cargar escala
                </button>
                <button onClick={() => marcar(p.url, "cargada")} className="text-xs text-amber-900 underline">
                  Ya la cargué
                </button>
                <button onClick={() => marcar(p.url, "descartada")} className="text-xs text-amber-700 underline">
                  Descartar
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
