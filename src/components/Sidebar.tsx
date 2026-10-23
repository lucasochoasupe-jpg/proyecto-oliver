"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import NavIcon from "./NavIcon";
import { cerrarSesion } from "./PageHeader";
import { NAV_GROUPS, NAV_INICIO, NAV_SUELTOS, esActivo, type NavLink } from "./nav";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileToggle, onMobileClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
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
        <NavIcon name={link.icon} />
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
          <NavIcon name="menu" className="w-5 h-5" />
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
          <span className={`font-display font-semibold text-white text-[15px] leading-tight ${collapsed ? "md:hidden" : ""}`}>
            Panadería San Cayetano II
          </span>
          <button onClick={onMobileClose} aria-label="Cerrar menú" className="md:hidden ml-auto text-[#D4A843] px-1">
            <NavIcon name="x" className="w-5 h-5" />
          </button>
        </div>

        <nav className="sidebar-scroll flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto">
          {collapsed
            ? // Colapsado: se pierden las etiquetas igual, así que agrupar no suma
              // nada — se listan todos los links sueltos, uno por ícono, como antes.
              [NAV_INICIO, ...NAV_GROUPS.flatMap((g) => g.links), ...NAV_SUELTOS].map((link) => renderLink(link))
            : (
              <>
                {renderLink(NAV_INICIO)}
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
                        <NavIcon name={grupo.icon} />
                        <span className="truncate flex-1 text-left">{grupo.label}</span>
                        <NavIcon name="chevron" className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-90" : ""}`} />
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
          onClick={() => cerrarSesion(router)}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`mx-2 mb-1 flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg text-[#B89070] hover:bg-[#3D2418] hover:text-white transition-colors ${
            collapsed ? "md:justify-center" : ""
          }`}
        >
          <NavIcon name="logout" />
          <span className={collapsed ? "md:hidden" : ""}>Cerrar sesión</span>
        </button>

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
