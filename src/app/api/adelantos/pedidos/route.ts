import { NextResponse } from "next/server";
import { listPedidosAdelanto, topeParaPedidoAdelanto } from "@/lib/db";

export const dynamic = "force-dynamic";

// Pedidos de adelanto hechos por WhatsApp; los pendientes vienen con el tope
// del 20% del mes de entrega (sin contarse a sí mismos) para decidir.
export async function GET() {
  return NextResponse.json(
    listPedidosAdelanto().map((p) => ({
      ...p,
      tope: p.estado === "pendiente" ? topeParaPedidoAdelanto(p.empleado_id, p.fecha_pago, p.id) : null,
    }))
  );
}
