import { NextRequest, NextResponse } from "next/server";
import { decidirPedidoAdelanto, enqueueOutbox, getOrCreateConversation, insertMessage, type PedidoAdelanto } from "@/lib/db";

export const dynamic = "force-dynamic";

function pesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function textoRespuesta(p: PedidoAdelanto): string {
  const motivo = p.respuesta ? `\nComentario de Administración: ${p.respuesta}` : "";
  if (p.estado === "aprobado") {
    const cambio = p.monto_aprobado !== null && p.monto_aprobado !== p.monto ? ` (pediste ${pesos(p.monto)})` : "";
    return `✅ Tu adelanto de *${pesos(p.monto_aprobado ?? p.monto)}*${cambio} fue aprobado. Lo recibís el *viernes ${fechaCorta(p.fecha_pago)}*.${motivo}`;
  }
  return `❌ Tu pedido de adelanto de ${pesos(p.monto)} para el viernes ${fechaCorta(p.fecha_pago)} no fue aprobado.${motivo}`;
}

// Aprueba (crea el adelanto, opcionalmente por un monto menor) o rechaza un
// pedido de adelanto y, si se pide, le avisa al empleado por WhatsApp.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    decision?: string;
    monto?: number;
    comentario?: string;
    notificar?: boolean;
  } | null;
  if (body?.decision !== "aprobado" && body?.decision !== "rechazado") {
    return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  }
  const monto = body.monto !== undefined ? Number(body.monto) : null;
  if (body.decision === "aprobado" && monto !== null && !(monto > 0)) {
    return NextResponse.json({ error: "El monto aprobado tiene que ser mayor a 0" }, { status: 400 });
  }
  const comentario = body.comentario?.trim() || null;

  const pedido = decidirPedidoAdelanto(Number(id), body.decision, monto, comentario);
  if (!pedido) return NextResponse.json({ error: "El pedido no existe o ya fue resuelto" }, { status: 404 });

  if (body.notificar !== false) {
    const texto = textoRespuesta(pedido);
    const convo = getOrCreateConversation(pedido.phone);
    insertMessage(convo.id, "human", texto);
    enqueueOutbox(convo.id, convo.phone, texto);
  }
  return NextResponse.json({ ok: true, pedido });
}
