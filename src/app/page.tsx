"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface InicioData {
  hoy: string;
  inicioMes: string;
  asistencia: {
    trabajando: { nombre: string; sucursal: string; entrada: number }[];
    tarde: { nombre: string; sucursal: string; minutos: number }[];
    faltas: { nombre: string; sucursal: string | null; horario: string; justificada: boolean }[];
    porSucursal: Record<string, { trabajando: number; fichadas: number }>;
    fichadas: number;
  };
  pendientes: {
    pedidosRRHH: { nombre: string; tipo: string; desde: string | null; hasta: string | null }[];
    certificados: { nombre: string; desde: string | null }[];
    adelantosPedidos: { nombre: string; monto: number; fechaPago: string }[];
    marcacionesConProblemas: number;
  };
  avisos: {
    whatsapp: { status: string; phone: string | null };
    sinHorario: number;
    sinTipoPago: number;
    sinCelular: number;
    paritarias: { convenio: string }[];
    empleadosActivos: number;
  };
  mes: {
    liquidacion: number;
    adelantos: number;
    adelantosCantidad: number;
    cajaIngresos: number;
    cajaEgresos: number;
  };
}

function formatMoneda(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function horaAR(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fechaCorta(iso: string | null) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function saludo() {
  const h = Number(
    new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false })
  );
  return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function fechaLarga() {
  const s = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CARD = "bg-white rounded-xl border border-[#EDE0CC]";

function Stat({ label, valor, detalle, tono }: { label: string; valor: number; detalle?: string; tono?: "ok" | "alerta" }) {
  const color = tono === "alerta" && valor > 0 ? "text-red-600" : tono === "ok" ? "text-emerald-700" : "text-[#2C1810]";
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="text-xs text-[#B89070] mt-0.5">{detalle}</p>}
    </div>
  );
}

function FilaPendiente({ href, label, cantidad, detalle }: { href: string; label: string; cantidad: number; detalle?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#F3EADB] last:border-b-0 hover:bg-[#FAF7F2] transition-colors"
    >
      <div className="min-w-0">
        <p className={`text-sm font-medium ${cantidad > 0 ? "text-[#2C1810]" : "text-[#B89070]"}`}>{label}</p>
        {detalle && cantidad > 0 && <p className="text-xs text-[#8B6347] truncate">{detalle}</p>}
      </div>
      <span
        className={`shrink-0 min-w-7 text-center text-xs font-bold rounded-full px-2 py-0.5 ${
          cantidad > 0 ? "bg-amber-400 text-[#2C1810]" : "bg-[#F3EADB] text-[#B89070]"
        }`}
      >
        {cantidad}
      </span>
    </Link>
  );
}

function Aviso({ href, tono, children }: { href: string; tono: "ok" | "alerta" | "error"; children: React.ReactNode }) {
  const punto = tono === "ok" ? "bg-emerald-500" : tono === "alerta" ? "bg-amber-400" : "bg-red-500";
  return (
    <Link href={href} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#FAF7F2] transition-colors text-sm text-[#2C1810]">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${punto}`} />
      <span>{children}</span>
    </Link>
  );
}

export default function InicioPage() {
  const [data, setData] = useState<InicioData | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/inicio");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [cargar]);

  const a = data?.asistencia;
  const p = data?.pendientes;
  const av = data?.avisos;
  const m = data?.mes;
  const faltasSinAviso = a?.faltas.filter((f) => !f.justificada) ?? [];
  const wsConectado = av?.whatsapp.status === "connected";
  const sucursales = a ? Object.entries(a.porSucursal).sort((x, y) => y[1].trabajando - x[1].trabajando) : [];
  const avisosActivos =
    (av && (!wsConectado || av.sinHorario > 0 || av.sinTipoPago > 0 || av.sinCelular > 0 || av.paritarias.length > 0)) ?? false;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <PageHeader />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[#2C1810]">{saludo()}</h1>
            <p className="text-sm text-[#8B6347] mt-0.5">{fechaLarga()}</p>
          </div>
          <button onClick={cargar} className="btn btn-secondary">
            ↻ Actualizar
          </button>
        </div>

        {error && !data && (
          <div className={`${CARD} p-6 text-sm text-red-600`}>No se pudo cargar el resumen. Probá actualizar.</div>
        )}

        {!data && !error && (
          <div className={`${CARD} flex justify-center py-16`}>
            <div className="w-8 h-8 border-2 border-[#EDE0CC] border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        )}

        {data && a && p && av && m && (
          <>
            {/* ── Asistencia de hoy: números ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Trabajando ahora" valor={a.trabajando.length} tono="ok" />
              <Stat label="Fichadas hoy" valor={a.fichadas} detalle="turnos con entrada marcada" />
              <Stat
                label="Faltas hoy"
                valor={faltasSinAviso.length}
                tono="alerta"
                detalle={a.faltas.length > faltasSinAviso.length ? `+ ${a.faltas.length - faltasSinAviso.length} con aviso aprobado` : "sin aviso"}
              />
              <Stat label="Llegadas tarde" valor={a.tarde.length} tono="alerta" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start lg:grid-rows-[auto_1fr]">
              {/* ── Asistencia de hoy: detalle ── */}
              <div className={`${CARD} lg:col-span-2 overflow-hidden lg:row-start-1`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDE0CC]">
                  <h2 className="font-semibold text-[#2C1810]">Asistencia de hoy</h2>
                  <Link href="/asistencia" className="text-xs text-[#8B6347] hover:text-[#2C1810] underline underline-offset-2">
                    Ver todo →
                  </Link>
                </div>

                {sucursales.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-4 pt-3">
                    {sucursales.map(([nombre, s]) => (
                      <span key={nombre} className="text-xs rounded-full border border-[#EDE0CC] bg-[#FAF7F2] px-2.5 py-1 text-[#5C3D2E]">
                        <span className="font-semibold text-[#2C1810]">{nombre}</span> · {s.trabajando} trabajando
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 p-4">
                  <div>
                    <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Trabajando ahora</h3>
                    {a.trabajando.length === 0 ? (
                      <p className="text-sm text-[#B89070]">Nadie con turno abierto.</p>
                    ) : (
                      <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {a.trabajando.map((t, i) => (
                          <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="text-[#2C1810] truncate">
                              {t.nombre} <span className="text-[#B89070]">· {t.sucursal}</span>
                            </span>
                            <span className="text-xs text-[#8B6347] tabular-nums shrink-0">desde {horaAR(t.entrada)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Faltas</h3>
                      {a.faltas.length === 0 ? (
                        <p className="text-sm text-[#B89070]">Ninguna por ahora.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {a.faltas.map((f, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="text-[#2C1810] truncate">
                                {f.nombre} {f.sucursal && <span className="text-[#B89070]">· {f.sucursal}</span>}
                              </span>
                              <span
                                className={`text-xs shrink-0 ${f.justificada ? "text-emerald-700" : "text-red-600"}`}
                              >
                                {f.justificada ? "con aviso" : "sin aviso"} · {f.horario}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-[#8B6347] uppercase tracking-wide mb-2">Llegadas tarde</h3>
                      {a.tarde.length === 0 ? (
                        <p className="text-sm text-[#B89070]">Ninguna.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {a.tarde.map((t, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="text-[#2C1810] truncate">
                                {t.nombre} <span className="text-[#B89070]">· {t.sucursal}</span>
                              </span>
                              <span className="text-xs text-amber-700 tabular-nums shrink-0">{t.minutos} min</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 lg:col-start-3 lg:row-start-1 lg:row-span-2">
                {/* ── Pendientes ── */}
                <div className={`${CARD} overflow-hidden`}>
                  <h2 className="font-semibold text-[#2C1810] px-4 py-3 border-b border-[#EDE0CC]">Pendientes por resolver</h2>
                  <FilaPendiente
                    href="/rrhh"
                    label="Pedidos de RRHH por aprobar"
                    cantidad={p.pedidosRRHH.length}
                    detalle={p.pedidosRRHH.slice(0, 3).map((r) => `${r.nombre} (${r.tipo})`).join(", ")}
                  />
                  <FilaPendiente
                    href="/rrhh"
                    label="Certificados médicos pendientes"
                    cantidad={p.certificados.length}
                    detalle={p.certificados.slice(0, 3).map((c) => c.nombre).join(", ")}
                  />
                  <FilaPendiente
                    href="/adelantos"
                    label="Pedidos de adelanto"
                    cantidad={p.adelantosPedidos.length}
                    detalle={p.adelantosPedidos
                      .slice(0, 3)
                      .map((x) => `${x.nombre} ${formatMoneda(x.monto)}`)
                      .join(", ")}
                  />
                  <FilaPendiente
                    href="/asistencia"
                    label="Marcaciones con problemas"
                    cantidad={p.marcacionesConProblemas}
                    detalle="Fuera de rango o sin terminar"
                  />
                </div>

                {/* ── Avisos del sistema ── */}
                <div className={`${CARD} overflow-hidden`}>
                  <h2 className="font-semibold text-[#2C1810] px-4 py-3 border-b border-[#EDE0CC]">Avisos del sistema</h2>
                  <div className="py-1">
                    <Aviso href="/chat" tono={wsConectado ? "ok" : "error"}>
                      {wsConectado ? (
                        <>Bot de WhatsApp conectado</>
                      ) : (
                        <>
                          <b>Bot de WhatsApp desconectado</b> — no recibe marcaciones. Tocá para vincularlo.
                        </>
                      )}
                    </Aviso>
                    {av.sinHorario > 0 && (
                      <Aviso href="/turnos" tono="alerta">
                        {av.sinHorario} empleado{av.sinHorario > 1 ? "s" : ""} sin horario cargado: no se detectan sus faltas ni tardanzas
                      </Aviso>
                    )}
                    {av.sinTipoPago > 0 && (
                      <Aviso href="/empleados" tono="alerta">
                        {av.sinTipoPago} empleado{av.sinTipoPago > 1 ? "s" : ""} sin tipo de pago: no se pueden liquidar
                      </Aviso>
                    )}
                    {av.sinCelular > 0 && (
                      <Aviso href="/empleados" tono="alerta">
                        {av.sinCelular} empleado{av.sinCelular > 1 ? "s" : ""} sin celular registrado
                      </Aviso>
                    )}
                    {av.paritarias.map((x, i) => (
                      <Aviso key={i} href="/escalas" tono="alerta">
                        Paritaria nueva publicada: {x.convenio}
                      </Aviso>
                    ))}
                    {!avisosActivos && <p className="px-4 pb-2 text-xs text-[#B89070]">Todo en orden.</p>}
                  </div>
                </div>
              </div>

            {/* ── Números del mes ── */}
            <div className="lg:col-span-2 lg:row-start-2">
              <h2 className="text-sm font-semibold text-[#8B6347] uppercase tracking-wide mb-3">
                Este mes <span className="normal-case font-normal">(del {fechaCorta(data.inicioMes)} al {fechaCorta(data.hoy)})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/liquidacion" className={`${CARD} p-4 hover:border-[#D4A843] transition-colors`}>
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Liquidación estimada</p>
                  <p className="text-2xl font-bold text-[#2C1810] mt-1 tabular-nums">{formatMoneda(m.liquidacion)}</p>
                  <p className="text-xs text-[#B89070] mt-0.5">{av.empleadosActivos} empleados activos · hasta hoy</p>
                </Link>
                <Link href="/adelantos" className={`${CARD} p-4 hover:border-[#D4A843] transition-colors`}>
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Adelantos dados</p>
                  <p className="text-2xl font-bold text-[#2C1810] mt-1 tabular-nums">{formatMoneda(m.adelantos)}</p>
                  <p className="text-xs text-[#B89070] mt-0.5">
                    {m.adelantosCantidad} adelanto{m.adelantosCantidad === 1 ? "" : "s"}
                  </p>
                </Link>
                <Link href="/caja" className={`${CARD} p-4 hover:border-[#D4A843] transition-colors`}>
                  <p className="text-xs text-[#8B6347] uppercase tracking-wide font-medium">Caja</p>
                  <p
                    className={`text-2xl font-bold mt-1 tabular-nums ${
                      m.cajaIngresos - m.cajaEgresos < 0 ? "text-red-600" : "text-[#2C1810]"
                    }`}
                  >
                    {formatMoneda(m.cajaIngresos - m.cajaEgresos)}
                  </p>
                  <p className="text-xs text-[#B89070] mt-0.5 tabular-nums">
                    Ingresos {formatMoneda(m.cajaIngresos)} · Salidas {formatMoneda(m.cajaEgresos)}
                  </p>
                </Link>
              </div>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
