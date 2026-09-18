"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";

interface CajaCuenta {
  id: number;
  nombre: string;
  activo: number;
  orden: number;
}

interface CajaConcepto {
  id: number;
  nombre: string;
  activo: number;
  orden: number;
}

interface CajaMovimiento {
  id: number;
  fecha: string;
  nombre: string;
  concepto_id: number;
  concepto_nombre: string;
  cuenta_id: number;
  cuenta_nombre: string;
  corresponde_a: string;
  tipo_movimiento: "ingreso" | "salida";
  importe_neto: number;
  iva: number;
  otros_conceptos: number;
  importe_total: number;
  monto_con_signo: number;
  nota: string | null;
}

interface CajaResumenCuenta {
  cuenta_id: number;
  cuenta_nombre: string;
  total: number;
}

interface CajaResumenConceptoCuenta {
  concepto_id: number;
  concepto_nombre: string;
  porCuenta: Record<number, number>;
  total: number;
}

interface CajaResumen {
  porCuenta: CajaResumenCuenta[];
  totalGeneral: number;
  porConcepto: CajaResumenConceptoCuenta[];
  cuentas: CajaCuenta[];
}

interface CajaImportSaltada {
  motivo: string;
  fecha: string | null;
  nombre: string;
  concepto: string;
  cuenta: string;
  importeNeto: number;
}

interface CajaImportFilaNueva {
  fecha: string;
  nombre: string;
  concepto: string;
  cuenta: string;
  importeNeto: number;
  tipoMovimiento: "ingreso" | "salida";
  advertencia: string | null;
}

interface CajaImportPreview {
  totalFilas: number;
  nuevas: number;
  nuevasFilas: CajaImportFilaNueva[];
  yaCargadas: number;
  saltadas: CajaImportSaltada[];
  conceptosNuevos: string[];
  cuentasNuevas: string[];
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

function hoyISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
}

function mesDeFecha(fecha: string) {
  return fecha.slice(0, 7);
}

function mesLabel(mes: string) {
  const [anio, m] = mes.split("-");
  const nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${nombres[Number(m) - 1]} ${anio}`;
}

export default function CajaPage() {
  const [modo, setModo] = useState<"resumen" | "movimientos">("movimientos");
  const [cuentas, setCuentas] = useState<CajaCuenta[]>([]);
  const [conceptos, setConceptos] = useState<CajaConcepto[]>([]);
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);
  const [resumen, setResumen] = useState<CajaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarAdmin, setMostrarAdmin] = useState(false);

  // Selector de mes (aplica a las dos pestañas) en vez de un rango de fechas
  // libre — con casi 3 meses de historial ya cargados, mostrar todo de
  // entrada hace la tabla interminable. "Ver todo el historial" lo ignora.
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [verTodoHistorial, setVerTodoHistorial] = useState(false);
  const desde = verTodoHistorial ? "" : `${mes}-01`;
  // "-31" como límite superior alcanza para cualquier mes: la comparación de
  // fechas ISO es lexicográfica, así que un mes más corto (ej. febrero) igual
  // queda bien acotado sin calcular el último día real.
  const hasta = verTodoHistorial ? "" : `${mes}-31`;

  const [filtroCuenta, setFiltroCuenta] = useState("");
  const [filtroConcepto, setFiltroConcepto] = useState("");

  const [fecha, setFecha] = useState(hoyISO());
  const [nombre, setNombre] = useState("");
  const [conceptoId, setConceptoId] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [correspondeA, setCorrespondeA] = useState(mesDeFecha(hoyISO()));
  const [tipoMovimiento, setTipoMovimiento] = useState<"ingreso" | "salida">("ingreso");
  const [importeNeto, setImporteNeto] = useState("");
  const [iva, setIva] = useState("");
  const [otrosConceptos, setOtrosConceptos] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [nuevaCuenta, setNuevaCuenta] = useState("");
  const [nuevoConcepto, setNuevoConcepto] = useState("");

  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [sheetUrlConfig, setSheetUrlConfig] = useState<string | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [editandoUrl, setEditandoUrl] = useState(false);
  const [previewImport, setPreviewImport] = useState<CajaImportPreview | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<number | null>(null);
  const [errorImport, setErrorImport] = useState("");

  const fetchListas = useCallback(async () => {
    const [rc, rk] = await Promise.all([fetch("/api/caja-config/cuentas"), fetch("/api/caja-config/conceptos")]);
    setCuentas((await rc.json()) as CajaCuenta[]);
    setConceptos((await rk.json()) as CajaConcepto[]);
  }, []);

  const fetchMovimientos = useCallback(async () => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (filtroCuenta) params.set("cuentaId", filtroCuenta);
    if (filtroConcepto) params.set("conceptoId", filtroConcepto);
    const [rm, rr] = await Promise.all([
      fetch(`/api/caja?${params}`),
      fetch(`/api/caja/resumen?${desde ? `desde=${desde}&` : ""}${hasta ? `hasta=${hasta}` : ""}`),
    ]);
    setMovimientos((await rm.json()) as CajaMovimiento[]);
    setResumen((await rr.json()) as CajaResumen);
    setLoading(false);
  }, [desde, hasta, filtroCuenta, filtroConcepto]);

  useEffect(() => {
    fetchListas();
  }, [fetchListas]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  const cuentasActivas = cuentas.filter((c) => c.activo);
  const conceptosActivos = conceptos.filter((c) => c.activo);

  function exportarExcel() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    window.location.href = `/api/caja/export?${params.toString()}`;
  }

  async function agregarMovimiento(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) {
      setError("Falta el nombre");
      return;
    }
    if (!conceptoId) {
      setError("Elegí un concepto");
      return;
    }
    if (!cuentaId) {
      setError("Elegí una cuenta");
      return;
    }
    const monto = Number(importeNeto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("El importe debe ser mayor a 0");
      return;
    }
    setGuardando(true);
    const res = await fetch("/api/caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        nombre,
        conceptoId: Number(conceptoId),
        cuentaId: Number(cuentaId),
        correspondeA,
        tipoMovimiento,
        importeNeto: monto,
        iva: iva ? Number(iva) : 0,
        otrosConceptos: otrosConceptos ? Number(otrosConceptos) : 0,
        nota,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el movimiento");
      return;
    }
    setNombre("");
    setImporteNeto("");
    setIva("");
    setOtrosConceptos("");
    setNota("");
    fetchMovimientos();
  }

  async function borrarMovimiento(id: number) {
    if (!confirm("¿Borrar este movimiento?")) return;
    await fetch(`/api/caja/${id}`, { method: "DELETE" });
    fetchMovimientos();
  }

  async function agregarCuenta(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaCuenta.trim()) return;
    const res = await fetch("/api/caja-config/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevaCuenta }),
    });
    if (res.ok) {
      setNuevaCuenta("");
      fetchListas();
    }
  }

  async function agregarConcepto(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoConcepto.trim()) return;
    const res = await fetch("/api/caja-config/conceptos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoConcepto }),
    });
    if (res.ok) {
      setNuevoConcepto("");
      fetchListas();
    }
  }

  async function toggleCuentaActiva(c: CajaCuenta) {
    await fetch(`/api/caja-config/cuentas/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !c.activo }),
    });
    fetchListas();
  }

  async function toggleConceptoActivo(c: CajaConcepto) {
    await fetch(`/api/caja-config/conceptos/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !c.activo }),
    });
    fetchListas();
  }

  const importeTotalPreview = (Number(importeNeto) || 0) + (Number(iva) || 0) + (Number(otrosConceptos) || 0);

  async function abrirImportar() {
    setMostrarImportar(true);
    setPreviewImport(null);
    setResultadoImport(null);
    setErrorImport("");
    const res = await fetch("/api/caja/import/config");
    const data = (await res.json()) as { sheetUrl: string | null };
    setSheetUrlConfig(data.sheetUrl);
    setEditandoUrl(!data.sheetUrl);
    setSheetUrlInput(data.sheetUrl ?? "");
  }

  async function guardarSheetUrl(e: React.FormEvent) {
    e.preventDefault();
    setErrorImport("");
    const res = await fetch("/api/caja/import/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetUrl: sheetUrlInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorImport(data.error ?? "No se pudo guardar el link");
      return;
    }
    setSheetUrlConfig(data.sheetUrl);
    setEditandoUrl(false);
  }

  async function previsualizarImport() {
    setCargandoPreview(true);
    setErrorImport("");
    setPreviewImport(null);
    const res = await fetch("/api/caja/import/preview", { method: "POST" });
    const data = await res.json();
    setCargandoPreview(false);
    if (!res.ok) {
      setErrorImport(data.error ?? "No se pudo leer la planilla");
      return;
    }
    setPreviewImport(data as CajaImportPreview);
  }

  async function confirmarImport() {
    setImportando(true);
    setErrorImport("");
    const res = await fetch("/api/caja/import/ejecutar", { method: "POST" });
    const data = await res.json();
    setImportando(false);
    if (!res.ok) {
      setErrorImport(data.error ?? "No se pudo importar");
      return;
    }
    setResultadoImport(data.importados);
    setPreviewImport(null);
    fetchMovimientos();
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader subtitle="Caja" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">Caja</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">
              Ingresos y egresos del negocio por cuenta y concepto — reemplaza la planilla manual.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMostrarAdmin((v) => !v)}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ⚙ Cuentas y conceptos
            </button>
            <button
              onClick={abrirImportar}
              className="text-xs text-[#8B6347] hover:text-[#2C1810] border border-[#D4A843] hover:border-[#2C1810] px-3 py-1 rounded-full active:scale-95 transition-colors"
            >
              ↻ Importar desde planilla
            </button>
            <button
              onClick={exportarExcel}
              disabled={movimientos.length === 0}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors font-medium"
            >
              ↓ Exportar Excel
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex rounded-full border border-[#EDE0CC] bg-white p-1">
            <button
              onClick={() => setModo("movimientos")}
              className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
                modo === "movimientos" ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
              }`}
            >
              Movimientos
            </button>
            <button
              onClick={() => setModo("resumen")}
              className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
                modo === "resumen" ? "bg-[#2C1810] text-white" : "text-[#8B6347] hover:text-[#2C1810]"
              }`}
            >
              Resumen
            </button>
          </div>

          <div className="flex items-center gap-2">
            {verTodoHistorial ? (
              <button
                onClick={() => setVerTodoHistorial(false)}
                className="text-xs text-[#8B6347] hover:text-[#2C1810] underline"
              >
                Volver a ver por mes
              </button>
            ) : (
              <>
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
                <button
                  onClick={() => setVerTodoHistorial(true)}
                  className="text-xs text-[#8B6347] hover:text-red-500 underline"
                >
                  Ver todo el historial
                </button>
              </>
            )}
          </div>
        </div>

        {mostrarAdmin && (
          <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#2C1810] mb-2">Cuentas</h2>
              <form onSubmit={agregarCuenta} className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Nueva cuenta..."
                  value={nuevaCuenta}
                  onChange={(e) => setNuevaCuenta(e.target.value)}
                  className="flex-1 border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
                <button type="submit" className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] px-3 py-1.5 rounded-full font-medium">
                  + Agregar
                </button>
              </form>
              <div className="space-y-1">
                {cuentas.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-[#FAF7F2]">
                    <span className={c.activo ? "text-[#2C1810]" : "text-[#B89070] line-through"}>{c.nombre}</span>
                    <button onClick={() => toggleCuentaActiva(c)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#2C1810] mb-2">Conceptos</h2>
              <form onSubmit={agregarConcepto} className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Nuevo concepto..."
                  value={nuevoConcepto}
                  onChange={(e) => setNuevoConcepto(e.target.value)}
                  className="flex-1 border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
                <button type="submit" className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] px-3 py-1.5 rounded-full font-medium">
                  + Agregar
                </button>
              </form>
              <div className="space-y-1">
                {conceptos.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-[#FAF7F2]">
                    <span className={c.activo ? "text-[#2C1810]" : "text-[#B89070] line-through"}>{c.nombre}</span>
                    <button onClick={() => toggleConceptoActivo(c)} className="text-xs text-[#8B6347] hover:text-[#2C1810] underline">
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {modo === "movimientos" && (
        <>
        <form onSubmit={agregarMovimiento} className="bg-white rounded-xl border border-[#EDE0CC] p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setCorrespondeA(mesDeFecha(e.target.value));
                }}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-[#8B6347] font-medium">Nombre</label>
              <input
                type="text"
                placeholder="Ej: Fraga, Cepro, Sueldos Karen..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Concepto</label>
              <select
                value={conceptoId}
                onChange={(e) => setConceptoId(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
              >
                <option value="">Elegir...</option>
                {conceptosActivos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Cuenta</label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
              >
                <option value="">Elegir...</option>
                {cuentasActivas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Corresponde a</label>
              <input
                type="text"
                value={correspondeA}
                onChange={(e) => setCorrespondeA(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Movimiento</label>
              <div className="flex rounded-lg border border-[#EDE0CC] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTipoMovimiento("ingreso")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    tipoMovimiento === "ingreso" ? "bg-emerald-600 text-white" : "text-[#8B6347] hover:bg-[#FAF7F2]"
                  }`}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setTipoMovimiento("salida")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    tipoMovimiento === "salida" ? "bg-red-600 text-white" : "text-[#8B6347] hover:bg-[#FAF7F2]"
                  }`}
                >
                  Salida
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Importe</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={importeNeto}
                onChange={(e) => setImporteNeto(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">IVA</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={iva}
                onChange={(e) => setIva(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#8B6347] font-medium">Otros conceptos</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={otrosConceptos}
                onChange={(e) => setOtrosConceptos(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-32"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs text-[#8B6347] font-medium">Nota (opcional)</label>
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-full"
              />
            </div>
            <p className="text-sm text-[#8B6347]">
              Total: <span className="font-semibold text-[#2C1810]">{formatMoneda(importeTotalPreview)}</span>
            </p>
            <button
              type="submit"
              disabled={guardando}
              className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-40 px-4 py-2 rounded-full transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </form>

        <div className="bg-white rounded-xl border border-[#EDE0CC] p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Cuenta</label>
            <select
              value={filtroCuenta}
              onChange={(e) => setFiltroCuenta(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
            >
              <option value="">Todas</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#8B6347] font-medium">Concepto</label>
            <select
              value={filtroConcepto}
              onChange={(e) => setFiltroConcepto(e.target.value)}
              className="border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843] w-40"
            >
              <option value="">Todos</option>
              {conceptos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        </>
        )}

        {modo === "resumen" && resumen && (
          <>
            {verTodoHistorial ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-lg px-4 py-2.5">
                <span className="text-base leading-none">✓</span>
                <p className="text-sm text-emerald-900">
                  <span className="font-bold uppercase tracking-wide">Todo el historial</span>
                  {" — "}
                  esto sí es el saldo acumulado de cada cuenta a hoy (no queda nada afuera).
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5">
                <span className="text-base leading-none">📅</span>
                <p className="text-sm text-amber-900">
                  <span className="font-bold uppercase tracking-wide">{mesLabel(mes)}</span>
                  {" — "}
                  esto es lo que se movió ESE mes, no es el saldo de la cuenta. Para ver el saldo real tocá
                  &quot;Ver todo el historial&quot; arriba.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {resumen.porCuenta.map((c) => (
                <div key={c.cuenta_id} className="bg-white rounded-xl border border-[#EDE0CC] p-4">
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">{c.cuenta_nombre}</p>
                  <p className="text-[10px] text-[#B89070] uppercase tracking-wide">
                    {verTodoHistorial ? "saldo acumulado" : `movido en ${mesLabel(mes)}`}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${c.total < 0 ? "text-red-600" : "text-[#2C1810]"}`}>{formatMoneda(c.total)}</p>
                </div>
              ))}
              <div className="bg-[#2C1810] rounded-xl p-4">
                <p className="text-xs text-[#D4A843] uppercase tracking-wide font-medium">
                  {verTodoHistorial ? "Saldo total" : "Total movido"}
                </p>
                <p className="text-[10px] text-[#B89070] uppercase tracking-wide">
                  {verTodoHistorial ? "saldo acumulado" : `movido en ${mesLabel(mes)}`}
                </p>
                <p className="text-xl font-bold text-white mt-1">{formatMoneda(resumen.totalGeneral)}</p>
              </div>
            </div>

            <p className="text-xs text-[#8B6347]">
              Movido por concepto {verTodoHistorial ? "en todo el historial" : `en ${mesLabel(mes)}`}:
            </p>

            {resumen.porConcepto.length > 0 && (
              <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                      <th className="text-left px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Concepto</th>
                      {resumen.cuentas.map((c) => (
                        <th key={c.id} className="text-right px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">
                          {c.nombre}
                        </th>
                      ))}
                      <th className="text-right px-4 py-2 text-xs text-[#8B6347] font-semibold uppercase tracking-wide whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.porConcepto.map((cn, i) => (
                      <tr key={cn.concepto_id} className={`border-b border-[#EDE0CC] ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}>
                        <td className="px-4 py-2 font-medium text-[#2C1810] whitespace-nowrap">{cn.concepto_nombre}</td>
                        {resumen.cuentas.map((c) => (
                          <td key={c.id} className="px-4 py-2 font-mono text-right text-[#5C3D2E] whitespace-nowrap">
                            {cn.porCuenta[c.id] ? formatMoneda(cn.porCuenta[c.id]) : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2 font-mono text-right font-semibold text-[#2C1810] whitespace-nowrap">
                          {formatMoneda(cn.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {modo === "movimientos" && (
        <div className="bg-white rounded-xl border border-[#EDE0CC] overflow-hidden">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
            </div>
          )}

          {!loading && movimientos.length === 0 && (
            <div className="text-center py-16 text-[#8B6347] text-sm">Sin movimientos registrados en este filtro.</div>
          )}

          {!loading && movimientos.length > 0 && (
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="border-b border-[#EDE0CC] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Concepto</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Cuenta</th>
                  <th className="text-left px-4 py-3 text-xs text-[#8B6347] font-semibold uppercase tracking-wide">Importe</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={m.id} className={`border-b border-[#EDE0CC] hover:bg-[#FAF7F2] transition-colors ${i % 2 === 0 ? "" : "bg-[#FDFAF6]"}`}>
                    <td className="px-4 py-3 text-[#5C3D2E]" data-label="Fecha">{m.fecha}</td>
                    <td className="px-4 py-3 font-medium text-[#2C1810]" data-label="Nombre">
                      {m.nombre}
                      {m.nota && <div className="text-[10px] font-normal text-[#B89070]">{m.nota}</div>}
                    </td>
                    <td className="px-4 py-3 text-[#5C3D2E]" data-label="Concepto">{m.concepto_nombre}</td>
                    <td className="px-4 py-3 text-[#5C3D2E]" data-label="Cuenta">{m.cuenta_nombre}</td>
                    <td className={`px-4 py-3 font-mono ${m.tipo_movimiento === "ingreso" ? "text-emerald-700" : "text-red-600"}`} data-label="Importe">
                      {m.tipo_movimiento === "ingreso" ? "+" : "-"} {formatMoneda(m.importe_total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => borrarMovimiento(m.id)} className="text-xs text-[#B89070] hover:text-red-500 underline">
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>

      {mostrarImportar && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setMostrarImportar(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-bold text-[#2C1810] text-lg">Importar desde planilla</h2>
              <button
                onClick={() => setMostrarImportar(false)}
                className="text-[#B89070] hover:text-[#2C1810] text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-[#8B6347] mb-3">
              Trae los movimientos nuevos de la planilla de Google Sheets — los que ya estén cargados se omiten solos.
            </p>

            {(!sheetUrlConfig || editandoUrl) && (
              <form onSubmit={guardarSheetUrl} className="space-y-2 mb-3">
                <label className="text-xs text-[#8B6347] font-medium">Link de la planilla (compartida como &quot;cualquiera con el enlace puede ver&quot;)</label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  className="w-full border border-[#EDE0CC] rounded-lg px-3 py-1.5 text-sm text-[#2C1810] outline-none focus:border-[#D4A843]"
                />
                <button
                  type="submit"
                  className="text-xs text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-1.5 rounded-full font-medium"
                >
                  Guardar link
                </button>
              </form>
            )}

            {sheetUrlConfig && !editandoUrl && (
              <div className="flex items-center justify-between bg-[#FAF7F2] rounded-lg px-3 py-2 mb-3">
                <span className="text-xs text-[#8B6347] truncate">{sheetUrlConfig}</span>
                <button
                  onClick={() => setEditandoUrl(true)}
                  className="text-xs text-[#8B6347] hover:text-[#2C1810] underline ml-2 shrink-0"
                >
                  Cambiar
                </button>
              </div>
            )}

            {sheetUrlConfig && !editandoUrl && !previewImport && resultadoImport === null && (
              <button
                onClick={previsualizarImport}
                disabled={cargandoPreview}
                className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
              >
                {cargandoPreview ? "Leyendo planilla..." : "Previsualizar"}
              </button>
            )}

            {errorImport && <p className="text-xs text-red-500 mt-2">{errorImport}</p>}

            {previewImport && (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#FAF7F2] rounded-lg p-3">
                    <p className="text-xs text-[#8B6347]">Filas nuevas</p>
                    <p className="text-xl font-bold text-[#2C1810]">{previewImport.nuevas}</p>
                  </div>
                  <div className="bg-[#FAF7F2] rounded-lg p-3">
                    <p className="text-xs text-[#8B6347]">Ya cargadas (se omiten)</p>
                    <p className="text-xl font-bold text-[#2C1810]">{previewImport.yaCargadas}</p>
                  </div>
                </div>

                {previewImport.nuevas > 0 && (
                  <div className="border border-[#EDE0CC] rounded-lg divide-y divide-[#EDE0CC] max-h-56 overflow-y-auto">
                    {previewImport.nuevasFilas.map((f, i) => (
                      <div key={i} className={`px-3 py-2 text-xs ${f.advertencia ? "bg-amber-50" : i % 2 === 0 ? "" : "bg-[#FAF7F2]"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#2C1810] font-medium truncate">{f.fecha} — {f.nombre || "(sin nombre)"}</span>
                          <span className={f.tipoMovimiento === "ingreso" ? "text-emerald-700 font-mono shrink-0" : "text-red-600 font-mono shrink-0"}>
                            {f.tipoMovimiento === "ingreso" ? "+" : "-"} {formatMoneda(f.importeNeto)}
                          </span>
                        </div>
                        <p className="text-[#8B6347]">{f.concepto} · {f.cuenta}</p>
                        {f.advertencia && <p className="text-amber-700 font-medium mt-0.5">⚠ {f.advertencia}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {previewImport.saltadas.length > 0 && (
                  <details className="text-xs text-amber-700">
                    <summary className="cursor-pointer font-medium">
                      ⚠ {previewImport.saltadas.length} fila{previewImport.saltadas.length === 1 ? "" : "s"} con problemas (no se importan)
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4 list-disc max-h-32 overflow-y-auto">
                      {previewImport.saltadas.slice(0, 30).map((s, i) => (
                        <li key={i}>
                          {s.motivo} — {s.fecha ?? "sin fecha"} / {s.nombre || "(sin nombre)"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {previewImport.cuentasNuevas.length > 0 && (
                  <p className="text-xs text-[#8B6347]">
                    <span className="font-medium text-[#2C1810]">Cuentas nuevas que se crearían:</span>{" "}
                    {previewImport.cuentasNuevas.join(", ")}
                  </p>
                )}
                {previewImport.conceptosNuevos.length > 0 && (
                  <p className="text-xs text-[#8B6347]">
                    <span className="font-medium text-[#2C1810]">Conceptos nuevos que se crearían:</span>{" "}
                    {previewImport.conceptosNuevos.join(", ")}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={confirmarImport}
                    disabled={importando || previewImport.nuevas === 0}
                    className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
                  >
                    {importando ? "Importando..." : `Confirmar importación (${previewImport.nuevas})`}
                  </button>
                  <button
                    onClick={() => setPreviewImport(null)}
                    className="text-sm text-[#8B6347] hover:text-[#2C1810] px-4 py-2 rounded-lg border border-[#EDE0CC] active:scale-95 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {resultadoImport !== null && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-emerald-700 font-medium">✓ Se importaron {resultadoImport} movimientos nuevos.</p>
                <button
                  onClick={() => setMostrarImportar(false)}
                  className="text-sm text-white bg-[#2C1810] hover:bg-[#3D2418] px-4 py-2 rounded-lg font-medium active:scale-95 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
