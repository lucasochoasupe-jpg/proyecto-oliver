"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface StatusResponse {
  status: "disconnected" | "qr" | "connecting" | "connected";
  qrPng?: string;
  phone?: string;
  updatedAt?: number;
}

interface Props {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: Props) {
  const router = useRouter();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [firstSeen] = useState<number>(() => Date.now());
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/connection/status");
      const json = (await res.json()) as StatusResponse;
      setData(json);
      if (json.status === "connected" && json.phone) {
        onConnectedRef.current(json.phone);
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2_000);
    return () => clearInterval(id);
  }, [poll]);

  const elapsed = Math.floor((Date.now() - firstSeen) / 1000);
  const showError =
    (!data || data.status === "disconnected") &&
    !data?.qrPng &&
    elapsed > 10;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBF6EE] relative">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-4 text-sm text-[#8B6347] hover:text-[#2C1810] transition-colors font-medium border border-[#EDE0CC] hover:border-[#D4A843] px-3 py-1 rounded-full"
      >
        Cerrar sesión
      </button>
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-[#EDE0CC]">
        <img src="/logo.png" alt="Logo San Cayetano II" className="w-24 h-24 object-contain mx-auto mb-4" />
        <h1 className="text-xl font-bold text-[#2C1810] mb-1">Panadería San Cayetano II</h1>
        <p className="text-sm text-[#8B6347] mb-6">
          Abrí WhatsApp en tu teléfono, andá a{" "}
          <span className="font-semibold text-[#2C1810]">Dispositivos vinculados</span> y escaneá este QR.
        </p>

        {data?.qrPng ? (
          <>
            <img
              src={data.qrPng}
              alt="Código QR para vincular WhatsApp"
              className="mx-auto rounded-xl w-64 h-64 border-2 border-[#EDE0CC]"
            />
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D4A843] animate-pulse" />
              <span className="text-sm text-[#8B6347]">Esperando escaneo...</span>
            </div>
          </>
        ) : data?.status === "connecting" ? (
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="w-2 h-2 rounded-full bg-[#D4A843] animate-pulse" />
            <span className="text-sm text-[#8B6347]">Conectando...</span>
          </div>
        ) : showError ? (
          <div className="mt-4 text-sm text-red-500">
            <p>No se pudo conectar con el bot.</p>
            <p className="mt-1 text-[#8B6347]">
              Asegurate de que el proceso bot esté corriendo:{" "}
              <code className="bg-[#F5E6C8] px-1 rounded text-[#2C1810]">npm run start:all</code>
            </p>
          </div>
        ) : (
          <div className="mt-8 flex justify-center">
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
