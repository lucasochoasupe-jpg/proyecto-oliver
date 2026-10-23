// Resumen semanal de pedidos de adelanto: el jueves a las 14 (hora AR), cuando
// cierran los pedidos de la semana, se le manda a Administración la lista de
// los que siguen pendientes para el viernes. Una sola vez por semana (queda
// marcado en sistema_kv). Lo corre el proceso del bot (scripts/start-bot.ts).
import { getSistemaKV, listPedidosAdelanto, setSistemaKV } from "./db";
import { avisarAdmins } from "./admin-phones";

const AR_OFFSET_SEC = 3 * 3600;

export function enviarResumenAdelantosSiCorresponde(ahoraSec: number = Math.floor(Date.now() / 1000)): void {
  const ar = new Date((ahoraSec - AR_OFFSET_SEC) * 1000);
  if (ar.getUTCDay() !== 4 || ar.getUTCHours() < 14) return; // solo jueves desde las 14

  const viernes = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + 1)).toISOString().slice(0, 10);
  const clave = `resumen_adelantos:${viernes}`;
  if (getSistemaKV(clave)) return;
  setSistemaKV(clave, String(ahoraSec));

  const pendientes = listPedidosAdelanto().filter((p) => p.estado === "pendiente" && p.fecha_pago === viernes);
  if (pendientes.length === 0) return;

  const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
  const total = pendientes.reduce((a, p) => a + p.monto, 0);
  const [, m, d] = viernes.split("-");
  const texto =
    `🕑 *Cerraron los pedidos de adelanto* para el viernes ${d}/${m}: ` +
    `${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"} por ${pesos(total)}.\n` +
    pendientes.map((p) => `• ${p.empleado_nombre}: ${pesos(p.monto)}${p.numero_vinculado ? "" : " ⚠ verificar número"}`).join("\n") +
    "\n\nAprobalos o rechazalos en el panel: Finanzas → Adelantos.";
  avisarAdmins(texto);
}
