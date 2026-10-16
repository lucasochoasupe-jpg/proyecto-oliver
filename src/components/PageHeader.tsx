"use client";

import { usePathname, useRouter } from "next/navigation";
import { migaDePan } from "./nav";

interface Props {
  // Si no se pasa, se arma solo desde el menú ("Finanzas / Adelantos").
  subtitle?: string;
  // Solo el Chat lo pasa: desvincular borra la sesión del bot y obliga a
  // escanear el QR de nuevo, así que no tiene que estar a mano en todas las páginas.
  onDisconnect?: () => void;
}

export default function PageHeader({ subtitle, onDisconnect }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const titulo = subtitle ?? migaDePan(pathname) ?? "";

  async function handleDisconnect() {
    const ok = window.confirm(
      "¿Desvincular el WhatsApp del bot?\n\nEl bot deja de responder hasta que se vuelva a escanear el QR desde el teléfono."
    );
    if (!ok) return;
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect?.();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-[#2C1810] pl-14 pr-4 py-3 md:px-6 flex items-center justify-between gap-3 border-b border-[#1A0F08] shrink-0">
      <span className="text-[#D4A843] text-sm font-medium truncate">{titulo}</span>
      <div className="flex items-center gap-3 shrink-0">
        {onDisconnect && (
          <button
            onClick={handleDisconnect}
            className="text-xs text-[#B89070] hover:text-red-300 underline underline-offset-2 transition-colors"
          >
            Desvincular WhatsApp
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-[#D4A843] hover:text-white transition-colors font-medium border border-[#D4A843] hover:border-white px-3 py-1 rounded-full"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
