"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/empleados", label: "Empleados", icon: "👤" },
  { href: "/asistencia", label: "Asistencia", icon: "📍" },
  { href: "/horas", label: "Horas", icon: "⏱" },
  { href: "/turnos", label: "Turnos", icon: "🕒" },
  { href: "/sucursales", label: "Sucursales y QR", icon: "🏬" },
  { href: "/rrhh", label: "Panel RRHH", icon: "🗂" },
  { href: "/liquidacion", label: "Liquidación", icon: "💵" },
  { href: "/adelantos", label: "Adelantos", icon: "💸" },
  { href: "/legajos", label: "Legajos", icon: "📁" },
  { href: "/", label: "Chat", icon: "💬" },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileToggle, onMobileClose }: Props) {
  const pathname = usePathname();

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
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onMobileClose}
                title={collapsed ? link.label : undefined}
                className={`flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  collapsed ? "md:justify-center" : ""
                } ${
                  active
                    ? "bg-[#D4A843] text-[#2C1810]"
                    : "text-[#D4A843] hover:bg-[#3D2418] hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{link.icon}</span>
                <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>{link.label}</span>
              </Link>
            );
          })}
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
