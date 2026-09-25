import { NextRequest, NextResponse } from "next/server";
import {
  decidirAusenciaReportada,
  eligeGoceSueldo,
  getAusenciaReportada,
  getAusenciaReportadaPorAdminMessageId,
  requiereAprobacion,
} from "@/lib/db";
import { notificarDecision } from "@/lib/rrhh-registros";

// Aprueba o rechaza un pedido de Vacaciones / certificado de Enfermedad /
// Motivo Personal (este último, al aprobarse, con o sin goce de sueldo) y,
// si se pide, le avisa al empleado por WhatsApp. El id es el del registro del
// panel: >0 mensaje de aviso del bot, <0 carga manual (-ausencias_reportadas.id).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId === 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "aprobado" && decision !== "rechazado") {
    return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  }
  const comentario = typeof body?.comentario === "string" && body.comentario.trim() ? body.comentario.trim() : null;
  const notificar = body?.notificar !== false;
  const goceSueldo = typeof body?.goceSueldo === "boolean" ? body.goceSueldo : null;

  const ausencia = numId < 0 ? getAusenciaReportada(-numId) : getAusenciaReportadaPorAdminMessageId(numId);
  if (!ausencia) {
    return NextResponse.json({ error: "Este aviso no tiene un pedido con fechas para aprobar" }, { status: 404 });
  }
  if (!requiereAprobacion(ausencia.categoria)) {
    return NextResponse.json({ error: "Solo se aprueban Vacaciones, Enfermedad y Motivo Personal" }, { status: 400 });
  }
  if (decision === "aprobado" && eligeGoceSueldo(ausencia.categoria) && goceSueldo === null) {
    return NextResponse.json({ error: "Elegí si es con goce o sin goce de sueldo" }, { status: 400 });
  }

  const actualizada = decidirAusenciaReportada(ausencia.id, decision, comentario, goceSueldo);
  if (!actualizada) {
    return NextResponse.json({ error: "No se pudo guardar la decisión" }, { status: 500 });
  }

  const aviso = notificar ? notificarDecision(actualizada, decision, comentario) : { enviado: false };
  return NextResponse.json({ ok: true, notificado: aviso.enviado, motivoNoNotificado: aviso.motivo ?? null });
}
