"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  links: NavLink[];
}

// Grupos primero (para no repetir 13 links sueltos en el menú), sueltos
// después — Configuración y Chat quedan afuera de cualquier grupo porque no
// son parte de un flujo de trabajo, son utilitarios que se usan solos.
const NAV_GROUPS: NavGroup[] = [
  {
    key: "asistencia",
    label: "Asistencia",
    icon: "📍",
    links: [
      { href: "/asistencia", label: "Asistencia", icon: "📍" },
      { href: "/horas", label: "Horas", icon: "⏱" },
      { href: "/turnos", label: "Turnos", icon: "🕒" },
      { href: "/sucursales", label: "Sucursales y QR", icon: "🏬" },
    ],
  },
  {
    key: "rrhh",
    label: "RRHH",
    icon: "🗂",
    links: [
      { href: "/empleados", label: "Empleados", icon: "👤" },
      { href: "/rrhh", label: "Panel RRHH", icon: "🗂" },
      { href: "/puestos", label: "Puestos y Tareas", icon: "🧩" },
      { href: "/legajos", label: "Legajos", icon: "📁" },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: "💵",
    links: [
      { href: "/liquidacion", label: "Liquidación", icon: "💵" },
      { href: "/adelantos", label: "Adelantos", icon: "💸" },
      { href: "/caja", label: "Caja", icon: "💰" },
    ],
  },
];

const NAV_SUELTOS: NavLink[] = [
  { href: "/configuracion", label: "Configuración", icon: "⚙️" },
  { href: "/", label: "Chat", icon: "💬" },
];

function esActivo(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileToggle, onMobileClose }: Props) {
  const pathname = usePathname();
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  // El grupo que contiene la página actual arranca abierto — así al navegar
  // adentro de un grupo (ej. Caja) no hay que ir a buscarlo de nuevo.
  useEffect(() => {
    const grupoActivo = NAV_GROUPS.find((g) => g.links.some((l) => esActivo(pathname, l.href)));
    if (grupoActivo) setAbiertos((prev) => new Set(prev).add(grupoActivo.key));
  }, [pathname]);

  function toggleGrupo(key: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderLink(link: NavLink, indent = false) {
    const active = esActivo(pathname, link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onMobileClose}
        title={collapsed ? link.label : undefined}
        className={`flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          collapsed ? "md:justify-center" : indent ? "md:ml-4" : ""
        } ${active ? "bg-[#D4A843] text-[#2C1810]" : "text-[#D4A843] hover:bg-[#3D2418] hover:text-white"}`}
      >
        <span className="text-base leading-none">{link.icon}</span>
        <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>{link.label}</span>
      </Link>
    );
  }

  return (
    <>
      {/* Botón hamburguesa — solo en mobile, y solo cuando el menú está cerrado */}
      {!mobileOpen && (
        <button
          onClick={onMobileToggle}
          aria-label="Abrir menú"
          className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-[#2C1810] text-[#D4A843] shadow-lg"
        >
          <span className="text-xl leading-none">☰</span>
        </button>
      )}

      {/* Fondo oscuro para cerrar tocando afuera — solo mobile, solo si está abierto */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={onMobileClose} />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen bg-[#2C1810] border-r border-[#1A0F08] flex flex-col shrink-0 transition-transform md:transition-all duration-200 z-40 w-64 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:w-16" : "md:w-56"}`}
      >
        <div className={`flex items-center gap-2 px-3 py-3 border-b border-[#1A0F08] ${collapsed ? "md:justify-center" : ""}`}>
          <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain rounded-full bg-white p-0.5 shrink-0" />
          <span className={`font-bold text-white text-sm leading-tight ${collapsed ? "md:hidden" : ""}`}>
            Panadería San Cayetano II
          </span>
          <button onClick={onMobileClose} aria-label="Cerrar menú" className="md:hidden ml-auto text-[#D4A843] text-xl leading-none px-1">
            ✕
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto">
          {collapsed
            ? // Colapsado: se pierden las etiquetas igual, así que agrupar no suma
              // nada — se listan todos los links sueltos, uno por ícono, como antes.
              [...NAV_GROUPS.flatMap((g) => g.links), ...NAV_SUELTOS].map((link) => renderLink(link))
            : (
              <>
                {NAV_GROUPS.map((grupo) => {
                  const abierto = abiertos.has(grupo.key);
                  const grupoActivo = grupo.links.some((l) => esActivo(pathname, l.href));
                  return (
                    <div key={grupo.key}>
                      <button
                        onClick={() => toggleGrupo(grupo.key)}
                        className={`w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                          grupoActivo && !abierto ? "bg-[#3D2418] text-white" : "text-[#D4A843] hover:bg-[#3D2418] hover:text-white"
                        }`}
                      >
                        <span className="text-base leading-none">{grupo.icon}</span>
                        <span className="truncate flex-1 text-left">{grupo.label}</span>
                        <span className={`text-xs transition-transform ${abierto ? "rotate-90" : ""}`}>▸</span>
                      </button>
                      {abierto && <div className="mt-0.5 space-y-0.5">{grupo.links.map((l) => renderLink(l, true))}</div>}
                    </div>
                  );
                })}
                <div className="border-t border-[#1A0F08] my-1" />
                {NAV_SUELTOS.map((link) => renderLink(link))}
              </>
            )}
        </nav>

        <button
          onClick={onToggle}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="hidden md:flex items-center justify-center gap-2 text-[#D4A843] hover:text-white hover:bg-[#3D2418] transition-colors border-t border-[#1A0F08] py-3 text-sm font-medium"
        >
          <span>{collapsed ? "»" : "«"}</span>
          {!collapsed && <span>Colapsar</span>}
        </button>
      </aside>
    </>
  );
}
