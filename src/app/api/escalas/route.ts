import { NextRequest, NextResponse } from "next/server";
import { borrarVigenciaEscala, guardarEscalas, listCategoriasConvenio, listEscalas, marcarParitariasCargadas } from "@/lib/db";

export const dynamic = "force-dynamic";

const MES_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const convenioId = Number(new URL(req.url).searchParams.get("convenio_id"));
  if (!convenioId) return NextResponse.json({ error: "Falta el convenio" }, { status: 400 });
  return NextResponse.json({ categorias: listCategoriasConvenio(convenioId), escalas: listEscalas(convenioId) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    vigente_desde?: string;
    filas?: { categoria_id: number; basico: number; no_remunerativo?: number }[];
  } | null;
  if (!body?.vigente_desde || !MES_RE.test(body.vigente_desde)) {
    return NextResponse.json({ error: "Falta el mes de vigencia" }, { status: 400 });
  }
  const filas = (body.filas ?? []).filter((f) => Number(f.categoria_id) > 0 && Number(f.basico) > 0);
  if (filas.length === 0) return NextResponse.json({ error: "No hay montos para guardar" }, { status: 400 });
  const convenios = guardarEscalas(
    body.vigente_desde,
    filas.map((f) => ({ categoria_id: Number(f.categoria_id), basico: Number(f.basico), no_remunerativo: Number(f.no_remunerativo) || 0 }))
  );
  for (const id of convenios) marcarParitariasCargadas(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const convenioId = Number(searchParams.get("convenio_id"));
  const vigenteDesde = searchParams.get("vigente_desde");
  if (!convenioId || !vigenteDesde || !MES_RE.test(vigenteDesde)) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  borrarVigenciaEscala(convenioId, vigenteDesde);
  return NextResponse.json({ ok: true });
}
