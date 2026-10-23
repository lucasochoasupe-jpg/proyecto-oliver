"use client";

// Filtro de una sola elección como fila de botoncitos ("Pendientes (3)",
// "Aprobados (10)"…) en vez de un <select>: se ve de un vistazo qué hay en
// cada estado y se cambia con un toque.
export interface OpcionPildora<T extends string> {
  value: T;
  label: string;
  cantidad?: number;
}

export default function Pildoras<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: OpcionPildora<T>[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {etiqueta && <span className="text-xs text-[#8B6347] font-medium">{etiqueta}</span>}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={etiqueta}>
        {opciones.map((o) => {
          const activa = o.value === valor;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onChange(o.value)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                activa
                  ? "bg-[#2C1810] text-white font-medium"
                  : "bg-white text-[#5C3D2E] border border-[#EDE0CC] hover:border-[#D4A843] hover:text-[#2C1810]"
              }`}
            >
              {o.label}
              {o.cantidad !== undefined && (
                <span className={`ml-1 tabular-nums ${activa ? "text-white/70" : "text-[#B89070]"}`}>({o.cantidad})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
