"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_LINKS = [
  { href: "/empleados", label: "Empleados" },
  { href: "/asistencia", label: "Asistencia" },
  { href: "/horas", label: "Horas" },
  { href: "/sucursales", label: "Sucursales y QR" },
  { href: "/rrhh", label: "Panel RRHH" },
  { href: "/", label: "Chat" },
];

interface Props {
  subtitle: string;
  onDisconnect?: () => void;
}

export default function PageHeader({ subtitle, onDisconnect }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleDisconnect() {
    await fetch("/api/connection/disconnect", { method: "POST" });
    if (onDisconnect) {
      onDisconnect();
    } else {
      router.push("/");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-[#2C1810] px-6 py-3 flex items-center justify-between border-b border-[#1A0F08] shrink-0">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain rounded-full bg-white p-0.5" />
        <div>
          <span className="font-bold text-white text-sm leading-tight block">Panadería San Cayetano II</span>
          <span className="text-[#D4A843] text-xs">{subtitle}</span>
        </div>
      </div>
      <nav className="flex items-center gap-2">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium px-3 py-1 rounded-full active:scale-95 transition-colors border ${
                active
                  ? "bg-[#D4A843] text-[#2C1810] border-[#D4A843]"
                  : "text-[#D4A843] hover:text-white border-[#D4A843] hover:border-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <button
          onClick={handleDisconnect}
          className="text-sm text-[#D4A843] hover:text-white transition-colors font-medium border border-[#D4A843] hover:border-white px-3 py-1 rounded-full"
        >
          Desconectar
        </button>
        <button
          onClick={handleLogout}
          className="text-sm text-[#D4A843] hover:text-white transition-colors font-medium border border-[#D4A843] hover:border-white px-3 py-1 rounded-full"
        >
          Cerrar sesión
        </button>
      </nav>
    </header>
  );
}
