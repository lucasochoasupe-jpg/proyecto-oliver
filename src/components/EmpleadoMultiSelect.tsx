"use client";

import { useEffect, useRef, useState } from "react";

interface Empleado {
  id: number;
  nombre: string;
}

interface Props {
  value: string[];
  onChange: (nombres: string[]) => void;
  label?: string;
}

export default function EmpleadoMultiSelect({ value, onChange, label = "Empleados" }: Props) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data: Empleado[]) => setEmpleados(data));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtrados = empleados.filter((e) =>
    e.nombre.toLowerCase().includes(filtro.toLowerCase())
  );

  function toggle(nombre: string) {
    if (value.includes(nombre)) onChange(value.filter((n) => n !== nombre));
    else onChange([...value, nombre]);
  }

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-xs text-[#8B6347] font-medium">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-56 text-left bg-white flex items-center justify-between gap-2"
      >
        <span className="truncate">
          {value.length === 0
            ? "Todos"
            : value.length === 1
            ? value[0]
            : `${value.length} seleccionados`}
        </span>
        <span className="text-[#B89070] text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-[#EDE0CC] rounded-lg shadow-lg z-20 p-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            autoFocus
            className="border border-[#EDE0CC] rounded-lg px-2 py-1 text-sm w-full mb-2 outline-none focus:border-[#D4A843]"
          />
          <div className="flex justify-between px-1 mb-1">
            <button
              type="button"
              onClick={() => onChange(filtrados.map((e) => e.nombre))}
              className="text-xs text-[#D4A843] hover:text-[#2C1810] underline"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-[#8B6347] hover:text-red-500 underline"
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtrados.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 px-1 py-1 text-sm text-[#2C1810] hover:bg-[#FAF7F2] rounded cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={value.includes(e.nombre)}
                  onChange={() => toggle(e.nombre)}
                  className="accent-[#D4A843] w-4 h-4"
                />
                {e.nombre}
              </label>
            ))}
            {filtrados.length === 0 && (
              <p className="text-xs text-[#B89070] italic px-1 py-2">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
