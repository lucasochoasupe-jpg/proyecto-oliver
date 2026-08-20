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
  { href: "/", label: "Chat", icon: "💬" },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#2C1810] border-r border-[#1A0F08] flex flex-col shrink-0 transition-all duration-200 z-30 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-3 border-b border-[#1A0F08] ${collapsed ? "justify-center" : ""}`}>
        <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain rounded-full bg-white p-0.5 shrink-0" />
        {!collapsed && (
          <span className="font-bold text-white text-sm leading-tight">Panadería San Cayetano II</span>
        )}
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={`flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-[#D4A843] text-[#2C1810]"
                  : "text-[#D4A843] hover:bg-[#3D2418] hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        title={collapsed ? "Expandir menú" : "Colapsar menú"}
        className="flex items-center justify-center gap-2 text-[#D4A843] hover:text-white hover:bg-[#3D2418] transition-colors border-t border-[#1A0F08] py-3 text-sm font-medium"
      >
        <span>{collapsed ? "»" : "«"}</span>
        {!collapsed && <span>Colapsar</span>}
      </button>
    </aside>
  );
}
