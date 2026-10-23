"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { migaDePan } from "./nav";

interface Props {
  // Si no se pasa, se arma solo desde el menú ("Finanzas / Adelantos").
  subtitle?: string;
  // Solo el Chat lo pasa: desvincular borra la sesión del bot y obliga a
  // escanear el QR de nuevo, así que no tiene que estar a mano en todas las páginas.
  onDisconnect?: () => void;
}

// Barra fina sobre el título de cada página, en el mismo crema del fondo: la
// miga de pan y, a la derecha, las acciones de sesión. "Cerrar sesión" vive en
// el pie del menú lateral; acá solo aparece para el usuario de Producción, que
// no tiene menú.
export async function cerrarSesion(router: ReturnType<typeof useRouter>) {
  await fetch("/api/auth/logout", { method: "POST" });
  router.push("/login");
  router.refresh();
}

export default function PageHeader({ subtitle, onDisconnect }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const titulo = subtitle ?? migaDePan(pathname) ?? "";
  const [sinMenu, setSinMenu] = useState(false);

  useEffect(() => {
    setSinMenu(document.cookie.split("; ").includes("sanca_rol=produccion"));
  }, []);

  async function handleDisconnect() {
    const ok = window.confirm(
      "¿Desvincular el WhatsApp del bot?\n\nEl bot deja de responder hasta que se vuelva a escanear el QR desde el teléfono."
    );
    if (!ok) return;
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect?.();
  }

  return (
    // En el Chat (pantalla completa, sin título debajo) la barra cierra con un
    // borde; en el resto se pega al título de la página.
    <header
      className={`pl-16 pr-4 pt-5 md:px-6 flex items-center justify-between gap-3 min-h-12 shrink-0 ${
        onDisconnect ? "pb-3 border-b border-[#EDE0CC]" : "-mb-2"
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-[#B89070] truncate">{titulo}</span>
      <div className="flex items-center gap-3 shrink-0">
        {onDisconnect && (
          <button
            onClick={handleDisconnect}
            className="text-xs text-[#B89070] hover:text-red-700 transition-colors"
          >
            Desvincular WhatsApp
          </button>
        )}
        {sinMenu && (
          <button onClick={() => cerrarSesion(router)} className="btn btn-secondary">
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
}
