import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getConversationById, setMode } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = (await req.json()) as { mode?: string };
  if (body.mode !== "AI" && body.mode !== "HUMAN") {
    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  }

  setMode(id, body.mode);
  return NextResponse.json({ ok: true, mode: body.mode });
}
