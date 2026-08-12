"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "No se pudo iniciar sesión");
        return;
      }
      const from = searchParams.get("from") || "/";
      router.push(from);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBF6EE]">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center border border-[#EDE0CC]"
      >
        <img src="/logo.png" alt="Logo San Cayetano II" className="w-24 h-24 object-contain mx-auto mb-4" />
        <h1 className="text-xl font-bold text-[#2C1810] mb-1">Panadería San Cayetano II</h1>
        <p className="text-sm text-[#8B6347] mb-6">Ingresá para ver el panel</p>

        <div className="flex flex-col gap-3 text-left">
          <label className="text-xs font-semibold text-[#8B6347] uppercase tracking-widest">
            Usuario
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-[#EDE0CC] px-3 py-2 text-sm text-[#2C1810] font-normal normal-case tracking-normal focus:outline-none focus:border-[#D4A843]"
            />
          </label>
          <label className="text-xs font-semibold text-[#8B6347] uppercase tracking-widest">
            Contraseña
            <div className="mt-1 relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#EDE0CC] pl-3 pr-16 py-2 text-sm text-[#2C1810] font-normal normal-case tracking-normal focus:outline-none focus:border-[#D4A843]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8B6347] hover:text-[#2C1810] normal-case tracking-normal"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-full bg-[#2C1810] text-white text-sm font-semibold py-2 hover:bg-[#1A0F08] transition-colors disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
