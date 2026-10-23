// Menú del dueño en el bot: cuando escribe el número de DUENO_PHONE, el bot no
// le muestra el menú de empleados sino un resumen de la empresa, con los mismos
// cálculos que la página de Inicio del panel (src/app/api/inicio/route.ts).
// DUENO_APODO es cómo lo saluda.
import {
  calcularAusencias,
  calcularCumplimiento,
  calcularLiquidacion,
  listAdelantos,
  listAsistenciaRechazada,
  listAttendancePendientes,
  listCajaMovimientos,
  listParitariasPendientes,
  listPedidosAdelanto,
} from "./db";
import { listarRegistrosRRHH } from "./rrhh-registros";
import { AR_TZ, hoyISO, inicioDeMesISO } from "./date-ar";

const MAX_NOMBRES = 15;

export function esDueno(phone: string): boolean {
  const dueno = process.env.DUENO_PHONE?.trim();
  return Boolean(dueno) && phone === dueno;
}

function apodo(): string {
  return process.env.DUENO_APODO?.trim() || "jefe";
}

const MENU =
  "* [1] Cómo viene el día\n" +
  "* [2] Pendientes por resolver\n" +
  "* [3] Números del mes";

const VOLVER = "\n\nEscribí *menú* para ver las opciones de nuevo.";

function pesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function hora(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Lista con viñetas, cortada a MAX_NOMBRES para no mandar un mensaje eterno.
function lista(items: string[]): string {
  const visibles = items.slice(0, MAX_NOMBRES).map((i) => `• ${i}`);
  if (items.length > MAX_NOMBRES) visibles.push(`… y ${items.length - MAX_NOMBRES} más`);
  return visibles.join("\n");
}

function resumenDelDia(): string {
  const hoy = hoyISO();
  const turnos = calcularCumplimiento({ desde: hoy, hasta: hoy });
  const trabajando = turnos.filter((t) => t.en_curso).sort((a, b) => a.entrada_real - b.entrada_real);
  const tarde = turnos.filter((t) => t.estado === "tarde" || t.estado === "tarde_y_anticipada");
  const faltas = calcularAusencias({ desde: hoy, hasta: hoy }).filter((a) => !a.feriado);

  const partes = [`📊 *Hoy ${fechaCorta(hoy)}*`];

  partes.push(
    trabajando.length > 0
      ? `🟢 *Trabajando ahora (${trabajando.length})*\n` +
          lista(trabajando.map((t) => `${t.nombre} — ${t.sucursal_nombre} (desde ${hora(t.entrada_real)})`))
      : "🟢 Nadie está trabajando en este momento."
  );

  if (tarde.length > 0) {
    partes.push(
      `🕒 *Llegaron tarde (${tarde.length})*\n` +
        lista(tarde.map((t) => `${t.nombre} — ${t.sucursal_nombre} (${t.diff_entrada_min ?? 0} min)`))
    );
  }

  if (faltas.length > 0) {
    partes.push(
      `❌ *Faltaron (${faltas.length})*\n` +
        lista(
          faltas.map(
            (f) =>
              `${f.empleado_nombre}${f.sucursal_nombre ? ` — ${f.sucursal_nombre}` : ""}${f.justificada ? " (avisó)" : ""}`
          )
        )
    );
  } else {
    partes.push("❌ Sin faltas por ahora.");
  }

  return partes.join("\n\n");
}

function pendientes(): string {
  const registros = listarRegistrosRRHH();
  const pedidosRRHH = registros.filter((r) => r.estado === "pendiente");
  const certificados = registros.filter((r) => r.certificadoPendiente && !r.certificadoRecibidoEn);
  const adelantos = listPedidosAdelanto().filter((p) => p.estado === "pendiente");
  const marcaciones = listAsistenciaRechazada(true).length + listAttendancePendientes().length;
  const paritarias = listParitariasPendientes();

  const partes = ["📋 *Pendientes por resolver*"];

  if (pedidosRRHH.length > 0) {
    partes.push(
      `🗂️ *Avisos de RRHH sin aprobar (${pedidosRRHH.length})*\n` +
        lista(
          pedidosRRHH.map((r) => {
            const rango =
              r.fechaInicio && r.fechaFin
                ? r.fechaInicio === r.fechaFin
                  ? ` (${fechaCorta(r.fechaInicio)})`
                  : ` (${fechaCorta(r.fechaInicio)} al ${fechaCorta(r.fechaFin)})`
                : "";
            return `${r.nombre} — ${r.tipo}${rango}`;
          })
        )
    );
  }
  if (certificados.length > 0) {
    partes.push(
      `🩺 *Certificados que faltan (${certificados.length})*\n` + lista(certificados.map((r) => r.nombre))
    );
  }
  if (adelantos.length > 0) {
    const total = adelantos.reduce((acc, p) => acc + p.monto, 0);
    partes.push(
      `💸 *Pedidos de adelanto (${adelantos.length}, ${pesos(total)})*\n` +
        lista(adelantos.map((p) => `${p.empleado_nombre}: ${pesos(p.monto)} (viernes ${fechaCorta(p.fecha_pago)})`))
    );
  }
  if (marcaciones > 0) partes.push(`📍 Marcaciones con problemas: ${marcaciones}`);
  if (paritarias.length > 0) {
    partes.push(`📄 Paritarias nuevas sin cargar: ${paritarias.map((p) => p.convenio_nombre).join(", ")}`);
  }

  if (partes.length === 1) partes.push("✅ No hay nada pendiente.");
  return partes.join("\n\n");
}

function numerosDelMes(): string {
  const hoy = hoyISO();
  const inicioMes = inicioDeMesISO();
  const liquidacion = calcularLiquidacion({ desde: inicioMes, hasta: hoy }).reduce((acc, f) => acc + f.total, 0);
  const adelantos = listAdelantos({ desde: inicioMes, hasta: hoy });
  const caja = listCajaMovimientos({ desde: inicioMes, hasta: hoy });
  const ingresos = caja.filter((m) => m.tipo_movimiento === "ingreso").reduce((acc, m) => acc + m.importe_total, 0);
  const egresos = caja.filter((m) => m.tipo_movimiento !== "ingreso").reduce((acc, m) => acc + m.importe_total, 0);

  return (
    `💰 *Números del mes (del ${fechaCorta(inicioMes)} al ${fechaCorta(hoy)})*\n\n` +
    `• Sueldos estimados hasta hoy: ${pesos(liquidacion)}\n` +
    `• Adelantos dados: ${pesos(adelantos.reduce((acc, a) => acc + a.monto, 0))} (${adelantos.length})\n` +
    `• Caja — ingresos: ${pesos(ingresos)}\n` +
    `• Caja — egresos: ${pesos(egresos)}`
  );
}

export async function handleDueno(text: string, reply: (t: string) => Promise<void>): Promise<void> {
  const t = text.trim().toLowerCase();
  if (t === "1") return reply(resumenDelDia() + VOLVER);
  if (t === "2") return reply(pendientes() + VOLVER);
  if (t === "3") return reply(numerosDelMes() + VOLVER);
  await reply(`¡Hola, ${apodo()}! 👋 ¿Qué querés ver?\n${MENU}`);
}
