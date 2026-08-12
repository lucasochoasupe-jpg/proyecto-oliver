import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { deleteConversation, getConversationById } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
