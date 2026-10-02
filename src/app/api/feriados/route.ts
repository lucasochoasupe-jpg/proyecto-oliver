import { NextRequest, NextResponse } from "next/server";
import { deleteFeriado, listFeriados, upsertFeriado } from "@/lib/db";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  return NextResponse.json(listFeriados({ desde, hasta }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const fecha = body?.fecha;
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  if (typeof fecha !== "string" || !FECHA_RE.test(fecha)) {
    return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre del feriado" }, { status: 400 });
  }
  upsertFeriado(fecha, nombre);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha || !FECHA_RE.test(fecha)) {
    return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  }
  deleteFeriado(fecha);
  return NextResponse.json({ ok: true });
}
