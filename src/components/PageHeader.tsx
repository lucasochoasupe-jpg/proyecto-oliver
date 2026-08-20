"use client";

import { useRouter } from "next/navigation";

interface Props {
  subtitle: string;
  onDisconnect?: () => void;
}

export default function PageHeader({ subtitle, onDisconnect }: Props) {
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
      <span className="text-[#D4A843] text-sm font-medium">{subtitle}</span>
      <div className="flex items-center gap-2">
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
      </div>
    </header>
  );
}
